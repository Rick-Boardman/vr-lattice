// SPDX-License-Identifier: Apache-2.0
import { resolveNodeSurfaceReach } from "./node-surface.js";
import {
  applyGraphTroikaRenderSettings,
  asHexColor,
  createBillboardTextLabel,
  createGraphTroikaText,
  disposeGraphTroikaText,
  estimateGraphTextWidthPx,
  setGraphTroikaText,
} from "./graph-mesh-builders.js";

/**
 * @typedef {{ minHorizontal: number, maxHorizontal: number, minVertical: number, maxVertical: number }} PlanarBounds
 */

/**
 * @typedef {{ THREE?: any, forward?: any, up?: any }} SphereBasisOptions
 */

/**
 * @typedef {{ THREE?: any, positions?: Map<string, any>, center?: any, radius?: number, yawSpan?: number, pitchSpan?: number, forward?: any, up?: any, flatPlane?: "xy" | "xz" | string, bounds?: PlanarBounds | null }} PlanarSphereProjectionOptions
 */

/**
 * @typedef {{
 *   cardWidth?: number,
 *   cardHeight?: number,
 *   cardLift?: number,
 *   portRadius?: number,
 *   actionHandleRadius?: number,
 *   cardCanvasWidth?: number,
 *   cardCanvasHeight?: number,
 *   cardHeaderHeightPx?: number,
 *   cardTitleFontSizePx?: number,
 *   cardTitleLineGapPx?: number,
 *   cardBadgeFontSizePx?: number,
 *   cardBodyFontSizePx?: number,
 *   cardBodyLineGapPx?: number,
 *   cardBodyStripFontSizePx?: number,
 *   cardBodyStripBarHeightPx?: number,
 *   cardBodyStripBottomPaddingPx?: number,
 *   edgeLabelFontSizePx?: number,
 *   edgeLabelWorldHeight?: number,
 *   edgeLabelMinWorldWidth?: number,
 *   flatEdgePlaneOffset?: number,
 *   flatEdgeCurvePlaneOffset?: number,
 *   flatEdgeLabelPlaneOffset?: number,
 *   flatActionEdgeAnchorMode?: string, // "fixed", "closest-side", "vertical-sides", "horizontal-sides" or "nearest-surface" (straight, outline to outline)
 *   flatActionDirectionalHandlesEnabled?: boolean,
 *   flatObstacleDetourEnabled?: boolean,
 *   flatOrientation?: string,
 *   flatPlane?: "xy" | "xz" | string,
 *   flatGroundPitch?: number,
 *   flatGroundYaw?: number,
 *   flatGroundRoll?: number,
 *   getFlatNodeRollRad?: ((node: object) => number | null) | null,
 * }} CardGraphSceneStyleOptions
 */

/**
 * @typedef {{ center?: any, radius?: number, yawSpan?: number, pitchSpan?: number, forward?: any, up?: any }} CardGraphSceneSphereOptions
 */

/**
 * @typedef {{
 *   THREE: any,
 *   Text?: Function | null,
 *   scene?: { add?: Function, remove?: Function },
 *   parent?: { add?: Function, remove?: Function } | null,
 *   graph: { nodes?: Array<object>, edges?: Array<object> },
 *   positions: Map<string, any>,
 *   camera?: any,
 *   layoutMode?: string,
 *   style?: CardGraphSceneStyleOptions,
 *   getNodeTitle?: (node: object) => string,
 *   getNodeLeadingBadge?: (node: object) => string | null,
 *   getNodeSubtitle?: (node: object) => string | null,
 *   getNodeBodyText?: (node: object) => string,
 *   getNodeBodyStrip?: (node: object) => { label?: string, detail?: string, value?: number, color?: number | string, backgroundColor?: number | string } | null,
 *   getNodeBadge?: (node: object) => string | null,
 *   getNodeAccentColor?: (node: object) => number | string,
 *   getNodeBodyColor?: (node: object) => number | string,
 *   getNodeBorderColor?: (node: object) => number | string,
 *   getInputPorts?: (node: object) => Array<object>,
 *   getOutputPorts?: (node: object) => Array<object>,
 *   getPortColor?: (port: object, context?: { node?: object, side?: string }) => number | string,
 *   getNodeShape?: (node: object) => string,
 *   getActionHandleRoles?: (node: object) => { in?: boolean, out?: boolean },
 *   getActionHandleColor?: (node: object) => number | string,
 *   getEdgeClass?: (edge: object) => string,
 *   getEdgeColor?: (edge: object) => number | string,
 *   getActionEdgeColor?: (edge: object) => number | string,
 *   getDataWireColor?: (edge: object, sourcePort?: object | null, targetPort?: object | null) => number | string,
 *   getEdgeOpacity?: (edge: object) => number,
 *   getActionEdgeOpacity?: (edge: object) => number,
 *   getDataWireOpacity?: (edge: object) => number,
 *   getEdgeLabel?: (edge: object) => string | null,
 *   getEdgeSelectionKey?: (edge: object) => string,
 *   sphere?: CardGraphSceneSphereOptions,
 * }} CardGraphSceneOptions
 */

const DEFAULT_CARD_WIDTH = 4.8;
const DEFAULT_CARD_HEIGHT = 2.5;
const DEFAULT_CARD_RADIUS = 22;
const DEFAULT_PORT_RADIUS = 0.11;
const DEFAULT_ACTION_HANDLE_RADIUS = 0.16;
const NODE_SURFACE_EDGE_GAP = 0.05;
const REVERSE_EDGE_OFFSET = 0.16;
const SELF_EDGE_STRETCH = 1.6;
const HIDDEN_ACTION_HANDLE_LAYER = 31;
const EDGE_PREVIEW_RENDER_ORDER = 100000;
const DEFAULT_HEADER_HEIGHT_PX = 86;
const DEFAULT_FLAT_PLANE = "xz";
const DEFAULT_CARD_TITLE_FONT_SIZE_PX = 68;
const DEFAULT_CARD_BADGE_FONT_SIZE_PX = 34;
const DEFAULT_CARD_BODY_FONT_SIZE_PX = 28;
const DEFAULT_EDGE_LABEL_FONT_SIZE_PX = 48;
const DEFAULT_EDGE_LABEL_WORLD_HEIGHT = 1.02;
const DEFAULT_EDGE_LABEL_MIN_WORLD_WIDTH = 5.2;
const NODE_STACK_RENDER_ORDER_STEP = 10;
const DEFAULT_CARD_BADGE_TOP_PX = 24;
const DEFAULT_CARD_BADGE_HORIZONTAL_GAP_PX = 14;
const DEFAULT_CARD_BADGE_MIN_HEIGHT_PX = 54;
const DEFAULT_CARD_BADGE_MIN_WIDTH_PX = 120;
const DEFAULT_CARD_BODY_STRIP_FONT_SIZE_PX = 22;
const DEFAULT_CARD_BODY_STRIP_BAR_HEIGHT_PX = 16;
const DEFAULT_CARD_BODY_STRIP_BOTTOM_PADDING_PX = 54;
const DEFAULT_CARD_HIGHLIGHT_COLOR = 0x78deff;
const DEFAULT_CARD_HOVER_HIGHLIGHT_COLOR = 0xe8f7ff;
const GRAPH_NODE_TITLE_FONT_FAMILY = "monospace";
const GRAPH_NODE_TITLE_FONT = buildGraphNodeTitleFont(DEFAULT_CARD_TITLE_FONT_SIZE_PX);
const GRAPH_NODE_SHAPE_TITLE_FONT = buildGraphNodeTitleFont(116);
const GRAPH_NODE_TITLE_LINE_GAP_PX = 72;
const GRAPH_NODE_SHAPE_TITLE_LINE_GAP_PX = 96;
const GRAPH_NODE_CARD_TITLE_TOP_PX = 28;
const GRAPH_NODE_CARD_TITLE_BOTTOM_PADDING_PX = 58;

const DEFAULT_PORT_COLORS = {
  flow: 0xcfd9e8,
  string: 0x9faab8,
  number: 0x61b6ff,
  bool: 0xf2ce59,
  list: 0xb26fff,
  object: 0x70d39a,
  file: 0xffb04d,
  any: 0xffffff,
};

const NODE_SHAPE_METRICS = Object.freeze({
  card: Object.freeze({ widthScale: 1, heightScale: 1 }),
  rect: Object.freeze({ widthScale: 1, heightScale: 1 }),
  round: Object.freeze({ widthScale: 0.84, heightScale: 0.84 }),
  pill: Object.freeze({ widthScale: 400 / 512, heightScale: 180 / 256 }),
  subroutine: Object.freeze({ widthScale: 0.84, heightScale: 0.84 }),
  cylinder: Object.freeze({ widthScale: 0.76, heightScale: 0.96 }),
  circle: Object.freeze({ widthScale: 0.5, heightScale: 1 }),
  "double-circle": Object.freeze({ widthScale: 0.54, heightScale: 1.02 }),
  diamond: Object.freeze({ widthScale: 420 / 512, heightScale: 200 / 256 }),
  hexagon: Object.freeze({ widthScale: 420 / 512, heightScale: 200 / 256 }),
  parallelogram: Object.freeze({ widthScale: 0.84, heightScale: 0.82 }),
  "parallelogram-alt": Object.freeze({ widthScale: 0.84, heightScale: 0.82 }),
  trapezoid: Object.freeze({ widthScale: 0.84, heightScale: 0.82 }),
  "trapezoid-alt": Object.freeze({ widthScale: 0.84, heightScale: 0.82 }),
});

const NODE_SHAPE_ALIASES = Object.freeze({
  stadium: "pill",
});

function buildDefaultEdgeSelectionKey(edge) {
  if (!edge || typeof edge !== "object") return "";
  return [
    String(edge.fromId ?? ""),
    String(edge.fromPort ?? ""),
    String(edge.toId ?? ""),
    String(edge.toPort ?? ""),
    String(edge.type ?? ""),
    String(edge.label ?? ""),
  ].join("|");
}

function isPowerOfTwoDimension(value) {
  const resolved = Math.trunc(Number(value));
  return resolved > 0 && (resolved & (resolved - 1)) === 0;
}

function configureCanvasTexture(THREE, texture, canvas) {
  const enableMipmaps = isPowerOfTwoDimension(canvas?.width) && isPowerOfTwoDimension(canvas?.height);
  texture.generateMipmaps = enableMipmaps;
  texture.minFilter = enableMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * @param {SphereBasisOptions} [options={}]
 * @returns {{ forward: any, up: any, right: any }}
 */
function resolveSphereBasis({ THREE, forward = null, up = null } = {}) {
  const resolvedUp = up?.clone?.() ?? new THREE.Vector3(0, 1, 0);
  if (resolvedUp.lengthSq() <= 1e-6) {
    resolvedUp.set(0, 1, 0);
  }
  resolvedUp.normalize();

  const resolvedForward = forward?.clone?.() ?? new THREE.Vector3(0, 0, 1);
  if (resolvedForward.lengthSq() <= 1e-6) {
    resolvedForward.set(0, 0, 1);
  }
  resolvedForward.addScaledVector(resolvedUp, -resolvedForward.dot(resolvedUp));
  if (resolvedForward.lengthSq() <= 1e-6) {
    resolvedForward.set(Math.abs(resolvedUp.y) > 0.99 ? 1 : 0, 0, Math.abs(resolvedUp.y) > 0.99 ? 0 : 1);
    resolvedForward.addScaledVector(resolvedUp, -resolvedForward.dot(resolvedUp));
  }
  resolvedForward.normalize();

  const resolvedRight = new THREE.Vector3().crossVectors(resolvedUp, resolvedForward).normalize();
  const orthonormalUp = new THREE.Vector3().crossVectors(resolvedForward, resolvedRight).normalize();
  return {
    forward: resolvedForward,
    up: orthonormalUp,
    right: resolvedRight,
  };
}

/**
 * Project planar graph positions onto an inward-facing world sphere.
 * Purpose: preserve a reusable flat scene model for desktop/mobile while deriving a world-anchored spherical scene arrangement for immersive VR.
 * @param {object} [options={}] Projection inputs.
 * @param {any} options.THREE Three.js namespace used to allocate vectors.
 * @param {Map<string, any>} options.positions Planar node positions keyed by node id.
 * @param {any} [options.center] Sphere center.
 * @param {number} [options.radius=22] Sphere radius.
 * @param {number} [options.yawSpan=Math.PI * 1.1] Total yaw arc used across the planar X range.
 * @param {number} [options.pitchSpan=Math.PI * 0.62] Total pitch arc used across the planar Z range.
 * @param {any} [options.forward] Forward vector for the front-most point of the sphere layout.
 * @param {any} [options.up] Up vector used to keep node tops level across the sphere layout.
 * @param {"xy" | "xz" | string} [options.flatPlane="xz"] Flat board plane used to interpret the planar position map.
 * @param {PlanarBounds | null} [options.bounds] Optional precomputed planar bounds.
 * @returns {Map<string, any>} Spherical positions keyed by node id.
 * Side effects: none.
 */
export function projectPlanarGraphPositionsToSphere({
  THREE,
  positions,
  center = null,
  radius = DEFAULT_CARD_RADIUS,
  yawSpan = Math.PI * 1.1,
  pitchSpan = Math.PI * 0.62,
  forward = null,
  up = null,
  flatPlane = DEFAULT_FLAT_PLANE,
  bounds = null,
} = {}) {
  if (!THREE) throw new Error("projectPlanarGraphPositionsToSphere: THREE is required");
  if (!(positions instanceof Map)) {
    throw new Error("projectPlanarGraphPositionsToSphere: positions Map is required");
  }

  const resolvedCenter = center?.clone?.() ?? new THREE.Vector3(0, 7.5, -6);
  const sphereBasis = resolveSphereBasis({ THREE, forward, up });
  const flatAxes = resolveFlatPlaneAxes(flatPlane);
  const resolvedBounds = bounds ?? computePlanarBounds(positions, flatAxes);
  const next = new Map();

  for (const [id, pos] of positions.entries()) {
    const u = normalizeRange(getAxisValue(pos, flatAxes.horizontalAxis), resolvedBounds.minHorizontal, resolvedBounds.maxHorizontal);
    const v = normalizeRange(getAxisValue(pos, flatAxes.verticalAxis), resolvedBounds.minVertical, resolvedBounds.maxVertical);
    const yaw = (u - 0.5) * yawSpan;
    const pitch = (0.5 - v) * pitchSpan;
    const cosPitch = Math.cos(pitch);
    const spherePosition = resolvedCenter.clone();
    spherePosition.addScaledVector(sphereBasis.right, Math.sin(yaw) * cosPitch * radius);
    spherePosition.addScaledVector(sphereBasis.up, Math.sin(pitch) * radius);
    spherePosition.addScaledVector(sphereBasis.forward, Math.cos(yaw) * cosPitch * radius);
    next.set(id, spherePosition);
  }

  return next;
}

/**
 * Create a shared graph scene rendered as professional card nodes with typed ports and curved edges.
 * Purpose: provide a reusable workflow-editor/diagram scene surface that supports a flat desktop/mobile board and a spherical immersive VR projection from the same graph definition.
 * @param {object} [options={}] Scene inputs.
 * @param {any} options.THREE Three.js namespace used to allocate meshes, materials, vectors, and geometries.
 * @param {Function} [options.Text] Optional Troika-compatible text constructor override used by tests and custom embedding surfaces.
 * @param {{ add?: Function, remove?: Function }} [options.scene] Scene that receives the root group when parent is omitted.
 * @param {{ add?: Function, remove?: Function }} [options.parent] Optional explicit parent for the graph root group.
 * @param {{ nodes?: Array<object>, edges?: Array<object> }} options.graph Graph model.
 * @param {Map<string, any>} options.positions Flat node positions keyed by node id.
 * @param {any} [options.camera] Optional camera used for flat-layout facing.
 * @param {string} [options.layoutMode="flat"] Initial layout mode.
 * @param {CardGraphSceneStyleOptions} [options.style] Visual overrides.
 * @param {string} [options.style.flatOrientation="billboard"] Flat-layout node orientation. Use `ground` for cards that should lie on the shared plane, `panel` for fixed front-facing cards on a flat pane, `billboard` for yaw-only camera-facing cards, or `camera` for full camera-facing billboards.
 * @param {"xy" | "xz" | string} [options.style.flatPlane="xz"] Flat board plane used for layout, bounds, and flat-mode edge curvature.
 * @param {(node: object) => string} [options.getNodeTitle] Title accessor.
 * @param {(node: object) => string | null} [options.getNodeLeadingBadge] Leading header badge accessor rendered to the left of the status badge on card nodes.
 * @param {(node: object) => string} [options.getNodeSubtitle] Subtitle accessor.
 * @param {(node: object) => string} [options.getNodeBodyText] Body-text accessor for card nodes. Defaults to the subtitle accessor for backward compatibility.
 * @param {(node: object) => { label?: string, detail?: string, value?: number, color?: number | string, backgroundColor?: number | string } | null} [options.getNodeBodyStrip] Compact operational strip accessor rendered near the bottom of card bodies.
 * @param {(node: object) => string | null} [options.getNodeBadge] Badge accessor.
 * @param {(node: object) => number | string} [options.getNodeAccentColor] Accent/header color accessor.
 * @param {(node: object) => number | string} [options.getNodeBodyColor] Body fill color accessor.
 * @param {(node: object) => number | string} [options.getNodeBorderColor] Border color accessor.
 * @param {(node: object) => Array<object>} [options.getInputPorts] Input-port accessor.
 * @param {(node: object) => Array<object>} [options.getOutputPorts] Output-port accessor.
 * @param {(port: object, context?: { node?: object, side?: string }) => number | string} [options.getPortColor] Port color accessor.
 * @param {(node: object) => string} [options.getNodeShape] Node silhouette accessor. Supported values: `card`, `pill`, `diamond`, `hexagon`.
 * @param {(node: object) => { in?: boolean, out?: boolean }} [options.getActionHandleRoles] Action-handle visibility accessor.
 * @param {(node: object) => number | string} [options.getActionHandleColor] Action-handle color accessor.
 * @param {(edge: object) => string} [options.getEdgeClass] Edge render-class accessor. Supported values: `action`, `data`.
 * @param {(edge: object) => number | string} [options.getEdgeColor] Legacy edge color accessor used as the fallback for action edges.
 * @param {(edge: object) => number | string} [options.getActionEdgeColor] Action-edge color accessor.
 * @param {(edge: object, sourcePort?: object | null, targetPort?: object | null) => number | string} [options.getDataWireColor] Data-wire color accessor.
 * @param {(edge: object) => number} [options.getEdgeOpacity] Legacy edge opacity accessor used as the fallback for action edges.
 * @param {(edge: object) => number} [options.getActionEdgeOpacity] Action-edge opacity accessor.
 * @param {(edge: object) => number} [options.getDataWireOpacity] Data-wire opacity accessor.
 * @param {(edge: object) => string | null} [options.getEdgeLabel] Edge-label accessor.
 * @param {(edge: object) => string} [options.getEdgeSelectionKey] Edge-selection key accessor used by setSelectedEdgeKey.
 * @param {CardGraphSceneSphereOptions} [options.sphere] Sphere-layout overrides.
 * @returns {{ root: any, graph: { nodes: Array<object>, edges: Array<object> }, nodeHitTargets: Array<any>, portHitTargets: Array<any>, edgeHitTargets: Array<any>, actionHandleHitTargets: Array<any>, getNodeIds: () => Array<string>, getNodeById: (nodeId: string) => object | null, getNodeMeshById: (nodeId: string) => any, setSelectedIds: (nextIds: Array<string> | Set<string> | null | undefined) => void, setSelectedEdgeKey: (nextKey: string | null | undefined) => void, setHoveredId: (nextId: string | null | undefined) => void, getFlatBounds: (targetBox?: any) => any, getNodeFlatPosition: (nodeId: string) => any, translateFlatPositions: (nodeIds: Array<string> | Set<string>, delta: any) => void, setLayoutMode: (nextMode: string) => void, getLayoutMode: () => string, syncNode: (nodeId: string | null | undefined) => void, update: (dt?: number) => void, dispose: () => void }} Shared graph-scene controller.
 * Side effects: allocates card textures, card/port/edge meshes, adds the root group to the supplied scene parent, mutates geometry when nodes move, and disposes all created resources when torn down.
 */
export function createCardGraphScene({
  THREE,
  Text = null,
  scene,
  parent = null,
  graph,
  positions,
  camera = null,
  layoutMode = "flat",
  style = {},
  getNodeTitle = (node) => String(node?.name ?? node?.label ?? node?.id ?? "Node"),
  getNodeLeadingBadge = () => null,
  getNodeSubtitle = (node) => String(node?.connector ?? node?.type ?? node?.kind ?? ""),
  getNodeBodyText = (node) => String(getNodeSubtitle(node) ?? ""),
  getNodeBodyStrip = () => null,
  getNodeBadge = (node) => String(node?.status ?? "").trim() || null,
  getNodeAccentColor = (node) => node?.accentColor ?? node?.color ?? 0x5f8fc9,
  getNodeBodyColor = () => 0x172232,
  getNodeBorderColor = (node) => getNodeAccentColor(node),
  getInputPorts = (node) => Array.isArray(node?.inputPorts) ? node.inputPorts : [],
  getOutputPorts = (node) => Array.isArray(node?.outputPorts) ? node.outputPorts : [],
  getPortColor = (port) => DEFAULT_PORT_COLORS[String(port?.type ?? "flow")] ?? DEFAULT_PORT_COLORS.flow,
  getNodeShape = () => "card",
  getActionHandleRoles = () => ({ in: false, out: false }),
  getActionHandleColor = () => 0xffffff,
  getEdgeClass = (edge) => edge?.fromPort && edge?.toPort ? "data" : "action",
  getEdgeColor = (edge) => edge?.color ?? 0x8aa4c6,
  getEdgeOpacity = () => 0.88,
  getActionEdgeColor = (edge) => getEdgeColor(edge),
  getDataWireColor = (edge) => getEdgeColor(edge),
  getActionEdgeOpacity = (edge) => getEdgeOpacity(edge),
  getDataWireOpacity = () => 0.6,
  getEdgeLabel = (edge) => String(edge?.label ?? "").trim() || null,
  getEdgeSelectionKey = buildDefaultEdgeSelectionKey,
  sphere = {},
} = {}) {
  if (!THREE) throw new Error("createCardGraphScene: THREE is required");
  if (!graph?.nodes || !graph?.edges) throw new Error("createCardGraphScene: graph with nodes and edges is required");
  if (!(positions instanceof Map)) throw new Error("createCardGraphScene: positions Map is required");

  const rootParent = parent ?? scene;
  if (!rootParent?.add) throw new Error("createCardGraphScene: scene or parent with add(...) is required");

  const root = new THREE.Group();
  root.name = "cardGraphScene";
  rootParent.add(root);

  const cardWidth = Number(style.cardWidth ?? DEFAULT_CARD_WIDTH);
  const cardHeight = Number(style.cardHeight ?? DEFAULT_CARD_HEIGHT);
  const cardLift = Number(style.cardLift ?? (cardHeight * 0.5 + 0.18));
  const portRadius = Number(style.portRadius ?? DEFAULT_PORT_RADIUS);
  const actionHandleRadius = Number(style.actionHandleRadius ?? Math.max(DEFAULT_ACTION_HANDLE_RADIUS, portRadius * 1.2));
  const cardCanvasWidth = Number(style.cardCanvasWidth ?? 1024);
  const cardCanvasHeight = Number(style.cardCanvasHeight ?? 512);
  const cardHeaderHeightPx = Number(style.cardHeaderHeightPx ?? DEFAULT_HEADER_HEIGHT_PX);
  const cardTitleFontSizePx = Number(style.cardTitleFontSizePx ?? DEFAULT_CARD_TITLE_FONT_SIZE_PX);
  const cardTitleLineGapPx = Number(style.cardTitleLineGapPx ?? Math.max(GRAPH_NODE_TITLE_LINE_GAP_PX, cardTitleFontSizePx + 4));
  const cardBadgeFontSizePx = Number(style.cardBadgeFontSizePx ?? DEFAULT_CARD_BADGE_FONT_SIZE_PX);
  const cardBodyFontSizePx = Number(style.cardBodyFontSizePx ?? DEFAULT_CARD_BODY_FONT_SIZE_PX);
  const cardBodyLineGapPx = Number(style.cardBodyLineGapPx ?? Math.max(34, cardBodyFontSizePx + 6));
  const cardBodyStripFontSizePx = Number(style.cardBodyStripFontSizePx ?? DEFAULT_CARD_BODY_STRIP_FONT_SIZE_PX);
  const cardBodyStripBarHeightPx = Number(style.cardBodyStripBarHeightPx ?? DEFAULT_CARD_BODY_STRIP_BAR_HEIGHT_PX);
  const cardBodyStripBottomPaddingPx = Number(style.cardBodyStripBottomPaddingPx ?? DEFAULT_CARD_BODY_STRIP_BOTTOM_PADDING_PX);
  const edgeLabelFontSizePx = Number(style.edgeLabelFontSizePx ?? DEFAULT_EDGE_LABEL_FONT_SIZE_PX);
  const edgeLabelWorldHeight = Number(style.edgeLabelWorldHeight ?? DEFAULT_EDGE_LABEL_WORLD_HEIGHT);
  const edgeLabelMinWorldWidth = Number(style.edgeLabelMinWorldWidth ?? DEFAULT_EDGE_LABEL_MIN_WORLD_WIDTH);
  const flatEdgePlaneOffset = Number.isFinite(style.flatEdgePlaneOffset) ? Number(style.flatEdgePlaneOffset) : NaN;
  const flatEdgeCurvePlaneOffset = Number.isFinite(style.flatEdgeCurvePlaneOffset)
    ? Number(style.flatEdgeCurvePlaneOffset)
    : flatEdgePlaneOffset;
  const flatEdgeLabelPlaneOffset = Number.isFinite(style.flatEdgeLabelPlaneOffset)
    ? Number(style.flatEdgeLabelPlaneOffset)
    : (Number.isFinite(flatEdgePlaneOffset) ? flatEdgePlaneOffset + 0.026 : NaN);
  const flatActionEdgeAnchorMode = String(style.flatActionEdgeAnchorMode ?? "fixed").trim().toLowerCase();
  // "nearest-surface": on a flat board a connection is a straight line from outline to outline, and a node has no
  // standing handles: the connect handle shows on the selected node only.
  const flatSurfaceEdgeRouting = flatActionEdgeAnchorMode === "nearest-surface";
  const flatActionDirectionalHandlesEnabled = style.flatActionDirectionalHandlesEnabled !== false;
  const flatObstacleDetourEnabled = style.flatObstacleDetourEnabled !== false;
  const flatOrientation = String(style.flatOrientation ?? "billboard").toLowerCase();
  const flatPlane = resolveFlatPlane(style.flatPlane ?? DEFAULT_FLAT_PLANE);
  const flatAxes = resolveFlatPlaneAxes(flatPlane);
  const flatGroundPitch = Number(style.flatGroundPitch ?? (-Math.PI * 0.5));
  const flatGroundYaw = Number(style.flatGroundYaw ?? 0);
  const flatGroundRoll = Number(style.flatGroundRoll ?? 0);
  const getFlatNodeRollRad = typeof style.getFlatNodeRollRad === "function"
    ? style.getFlatNodeRollRad
    : null;
  const initialSphereBasis = resolveSphereBasis({ THREE, forward: sphere.forward, up: sphere.up });
  const sphereOptions = {
    center: sphere.center?.clone?.() ?? new THREE.Vector3(0, 7.5, -6),
    radius: Number(sphere.radius ?? DEFAULT_CARD_RADIUS),
    yawSpan: Number(sphere.yawSpan ?? Math.PI * 1.1),
    pitchSpan: Number(sphere.pitchSpan ?? Math.PI * 0.62),
    forward: initialSphereBasis.forward,
    up: initialSphereBasis.up,
  };

  const flatPositions = new Map();
  for (const node of graph.nodes) {
    const pos = positions.get(node.id)?.clone?.() ?? new THREE.Vector3();
    const normalBase = getAxisValue(pos, flatAxes.normalAxis);
    setAxisValue(pos, flatAxes.normalAxis, normalBase + cardLift);
    flatPositions.set(node.id, pos);
  }
  const sphereProjectionBounds = computePlanarBounds(flatPositions, flatAxes);

  let spherePositions = projectPlanarGraphPositionsToSphere({
    THREE,
    positions: flatPositions,
    bounds: sphereProjectionBounds,
    center: sphereOptions.center,
    radius: sphereOptions.radius,
    yawSpan: sphereOptions.yawSpan,
    pitchSpan: sphereOptions.pitchSpan,
    forward: sphereOptions.forward,
    up: sphereOptions.up,
    flatPlane,
  });

  const selectedIds = new Set();
  let selectedEdgeKey = null;
  let hoveredId = null;
  let currentLayoutMode = String(layoutMode || "flat");
  let nextNodeStackOrder = 0;

  const nodeRecords = new Map();
  const edgeRecords = [];
  const nodeHitTargets = [];
  const portHitTargets = [];
  const edgeHitTargets = [];
  const actionHandleHitTargets = [];
  const tempBox = new THREE.Box3();
  const worldStart = new THREE.Vector3();
  const worldEnd = new THREE.Vector3();
  const worldSourceCenter = new THREE.Vector3();
  const worldTargetCenter = new THREE.Vector3();
  const worldStartDirection = new THREE.Vector3();
  const worldEndDirection = new THREE.Vector3();
  const controlPoint = new THREE.Vector3();
  const controlPointB = new THREE.Vector3();
  const curvePoint = new THREE.Vector3();
  const routedControlPoint = new THREE.Vector3();
  const routedControlPointB = new THREE.Vector3();
  const collisionSamplePoint = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const upVector = new THREE.Vector3(0, 1, 0);
  const flatLookTarget = new THREE.Vector3();
  const flatCameraQuaternion = new THREE.Quaternion();
  const edgeBaseColor = new THREE.Color();
  const edgeSelectedColor = new THREE.Color(0xffffff);
  const nodeHighlightColor = new THREE.Color();
  const flatBoundsMargin = new THREE.Vector3();
  const flatBoundsMin = new THREE.Vector3();
  const flatBoundsMax = new THREE.Vector3();
  const emptyBoundsMin = new THREE.Vector3();
  const emptyBoundsMax = new THREE.Vector3();

  setAxisValue(flatBoundsMargin, flatAxes.horizontalAxis, cardWidth * 0.58);
  setAxisValue(flatBoundsMargin, flatAxes.verticalAxis, cardHeight * 0.58);
  setAxisValue(flatBoundsMargin, flatAxes.normalAxis, Math.max(0.12, cardHeight * 0.08));

  setAxisValue(emptyBoundsMin, flatAxes.horizontalAxis, -2);
  setAxisValue(emptyBoundsMin, flatAxes.verticalAxis, -2);
  setAxisValue(emptyBoundsMin, flatAxes.normalAxis, cardLift - 0.2);
  setAxisValue(emptyBoundsMax, flatAxes.horizontalAxis, 2);
  setAxisValue(emptyBoundsMax, flatAxes.verticalAxis, 2);
  setAxisValue(emptyBoundsMax, flatAxes.normalAxis, cardLift + 0.2);

  const arrowGeometry = new THREE.ConeGeometry(0.12, 0.38, 10);
  const edgePreviewColor = asHexColor(style.edgePreviewColor, 0x6ea6e0);
  const edgePreviewPlane = new THREE.Plane();
  const edgePreviewNormal = new THREE.Vector3();
  let edgePreview = null;

  for (const node of graph.nodes) {
    const record = createNodeRecord({
      THREE,
      Text,
      node,
      cardWidth,
      cardHeight,
      cardCanvasWidth,
      cardCanvasHeight,
      cardHeaderHeightPx,
      cardTitleFontSizePx,
      cardTitleLineGapPx,
      cardBadgeFontSizePx,
      cardBodyFontSizePx,
      cardBodyLineGapPx,
      cardBodyStripFontSizePx,
      cardBodyStripBarHeightPx,
      cardBodyStripBottomPaddingPx,
      portRadius,
      getNodeTitle,
      getNodeLeadingBadge,
      getNodeSubtitle,
      getNodeBodyText,
      getNodeBodyStrip,
      getNodeBadge,
      getNodeAccentColor,
      getNodeBodyColor,
      getNodeBorderColor,
      getInputPorts,
      getOutputPorts,
      getPortColor,
      getNodeShape,
      getActionHandleRoles,
      getActionHandleColor,
      actionHandleRadius,
    });
    const flatPosition = flatPositions.get(node.id) ?? new THREE.Vector3();
    record.root.position.copy(flatPosition);
    root.add(record.root);
    record.stackOrder = nextNodeStackOrder;
    nextNodeStackOrder += 1;
    applyNodeStackOrder(record);
    nodeRecords.set(node.id, record);
    nodeHitTargets.push(record.cardMesh);
    for (const port of record.inputPorts) portHitTargets.push(port.mesh);
    for (const port of record.outputPorts) portHitTargets.push(port.mesh);
    for (const handle of record.actionHandles) actionHandleHitTargets.push(handle.mesh);
  }

  const edgeDirectionKeys = new Set(graph.edges.map((edge) => `${edge.fromId}\u0000${edge.toId}`));
  for (const edge of graph.edges) {
    const sourcePort = nodeRecords.get(edge.fromId)?.outputPorts.find((entry) => entry.key === String(edge.fromPort ?? ""))?.port ?? null;
    const targetPort = nodeRecords.get(edge.toId)?.inputPorts.find((entry) => entry.key === String(edge.toPort ?? ""))?.port ?? null;
    const edgeClass = resolveEdgeClass(getEdgeClass(edge));
    const edgeColor = edgeClass === "data"
      ? asHexColor(getDataWireColor(edge, sourcePort, targetPort), asHexColor(getPortColor(sourcePort ?? { type: "any" }), 0xffffff))
      : asHexColor(getActionEdgeColor(edge), asHexColor(getEdgeColor(edge), 0x8aa4c6));
    const edgeOpacity = edgeClass === "data"
      ? Number(getDataWireOpacity(edge) ?? 0.6)
      : Number(getActionEdgeOpacity(edge) ?? getEdgeOpacity(edge) ?? 0.88);
    const edgeVisualStyle = resolveEdgeVisualStyle(edge);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array((style.edgeSegments ?? 24) * 3), 3));
    const lineMaterial = edgeVisualStyle === "dash"
      ? new THREE.LineDashedMaterial({
        color: edgeColor,
        transparent: true,
        opacity: edgeOpacity,
        depthTest: true,
        depthWrite: false,
        dashSize: 0.34,
        gapSize: 0.18,
      })
      : new THREE.LineBasicMaterial({
        color: edgeColor,
        transparent: true,
        opacity: edgeOpacity,
        depthTest: true,
        depthWrite: false,
      });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.renderOrder = 0;
    line.userData.edge = edge;
    line.userData.graphHit = { kind: "edge", edge, edgeClass };

    const arrow = new THREE.Mesh(
      arrowGeometry,
      new THREE.MeshBasicMaterial({
        color: edgeColor,
        transparent: true,
        opacity: edgeOpacity,
        depthTest: true,
        depthWrite: false,
      }),
    );
    arrow.renderOrder = 0.1;
    arrow.userData.edge = edge;
    arrow.userData.graphHit = { kind: "edge", edge, edgeClass };
    arrow.visible = edgeVisualStyle !== "line";

    const reverseArrow = edgeVisualStyle === "bidirectional-arrow"
      ? new THREE.Mesh(
        arrowGeometry,
        new THREE.MeshBasicMaterial({
          color: edgeColor,
          transparent: true,
          opacity: edgeOpacity,
          depthTest: true,
          depthWrite: false,
        }),
      )
      : null;
    if (reverseArrow) {
      reverseArrow.renderOrder = 0.1;
      reverseArrow.userData.edge = edge;
      reverseArrow.userData.graphHit = { kind: "edge", edge, edgeClass };
    }

    const labelText = getEdgeLabel(edge);
    const labelSprite = labelText
      ? createEdgeLabelSprite({
        THREE,
        Text,
        text: labelText,
        fontSizePx: edgeLabelFontSizePx,
        worldHeight: edgeLabelWorldHeight,
        minWorldWidth: edgeLabelMinWorldWidth,
      })
      : null;
    if (labelSprite) {
      labelSprite.setRenderOrder?.(0.2);
      root.add(labelSprite);
    }

    root.add(line);
    root.add(arrow);
    if (reverseArrow) {
      root.add(reverseArrow);
    }
    edgeHitTargets.push(line);
    edgeRecords.push({
      edge,
      hasReverseEdge: edge.fromId !== edge.toId && edgeDirectionKeys.has(`${edge.toId}\u0000${edge.fromId}`),
      edgeClass,
      edgeVisualStyle,
      line,
      arrow,
      reverseArrow,
      labelSprite,
      labelBaseScale: labelSprite?.scale?.clone?.() ?? null,
      segments: Number(style.edgeSegments ?? 24),
      color: edgeColor,
      opacity: edgeOpacity,
    });
  }

  function getNodeById(nodeId) {
    const key = String(nodeId ?? "").trim();
    return graph.nodes.find((node) => node.id === key) || null;
  }

  function getNodeMeshById(nodeId) {
    return nodeRecords.get(String(nodeId ?? ""))?.cardMesh ?? null;
  }

  function resolveLayoutPosition(nodeId) {
    return currentLayoutMode === "sphere"
      ? spherePositions.get(nodeId) ?? flatPositions.get(nodeId) ?? new THREE.Vector3()
      : flatPositions.get(nodeId) ?? new THREE.Vector3();
  }

  function updateNodePlacement(record) {
    const position = resolveLayoutPosition(record.node.id);
    record.root.position.copy(position);

    if (currentLayoutMode === "sphere") {
      record.root.up.copy(sphereOptions.up);
      record.root.lookAt(sphereOptions.center);
    } else if (flatOrientation === "panel" || flatOrientation === "fixed") {
      const flatNodeRoll = getFlatNodeRollRad
        ? Number(getFlatNodeRollRad(record.node, currentLayoutMode)) || 0
        : 0;
      record.root.rotation.set(0, 0, flatNodeRoll);
    } else if (flatOrientation === "camera" && camera?.getWorldQuaternion) {
      camera.getWorldQuaternion(flatCameraQuaternion);
      record.root.quaternion.copy(flatCameraQuaternion);
    } else if (flatOrientation === "ground") {
      record.root.rotation.set(flatGroundPitch, flatGroundYaw, flatGroundRoll);
    } else if (camera?.getWorldPosition) {
      camera.getWorldPosition(flatLookTarget);
      flatLookTarget.y = position.y;
      record.root.lookAt(flatLookTarget);
    } else if (camera?.position) {
      flatLookTarget.copy(camera.position);
      flatLookTarget.y = position.y;
      record.root.lookAt(flatLookTarget);
    } else {
      record.root.rotation.set(0, Math.PI, 0);
    }
  }

  function collectFlatObstacleBounds(fromRecord, toRecord, majorAxis, detourAxis, startPoint, endPoint) {
    const bounds = [];
    const minMajor = Math.min(getAxisValue(startPoint, majorAxis), getAxisValue(endPoint, majorAxis));
    const maxMajor = Math.max(getAxisValue(startPoint, majorAxis), getAxisValue(endPoint, majorAxis));
    const majorPadding = Math.max(0.18, (majorAxis === flatAxes.horizontalAxis ? cardWidth : cardHeight) * 0.08);
    const detourPadding = Math.max(0.42, (detourAxis === flatAxes.horizontalAxis ? cardWidth : cardHeight) * 0.18);

    for (const candidate of nodeRecords.values()) {
      if (candidate === fromRecord || candidate === toRecord) continue;
      const metrics = getNodeShapeMetrics(candidate.shape, candidate.cardWidth ?? cardWidth, candidate.cardHeight ?? cardHeight);
      const center = candidate.root.position;
      const centerMajor = getAxisValue(center, majorAxis);
      const centerDetour = getAxisValue(center, detourAxis);
      const majorHalfSpan = (majorAxis === flatAxes.horizontalAxis ? metrics.width : metrics.height) * 0.5 + majorPadding;
      const detourHalfSpan = (detourAxis === flatAxes.horizontalAxis ? metrics.width : metrics.height) * 0.5 + detourPadding;
      const obstacleMinMajor = centerMajor - majorHalfSpan;
      const obstacleMaxMajor = centerMajor + majorHalfSpan;
      if (obstacleMaxMajor < minMajor || obstacleMinMajor > maxMajor) continue;
      bounds.push({
        minMajor: obstacleMinMajor,
        maxMajor: obstacleMaxMajor,
        minDetour: centerDetour - detourHalfSpan,
        maxDetour: centerDetour + detourHalfSpan,
        centerDetour,
      });
    }

    return bounds;
  }

  function collectCollidingFlatObstacleBounds(startPoint, endPoint, controlA, controlB, useDirectionalHandles, obstacleBounds, majorAxis, detourAxis) {
    if (!Array.isArray(obstacleBounds) || !obstacleBounds.length) return [];

    const collisions = [];
    const sampleCount = 21;
    for (const obstacle of obstacleBounds) {
      let collided = false;
      for (let index = 1; index < sampleCount - 1; index += 1) {
        const t = index / (sampleCount - 1);
        writeEdgeCurvePoint(collisionSamplePoint, startPoint, endPoint, controlA, controlB, useDirectionalHandles, t);
        const pointMajor = getAxisValue(collisionSamplePoint, majorAxis);
        if (pointMajor < obstacle.minMajor || pointMajor > obstacle.maxMajor) continue;
        const pointDetour = getAxisValue(collisionSamplePoint, detourAxis);
        if (pointDetour < obstacle.minDetour || pointDetour > obstacle.maxDetour) continue;
        collided = true;
        break;
      }
      if (collided) collisions.push(obstacle);
    }

    return collisions;
  }

  function applyFlatEdgeObstacleDetour(fromRecord, toRecord, startPoint, endPoint, controlA, controlB, useDirectionalHandles) {
    const horizontalDelta = Math.abs(getAxisValue(endPoint, flatAxes.horizontalAxis) - getAxisValue(startPoint, flatAxes.horizontalAxis));
    const verticalDelta = Math.abs(getAxisValue(endPoint, flatAxes.verticalAxis) - getAxisValue(startPoint, flatAxes.verticalAxis));
    const majorAxis = horizontalDelta >= verticalDelta ? flatAxes.horizontalAxis : flatAxes.verticalAxis;
    const detourAxis = majorAxis === flatAxes.horizontalAxis ? flatAxes.verticalAxis : flatAxes.horizontalAxis;
    const obstacleBounds = collectFlatObstacleBounds(fromRecord, toRecord, majorAxis, detourAxis, startPoint, endPoint);
    if (!obstacleBounds.length) return;

    const blockingObstacles = collectCollidingFlatObstacleBounds(
      startPoint,
      endPoint,
      controlA,
      controlB,
      useDirectionalHandles,
      obstacleBounds,
      majorAxis,
      detourAxis,
    );
    if (!blockingObstacles.length) return;

    const baselineDetour = (getAxisValue(startPoint, detourAxis) + getAxisValue(endPoint, detourAxis)) * 0.5;
    const obstacleAverageDetour = blockingObstacles.reduce((sum, obstacle) => sum + obstacle.centerDetour, 0) / blockingObstacles.length;
    const preferredSign = obstacleAverageDetour >= baselineDetour ? -1 : 1;
    const detourStep = Math.max(0.48, (detourAxis === flatAxes.horizontalAxis ? cardWidth : cardHeight) * 0.42);
    const baseMagnitude = blockingObstacles.reduce(
      (maxMagnitude, obstacle) => Math.max(
        maxMagnitude,
        Math.max(
          Math.abs(obstacle.maxDetour - baselineDetour),
          Math.abs(obstacle.minDetour - baselineDetour),
        ) + detourStep * 0.35,
      ),
      detourStep,
    );

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const magnitude = baseMagnitude + attempt * detourStep;
      for (const sign of [preferredSign, -preferredSign]) {
        routedControlPoint.copy(controlA);
        addAxisValue(routedControlPoint, detourAxis, sign * magnitude);
        routedControlPointB.copy(controlB);
        if (useDirectionalHandles) {
          addAxisValue(routedControlPointB, detourAxis, sign * magnitude);
        }
        const remainingObstacles = collectCollidingFlatObstacleBounds(
          startPoint,
          endPoint,
          routedControlPoint,
          routedControlPointB,
          useDirectionalHandles,
          obstacleBounds,
          majorAxis,
          detourAxis,
        );
        if (!remainingObstacles.length) {
          controlA.copy(routedControlPoint);
          if (useDirectionalHandles) {
            controlB.copy(routedControlPointB);
          }
          return;
        }
      }
    }
  }

  function updateEdgePlacement(record) {
    const fromRecord = nodeRecords.get(record.edge.fromId);
    const toRecord = nodeRecords.get(record.edge.toId);
    if (!fromRecord || !toRecord) return;

    const surfaceRoute = flatSurfaceEdgeRouting && currentLayoutMode === "flat";
    const selfEdge = surfaceRoute && record.edge.fromId === record.edge.toId;
    const useDirectionalHandles = surfaceRoute
      ? selfEdge
      : record.edgeClass === "data"
        || (flatActionDirectionalHandlesEnabled && (
          fromRecord.actionHandleByRole?.out
          || toRecord.actionHandleByRole?.in
          || (record.edgeClass === "action" && currentLayoutMode === "flat")
        ));

    fromRecord.cardMesh.getWorldPosition(worldSourceCenter);
    toRecord.cardMesh.getWorldPosition(worldTargetCenter);

    if (selfEdge) {
      resolveSelfEdgeAnchorWorldPosition(fromRecord, -1, worldStart);
      resolveSelfEdgeAnchorWorldPosition(fromRecord, 1, worldEnd);
    } else if (surfaceRoute) {
      resolveNodeSurfaceWorldPosition(fromRecord, worldTargetCenter, worldStart);
      resolveNodeSurfaceWorldPosition(toRecord, worldSourceCenter, worldEnd);
      if (record.hasReverseEdge) {
        // A pair running both ways would lie on one line: each keeps to its own side.
        const across = getAxisValue(worldTargetCenter, flatAxes.horizontalAxis) - getAxisValue(worldSourceCenter, flatAxes.horizontalAxis);
        const along = getAxisValue(worldTargetCenter, flatAxes.verticalAxis) - getAxisValue(worldSourceCenter, flatAxes.verticalAxis);
        const length = Math.max(1e-6, Math.hypot(across, along));
        for (const point of [worldStart, worldEnd]) {
          addAxisValue(point, flatAxes.horizontalAxis, (-along / length) * REVERSE_EDGE_OFFSET);
          addAxisValue(point, flatAxes.verticalAxis, (across / length) * REVERSE_EDGE_OFFSET);
        }
      }
    } else if (record.edgeClass === "data") {
      resolveEdgeAnchorWorldPosition(fromRecord, record.edge.fromPort, "output", worldStart);
      resolveEdgeAnchorWorldPosition(toRecord, record.edge.toPort, "input", worldEnd);
    } else {
      if (currentLayoutMode === "flat" && ["closest-side", "vertical-sides", "horizontal-sides"].includes(flatActionEdgeAnchorMode)) {
        const { fromSide, toSide } = resolveFlatActionAnchorSides(worldSourceCenter, worldTargetCenter, flatAxes, flatActionEdgeAnchorMode);
        resolveVirtualActionAnchorWorldPositionForSide(fromRecord, fromSide, worldStart);
        resolveVirtualActionAnchorWorldPositionForSide(toRecord, toSide, worldEnd);
      } else {
        resolveActionAnchorWorldPosition(fromRecord, "out", worldStart, flatAxes);
        resolveActionAnchorWorldPosition(toRecord, "in", worldEnd, flatAxes);
      }
    }

    if (currentLayoutMode === "flat" && Number.isFinite(flatEdgePlaneOffset)) {
      setAxisValue(worldStart, flatAxes.normalAxis, flatEdgePlaneOffset);
      setAxisValue(worldEnd, flatAxes.normalAxis, flatEdgePlaneOffset);
      setAxisValue(worldSourceCenter, flatAxes.normalAxis, flatEdgePlaneOffset);
      setAxisValue(worldTargetCenter, flatAxes.normalAxis, flatEdgePlaneOffset);
    }

    worldStartDirection.copy(worldStart).sub(worldSourceCenter);
    worldEndDirection.copy(worldEnd).sub(worldTargetCenter);

    if (useDirectionalHandles) {
      const edgeDistance = worldStart.distanceTo(worldEnd);
      const stretch = selfEdge
        ? SELF_EDGE_STRETCH
        : Math.max(record.edgeClass === "data" ? 0.6 : 0.9, edgeDistance * (record.edgeClass === "data" ? 0.34 : 0.28));
      if (worldStartDirection.lengthSq() <= 1e-6) {
        worldStartDirection.copy(worldEnd).sub(worldStart);
      }
      if (worldEndDirection.lengthSq() <= 1e-6) {
        worldEndDirection.copy(worldStart).sub(worldEnd);
      }
      worldStartDirection.normalize();
      worldEndDirection.normalize();
      controlPoint.copy(worldStart).addScaledVector(worldStartDirection, stretch);
      controlPointB.copy(worldEnd).addScaledVector(worldEndDirection, stretch);

      root.updateWorldMatrix(true, false);
      root.worldToLocal(worldStart);
      root.worldToLocal(worldEnd);
      root.worldToLocal(controlPoint);
      root.worldToLocal(controlPointB);

      if (currentLayoutMode === "flat" && flatObstacleDetourEnabled) {
        applyFlatEdgeObstacleDetour(fromRecord, toRecord, worldStart, worldEnd, controlPoint, controlPointB, true);
      }

      const position = record.line.geometry.getAttribute("position");
      const segmentCount = Math.max(2, record.segments);
      for (let index = 0; index < segmentCount; index += 1) {
        const t = segmentCount === 1 ? 0 : index / (segmentCount - 1);
        writeEdgeCurvePoint(curvePoint, worldStart, worldEnd, controlPoint, controlPointB, true, t);
        position.setXYZ(index, curvePoint.x, curvePoint.y, curvePoint.z);
      }
      position.needsUpdate = true;
      record.line.geometry.computeBoundingSphere?.();
      record.line.computeLineDistances?.();
    } else {
      if (currentLayoutMode === "sphere") {
        controlPoint.copy(worldStart).add(worldEnd).multiplyScalar(0.5);
        controlPoint.sub(sphereOptions.center).normalize().multiplyScalar(sphereOptions.radius * 0.24).add(sphereOptions.center);
      } else {
        controlPoint.copy(worldStart).add(worldEnd).multiplyScalar(0.5);
        if (Number.isFinite(flatEdgeCurvePlaneOffset)) {
          setAxisValue(controlPoint, flatAxes.normalAxis, flatEdgeCurvePlaneOffset);
        } else {
          addAxisValue(controlPoint, flatAxes.normalAxis, Math.max(0.45, worldStart.distanceTo(worldEnd) * 0.08));
        }
      }

      root.updateWorldMatrix(true, false);
      root.worldToLocal(worldStart);
      root.worldToLocal(worldEnd);
      root.worldToLocal(controlPoint);

      if (currentLayoutMode === "flat" && flatObstacleDetourEnabled) {
        applyFlatEdgeObstacleDetour(fromRecord, toRecord, worldStart, worldEnd, controlPoint, controlPointB, false);
      }

      const position = record.line.geometry.getAttribute("position");
      const segmentCount = Math.max(2, record.segments);
      for (let index = 0; index < segmentCount; index += 1) {
        const t = segmentCount === 1 ? 0 : index / (segmentCount - 1);
        writeEdgeCurvePoint(curvePoint, worldStart, worldEnd, controlPoint, controlPointB, false, t);
        position.setXYZ(index, curvePoint.x, curvePoint.y, curvePoint.z);
      }
      position.needsUpdate = true;
      record.line.geometry.computeBoundingSphere?.();
      record.line.computeLineDistances?.();
    }

    const position = record.line.geometry.getAttribute("position");
    const firstIndex = 0;
    const secondIndex = Math.min(1, Math.max(0, position.count - 1));
    const lastIndex = Math.max(1, position.count - 1);
    tangent.set(
      position.getX(lastIndex) - position.getX(lastIndex - 1),
      position.getY(lastIndex) - position.getY(lastIndex - 1),
      position.getZ(lastIndex) - position.getZ(lastIndex - 1),
    ).normalize();
    record.arrow.visible = record.edgeVisualStyle !== "line";
    if (record.arrow.visible) {
      record.arrow.position.set(
        position.getX(lastIndex),
        position.getY(lastIndex),
        position.getZ(lastIndex),
      );
      record.arrow.position.addScaledVector(tangent, -0.2);
      record.arrow.quaternion.setFromUnitVectors(upVector, tangent);
    }

    if (record.reverseArrow) {
      tangent.set(
        position.getX(secondIndex) - position.getX(firstIndex),
        position.getY(secondIndex) - position.getY(firstIndex),
        position.getZ(secondIndex) - position.getZ(firstIndex),
      ).normalize();
      record.reverseArrow.visible = record.edgeVisualStyle === "bidirectional-arrow";
      if (record.reverseArrow.visible) {
        record.reverseArrow.position.set(
          position.getX(firstIndex),
          position.getY(firstIndex),
          position.getZ(firstIndex),
        );
        record.reverseArrow.position.addScaledVector(tangent, 0.2);
        record.reverseArrow.quaternion.setFromUnitVectors(upVector, tangent.clone().multiplyScalar(-1));
      }
    }

    if (record.labelSprite) {
      const labelT = 0.5;
      writeEdgeCurvePoint(curvePoint, worldStart, worldEnd, controlPoint, controlPointB, useDirectionalHandles, labelT);
      record.labelSprite.position.copy(curvePoint);
      if (currentLayoutMode === "sphere") {
        addAxisValue(record.labelSprite.position, "y", 0.3);
      } else if (Number.isFinite(flatEdgeLabelPlaneOffset)) {
        setAxisValue(record.labelSprite.position, flatAxes.normalAxis, flatEdgeLabelPlaneOffset);
      } else {
        addAxisValue(record.labelSprite.position, flatAxes.normalAxis, 0.24);
      }
    }
  }

  function syncActionHandlePresentation(record, isSelected) {
    const surfaceRoute = flatSurfaceEdgeRouting && currentLayoutMode === "flat";
    for (const handle of record.actionHandles ?? []) {
      if (!handle?.mesh) continue;
      if (!surfaceRoute) {
        handle.mesh.layers.set(0);
        handle.mesh.position.copy(handle.homePosition);
        continue;
      }
      // A layer the cameras and the pick ray both skip: an unused handle is neither drawn nor clicked.
      handle.mesh.layers.set(handle.role === "out" && isSelected ? 0 : HIDDEN_ACTION_HANDLE_LAYER);
      if (handle.role === "out") {
        handle.mesh.position.set(record.shapeHalfWidth + handle.radius * 1.6, 0, handle.homePosition.z);
      }
    }
  }

  function syncHighlights() {
    for (const record of nodeRecords.values()) {
      const isSelected = selectedIds.has(record.node.id);
      const isHovered = hoveredId === record.node.id;
      syncActionHandlePresentation(record, isSelected);
      const baseAccent = asHexColor(getNodeAccentColor(record.node), 0x5f8fc9);
      const baseBorder = asHexColor(getNodeBorderColor(record.node), baseAccent);
      applyNodeDepthPriority(record, isSelected);
      if (record.shape === "card") {
        if (record.shadowMesh?.material?.color?.setHex) {
          if (isSelected) {
            nodeHighlightColor.setHex(DEFAULT_CARD_HIGHLIGHT_COLOR);
          } else if (isHovered) {
            nodeHighlightColor.setHex(DEFAULT_CARD_HOVER_HIGHLIGHT_COLOR);
          } else {
            nodeHighlightColor.setHex(baseBorder);
            nodeHighlightColor.lerp(edgeSelectedColor, 0.16);
          }
          record.shadowMesh.material.color.setHex(nodeHighlightColor.getHex());
        }
        record.shadowMesh.visible = isSelected || isHovered;
        record.shadowMesh.material.opacity = isSelected ? 0.82 : isHovered ? 0.44 : 0.08;
        record.shadowMesh.scale.setScalar(isSelected ? 1.035 : isHovered ? 1.018 : 1);
        record.cardMesh.scale.setScalar(1);
        continue;
      }
        const decoratedShapeTexture = shouldUseDecoratedShapeTexture(record.shape);
      const scale = isSelected ? 1.03 : isHovered ? 1.015 : 1;
        if (decoratedShapeTexture) {
          record.shadowMesh.visible = false;
          record.shadowMesh.material.opacity = 0;
          record.shadowMesh.scale.setScalar(1);
          record.cardMesh.scale.setScalar(scale);
          record.labelMesh?.scale?.setScalar(1);
          continue;
        }
      record.shadowMesh.visible = true;
      record.shadowMesh.material.opacity = 1;
      record.shadowMesh.scale.setScalar(scale);
      record.cardMesh.scale.setScalar(1);
      record.labelMesh?.scale?.setScalar(1);
    }

    for (const record of edgeRecords) {
      const edgeKey = getEdgeSelectionKey(record.edge);
      const isExplicitlySelectedEdge = !!selectedEdgeKey && edgeKey === selectedEdgeKey;
      const isMultiSelectedEdge = !selectedEdgeKey
        && selectedIds.size > 1
        && selectedIds.has(String(record.edge?.fromId ?? ""))
        && selectedIds.has(String(record.edge?.toId ?? ""));
      const isSelectedEdge = isExplicitlySelectedEdge || isMultiSelectedEdge;
      edgeBaseColor.setHex(asHexColor(record.color, 0xffffff));

      if (record.line?.material?.color?.copy) {
        record.line.material.color.copy(edgeBaseColor);
        if (isSelectedEdge) {
          record.line.material.color.lerp(edgeSelectedColor, isExplicitlySelectedEdge ? 0.58 : 0.34);
        }
      }
      if (record.arrow?.material?.color?.copy) {
        record.arrow.material.color.copy(edgeBaseColor);
        if (isSelectedEdge) {
          record.arrow.material.color.lerp(edgeSelectedColor, isExplicitlySelectedEdge ? 0.58 : 0.34);
        }
      }
      if (record.reverseArrow?.material?.color?.copy) {
        record.reverseArrow.material.color.copy(edgeBaseColor);
        if (isSelectedEdge) {
          record.reverseArrow.material.color.lerp(edgeSelectedColor, isExplicitlySelectedEdge ? 0.58 : 0.34);
        }
      }
      if (record.line?.material) {
        record.line.material.opacity = isSelectedEdge
          ? Math.min(1, Number(record.opacity ?? 0.88) + (isExplicitlySelectedEdge ? 0.22 : 0.14))
          : Number(record.opacity ?? 0.88);
      }
      if (record.arrow?.material) {
        record.arrow.material.opacity = isSelectedEdge
          ? Math.min(1, Number(record.opacity ?? 0.88) + (isExplicitlySelectedEdge ? 0.22 : 0.14))
          : Number(record.opacity ?? 0.88);
      }
      if (record.arrow?.scale?.setScalar) {
        record.arrow.scale.setScalar(isExplicitlySelectedEdge ? 1.08 : isMultiSelectedEdge ? 1.04 : 1);
      }
      if (record.reverseArrow?.material) {
        record.reverseArrow.material.opacity = isSelectedEdge
          ? Math.min(1, Number(record.opacity ?? 0.88) + (isExplicitlySelectedEdge ? 0.22 : 0.14))
          : Number(record.opacity ?? 0.88);
      }
      if (record.reverseArrow?.scale?.setScalar) {
        record.reverseArrow.scale.setScalar(isExplicitlySelectedEdge ? 1.08 : isMultiSelectedEdge ? 1.04 : 1);
      }
      record.line.renderOrder = isExplicitlySelectedEdge ? 0.45 : isMultiSelectedEdge ? 0.3 : 0;
      record.arrow.renderOrder = isExplicitlySelectedEdge ? 0.55 : isMultiSelectedEdge ? 0.4 : 0.1;
      if (record.reverseArrow) {
        record.reverseArrow.renderOrder = isExplicitlySelectedEdge ? 0.55 : isMultiSelectedEdge ? 0.4 : 0.1;
      }
      if (record.labelSprite) {
        record.labelSprite.setRenderOrder?.(isExplicitlySelectedEdge ? 0.65 : isMultiSelectedEdge ? 0.5 : 0.2);
        if (record.labelBaseScale && record.labelSprite.scale?.copy) {
          record.labelSprite.scale.copy(record.labelBaseScale);
          if (isSelectedEdge) {
            record.labelSprite.scale.multiplyScalar(isExplicitlySelectedEdge ? 1.08 : 1.04);
          }
        } else if (record.labelSprite.scale?.setScalar) {
          record.labelSprite.scale.setScalar(isExplicitlySelectedEdge ? 1.08 : isMultiSelectedEdge ? 1.04 : 1);
        }
      }
    }
  }

  function applyMaterialDepthSettings(material, depthTest, depthWrite) {
    if (!material) return;
    material.depthTest = !!depthTest;
    material.depthWrite = !!depthWrite;
  }

  function applyObjectDepthSettings(object3d, depthTest, depthWrite) {
    if (!object3d) return;
    const materials = Array.isArray(object3d.material)
      ? object3d.material
      : [object3d.material];
    for (const material of materials) {
      applyMaterialDepthSettings(material, depthTest, depthWrite);
    }
  }

  function resolveObjectDepthSetting(object3d, key, fallback) {
    if (typeof object3d?.userData?.[key] === "boolean") {
      return object3d.userData[key];
    }
    return fallback;
  }

  function applyNodeDepthPriority(record, ignoreSceneDepth) {
    if (!record) return;

    const shadowDepthTest = ignoreSceneDepth
      ? false
      : resolveObjectDepthSetting(record.shadowMesh, "graphBaseDepthTest", true);
    const shadowDepthWrite = ignoreSceneDepth
      ? false
      : resolveObjectDepthSetting(record.shadowMesh, "graphBaseDepthWrite", true);
    applyObjectDepthSettings(record.shadowMesh, shadowDepthTest, shadowDepthWrite);

    const cardDepthTest = ignoreSceneDepth
      ? false
      : resolveObjectDepthSetting(record.cardMesh, "graphBaseDepthTest", true);
    const cardDepthWrite = ignoreSceneDepth
      ? false
      : resolveObjectDepthSetting(record.cardMesh, "graphBaseDepthWrite", true);
    applyObjectDepthSettings(record.cardMesh, cardDepthTest, cardDepthWrite);

    for (const textMesh of Object.values(record.textMeshes ?? {})) {
      if (!textMesh) continue;
      const baseDepthTest = typeof textMesh.userData?.graphBaseDepthTest === "boolean"
        ? textMesh.userData.graphBaseDepthTest
        : textMesh.userData?.graphTroikaDepthTest;
      const baseDepthWrite = typeof textMesh.userData?.graphBaseDepthWrite === "boolean"
        ? textMesh.userData.graphBaseDepthWrite
        : textMesh.userData?.graphTroikaDepthWrite;
      applyGraphTroikaRenderSettings(textMesh, {
        depthTest: ignoreSceneDepth ? false : !!baseDepthTest,
        depthWrite: ignoreSceneDepth ? false : !!baseDepthWrite,
        renderOrder: textMesh.renderOrder,
      });
    }

    for (const port of [...record.inputPorts, ...record.outputPorts]) {
      if (!port?.mesh) continue;
      const baseDepthTest = resolveObjectDepthSetting(port.mesh, "graphBaseDepthTest", true);
      const baseDepthWrite = resolveObjectDepthSetting(port.mesh, "graphBaseDepthWrite", false);
      applyObjectDepthSettings(port.mesh, ignoreSceneDepth ? false : baseDepthTest, ignoreSceneDepth ? false : baseDepthWrite);
    }

    for (const handle of record.actionHandles ?? []) {
      if (!handle?.mesh) continue;
      const baseDepthTest = resolveObjectDepthSetting(handle.mesh, "graphBaseDepthTest", true);
      const baseDepthWrite = resolveObjectDepthSetting(handle.mesh, "graphBaseDepthWrite", false);
      applyObjectDepthSettings(handle.mesh, ignoreSceneDepth ? false : baseDepthTest, ignoreSceneDepth ? false : baseDepthWrite);
    }
  }

  function applyNodeStackOrder(record) {
    if (!record) return;
    const renderBase = Math.max(0, Number(record.stackOrder) || 0) * NODE_STACK_RENDER_ORDER_STEP;
    record.root.renderOrder = renderBase;
    record.textRoot.renderOrder = renderBase;
    record.shadowMesh.renderOrder = renderBase + 1;
    record.cardMesh.renderOrder = renderBase + 2;
    for (const textMesh of Object.values(record.textMeshes ?? {})) {
      if (!textMesh) continue;
      const baseRenderOrder = Number(textMesh.userData?.graphBaseRenderOrder);
      const resolvedRenderOrder = renderBase + (Number.isFinite(baseRenderOrder) ? baseRenderOrder : 2.4);
      textMesh.renderOrder = resolvedRenderOrder;
      applyGraphTroikaRenderSettings(textMesh, {
        depthTest: textMesh.userData?.graphTroikaDepthTest,
        depthWrite: textMesh.userData?.graphTroikaDepthWrite,
        renderOrder: resolvedRenderOrder,
      });
    }
    for (const port of [...record.inputPorts, ...record.outputPorts]) {
      if (!port?.mesh) continue;
      const baseRenderOrder = Number(port.mesh.userData?.graphBaseRenderOrder);
      port.mesh.renderOrder = renderBase + (Number.isFinite(baseRenderOrder) ? baseRenderOrder : 3);
    }
    for (const handle of record.actionHandles ?? []) {
      if (!handle?.mesh) continue;
      const baseRenderOrder = Number(handle.mesh.userData?.graphBaseRenderOrder);
      handle.mesh.renderOrder = renderBase + (Number.isFinite(baseRenderOrder) ? baseRenderOrder : 3);
    }
  }

  function bringNodeIdsToFront(nodeIds) {
    const ids = nodeIds instanceof Set ? [...nodeIds] : Array.isArray(nodeIds) ? nodeIds : [nodeIds];
    for (const rawId of ids) {
      const record = nodeRecords.get(String(rawId ?? ""));
      if (!record) continue;
      record.stackOrder = nextNodeStackOrder;
      nextNodeStackOrder += 1;
      applyNodeStackOrder(record);
    }
  }

  function syncNode(nodeId) {
    const record = nodeRecords.get(String(nodeId ?? ""));
    if (!record) return;
    updateCardTexture({
      record,
      getNodeTitle,
      getNodeLeadingBadge,
      getNodeSubtitle,
      getNodeBodyText,
      getNodeBodyStrip,
      getNodeBadge,
      getNodeAccentColor,
      getNodeBodyColor,
      getNodeBorderColor,
    });
    syncHighlights();
    for (const edgeRecord of edgeRecords) {
      if (edgeRecord.edge.fromId === record.node.id || edgeRecord.edge.toId === record.node.id) {
        updateEdgePlacement(edgeRecord);
      }
    }
  }

  function setSelectedIds(nextIds) {
    selectedIds.clear();
    if (Array.isArray(nextIds) || nextIds instanceof Set) {
      for (const id of nextIds) {
        if (id != null) selectedIds.add(String(id));
      }
    } else if (nextIds != null) {
      selectedIds.add(String(nextIds));
    }
    if (selectedIds.size > 0) {
      bringNodeIdsToFront(selectedIds);
    }
    syncHighlights();
  }

  function setSelectedEdgeKey(nextKey) {
    selectedEdgeKey = nextKey != null ? String(nextKey) : null;
    syncHighlights();
  }

  function setHoveredId(nextId) {
    hoveredId = nextId != null ? String(nextId) : null;
    syncHighlights();
  }

  function rebuildSpherePositions() {
    spherePositions = projectPlanarGraphPositionsToSphere({
      THREE,
      positions: flatPositions,
      bounds: sphereProjectionBounds,
      center: sphereOptions.center,
      radius: sphereOptions.radius,
      yawSpan: sphereOptions.yawSpan,
      pitchSpan: sphereOptions.pitchSpan,
      forward: sphereOptions.forward,
      up: sphereOptions.up,
      flatPlane,
    });
  }

  function setSphereCenter(nextCenter) {
    if (!nextCenter?.x && nextCenter?.x !== 0) return false;
    const nextX = Number(nextCenter.x);
    const nextY = Number(nextCenter.y);
    const nextZ = Number(nextCenter.z);
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY) || !Number.isFinite(nextZ)) {
      return false;
    }
    if (
      Math.abs(sphereOptions.center.x - nextX) <= 1e-6
      && Math.abs(sphereOptions.center.y - nextY) <= 1e-6
      && Math.abs(sphereOptions.center.z - nextZ) <= 1e-6
    ) {
      return false;
    }
    sphereOptions.center.set(nextX, nextY, nextZ);
    rebuildSpherePositions();
    return true;
  }

  function setSphereRadius(nextRadius) {
    const resolvedRadius = Number(nextRadius);
    if (!Number.isFinite(resolvedRadius) || resolvedRadius <= 0) {
      return false;
    }
    if (Math.abs(sphereOptions.radius - resolvedRadius) <= 1e-6) {
      return false;
    }
    sphereOptions.radius = resolvedRadius;
    rebuildSpherePositions();
    return true;
  }

  function setSphereBasis({ forward = null, up = null } = {}) {
    const nextBasis = resolveSphereBasis({
      THREE,
      forward: forward ?? sphereOptions.forward,
      up: up ?? sphereOptions.up,
    });
    if (
      sphereOptions.forward.distanceToSquared(nextBasis.forward) <= 1e-8
      && sphereOptions.up.distanceToSquared(nextBasis.up) <= 1e-8
    ) {
      return false;
    }
    sphereOptions.forward.copy(nextBasis.forward);
    sphereOptions.up.copy(nextBasis.up);
    rebuildSpherePositions();
    return true;
  }

  function translateFlatPositions(nodeIds, delta) {
    const resolvedDelta = delta?.clone?.() ?? new THREE.Vector3();
    const ids = nodeIds instanceof Set ? [...nodeIds] : Array.isArray(nodeIds) ? nodeIds : [];
    for (const rawId of ids) {
      const id = String(rawId ?? "");
      const pos = flatPositions.get(id);
      if (!pos) continue;
      pos.add(resolvedDelta);
    }
    rebuildSpherePositions();
    for (const record of nodeRecords.values()) {
      updateNodePlacement(record);
    }
    for (const edgeRecord of edgeRecords) {
      updateEdgePlacement(edgeRecord);
    }
  }

  function getFlatBounds(targetBox = null) {
    const box = targetBox ?? tempBox.clone();
    box.makeEmpty();
    for (const pos of flatPositions.values()) {
      flatBoundsMin.copy(pos).sub(flatBoundsMargin);
      flatBoundsMax.copy(pos).add(flatBoundsMargin);
      box.expandByPoint(flatBoundsMin);
      box.expandByPoint(flatBoundsMax);
    }
    if (box.isEmpty()) {
      box.expandByPoint(emptyBoundsMin);
      box.expandByPoint(emptyBoundsMax);
    }
    return box;
  }

  function setLayoutMode(nextMode) {
    const resolvedMode = String(nextMode ?? "flat").trim().toLowerCase() === "sphere" ? "sphere" : "flat";
    if (resolvedMode === currentLayoutMode) return;
    currentLayoutMode = resolvedMode;
    for (const record of nodeRecords.values()) {
      updateNodePlacement(record);
    }
    for (const edgeRecord of edgeRecords) {
      updateEdgePlacement(edgeRecord);
    }
  }

  function hideEdgePreview() {
    if (!edgePreview) return;
    edgePreview.line.visible = false;
    edgePreview.arrow.visible = false;
  }

  function ensureEdgePreview() {
    if (edgePreview) return edgePreview;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({
      color: edgePreviewColor,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      dashSize: 0.3,
      gapSize: 0.16,
    }));
    const arrow = new THREE.Mesh(arrowGeometry, new THREE.MeshBasicMaterial({
      color: edgePreviewColor,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    }));
    line.frustumCulled = false;
    line.renderOrder = EDGE_PREVIEW_RENDER_ORDER;
    arrow.renderOrder = EDGE_PREVIEW_RENDER_ORDER;
    root.add(line);
    root.add(arrow);
    edgePreview = { line, arrow };
    return edgePreview;
  }

  /**
   * Draw the connection a person is making: from the source node's outline to the pointer, or to a target node's outline.
   *
   * @param {{ fromId: string, ray: object, targetId?: string | null } | null} preview `ray` is the pointer's world ray; null hides the line.
   */
  function setEdgePreview(preview) {
    const fromRecord = preview ? nodeRecords.get(String(preview.fromId ?? "")) : null;
    if (!fromRecord || !preview.ray) {
      hideEdgePreview();
      return;
    }
    fromRecord.cardMesh.getWorldPosition(worldSourceCenter);
    const targetKey = String(preview.targetId ?? "");
    const targetRecord = targetKey && targetKey !== String(preview.fromId) ? nodeRecords.get(targetKey) : null;
    if (targetRecord) {
      targetRecord.cardMesh.getWorldPosition(worldTargetCenter);
      resolveNodeSurfaceWorldPosition(targetRecord, worldSourceCenter, worldEnd);
    } else {
      edgePreviewNormal.set(0, 0, 1).transformDirection(fromRecord.cardMesh.matrixWorld);
      edgePreviewPlane.setFromNormalAndCoplanarPoint(edgePreviewNormal, worldSourceCenter);
      if (!preview.ray.intersectPlane(edgePreviewPlane, worldEnd)) {
        hideEdgePreview();
        return;
      }
      worldTargetCenter.copy(worldEnd);
    }
    resolveNodeSurfaceWorldPosition(fromRecord, worldTargetCenter, worldStart);
    if (!targetRecord && worldEnd.distanceToSquared(worldSourceCenter) <= worldStart.distanceToSquared(worldSourceCenter)) {
      hideEdgePreview(); // still inside the source node
      return;
    }
    root.updateWorldMatrix(true, false);
    root.worldToLocal(worldStart);
    root.worldToLocal(worldEnd);
    const { line, arrow } = ensureEdgePreview();
    const position = line.geometry.getAttribute("position");
    position.setXYZ(0, worldStart.x, worldStart.y, worldStart.z);
    position.setXYZ(1, worldEnd.x, worldEnd.y, worldEnd.z);
    position.needsUpdate = true;
    line.computeLineDistances();
    tangent.copy(worldEnd).sub(worldStart).normalize();
    arrow.position.copy(worldEnd).addScaledVector(tangent, -0.2);
    arrow.quaternion.setFromUnitVectors(upVector, tangent);
    line.visible = true;
    arrow.visible = true;
  }

  function update() {
    for (const record of nodeRecords.values()) {
      updateNodePlacement(record);
    }
    for (const edgeRecord of edgeRecords) {
      updateEdgePlacement(edgeRecord);
    }
    syncHighlights();
  }

  update();

  return {
    root,
    graph,
    nodeHitTargets,
    portHitTargets,
    edgeHitTargets,
    actionHandleHitTargets,
    getNodeIds: () => graph.nodes.map((node) => node.id),
    getNodeById,
    getNodeMeshById,
    bringNodeIdsToFront,
    setSelectedIds,
    setSelectedEdgeKey,
    setHoveredId,
    setEdgePreview,
    getFlatBounds,
    getNodeFlatPosition: (nodeId) => flatPositions.get(String(nodeId ?? ""))?.clone?.() ?? null,
    translateFlatPositions,
    setSphereCenter,
    getSphereCenter: (target = null) => target?.copy ? target.copy(sphereOptions.center) : sphereOptions.center.clone(),
    setSphereRadius,
    getSphereRadius: () => sphereOptions.radius,
    setSphereBasis,
    getSphereBasis: () => ({
      forward: sphereOptions.forward.clone(),
      up: sphereOptions.up.clone(),
      right: new THREE.Vector3().crossVectors(sphereOptions.up, sphereOptions.forward).normalize(),
    }),
    setLayoutMode,
    getLayoutMode: () => currentLayoutMode,
    syncNode,
    update,
    dispose() {
      rootParent.remove?.(root);
      arrowGeometry.dispose?.();
      edgePreview?.line.geometry?.dispose?.();
      edgePreview?.line.material?.dispose?.();
      edgePreview?.arrow.material?.dispose?.();
      for (const record of nodeRecords.values()) {
        disposeNodeRecord(record);
      }
      for (const edgeRecord of edgeRecords) {
        edgeRecord.line.geometry?.dispose?.();
        edgeRecord.line.material?.dispose?.();
        edgeRecord.arrow.geometry?.dispose?.();
        edgeRecord.arrow.material?.dispose?.();
        edgeRecord.reverseArrow?.geometry?.dispose?.();
        edgeRecord.reverseArrow?.material?.dispose?.();
        edgeRecord.labelSprite?.dispose?.();
      }
    },
  };
}

function createNodeRecord({
  THREE,
  Text,
  node,
  cardWidth,
  cardHeight,
  cardCanvasWidth,
  cardCanvasHeight,
  cardHeaderHeightPx,
  cardTitleFontSizePx,
  cardTitleLineGapPx,
  cardBadgeFontSizePx,
  cardBodyFontSizePx,
  cardBodyLineGapPx,
  cardBodyStripFontSizePx,
  cardBodyStripBarHeightPx,
  cardBodyStripBottomPaddingPx,
  portRadius,
  getNodeTitle,
  getNodeLeadingBadge,
  getNodeSubtitle,
  getNodeBodyText,
  getNodeBodyStrip,
  getNodeBadge,
  getNodeAccentColor,
  getNodeBodyColor,
  getNodeBorderColor,
  getInputPorts,
  getOutputPorts,
  getPortColor,
  getNodeShape,
  getActionHandleRoles,
  getActionHandleColor,
  actionHandleRadius,
}) {
  const shape = normalizeNodeShape(getNodeShape(node));
  const shapeMetrics = getNodeShapeMetrics(shape, cardWidth, cardHeight);
  const root = new THREE.Group();
  root.name = `card-node:${node.id}`;
  const textRoot = new THREE.Group();
  textRoot.name = `card-node-text:${node.id}`;

  const canvas = document.createElement("canvas");
  canvas.width = cardCanvasWidth;
  canvas.height = cardCanvasHeight;
  const texture = new THREE.CanvasTexture(canvas);
  configureCanvasTexture(THREE, texture, canvas);

  const shadowMesh = new THREE.Mesh(
    shape === "card"
      ? createRoundedCardGeometry({
        THREE,
        width: shapeMetrics.width * 1.028,
        height: shapeMetrics.height * 1.04,
      })
      : createNodeShapeGeometry({
        THREE,
        shape,
        width: shapeMetrics.width * 1.03,
        height: shapeMetrics.height * 1.04,
      }),
    new THREE.MeshBasicMaterial({ color: shape === "card" ? 0x05080d : 0xffffff, transparent: true, opacity: shape === "card" ? 0.38 : 1 }),
  );
  shadowMesh.visible = shape !== "card";
  shadowMesh.position.z = shape === "card" ? -0.04 : -0.01;
  shadowMesh.renderOrder = 1;
  shadowMesh.userData.graphBaseDepthTest = true;
  shadowMesh.userData.graphBaseDepthWrite = true;
  shadowMesh.userData.id = node.id;
  shadowMesh.userData.node = node;

  const cardMesh = new THREE.Mesh(
    createNodeShapeGeometry({
      THREE,
      shape,
      width: shapeMetrics.width,
      height: shapeMetrics.height,
    }),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: true }),
  );
  cardMesh.renderOrder = 2;
  cardMesh.userData.graphBaseDepthTest = true;
  cardMesh.userData.graphBaseDepthWrite = true;
  cardMesh.userData.id = node.id;
  cardMesh.userData.node = node;
  cardMesh.userData.graphHit = { kind: "node", id: node.id, node };

  const textMeshes = createNodeTextMeshes({ Text, nodeId: node.id });

  root.add(shadowMesh);
  root.add(cardMesh);
  root.add(textRoot);
  for (const textMesh of Object.values(textMeshes)) {
    if (textMesh) textRoot.add(textMesh);
  }

  const inputPorts = createPorts({
    THREE,
    node,
    ports: getInputPorts(node),
    side: "input",
    anchorWidth: cardWidth,
    anchorHeight: cardHeight,
    portRadius,
    getPortColor,
  });
  const outputPorts = createPorts({
    THREE,
    node,
    ports: getOutputPorts(node),
    side: "output",
    anchorWidth: cardWidth,
    anchorHeight: cardHeight,
    portRadius,
    getPortColor,
  });

  const actionHandles = createActionHandles({
    THREE,
    node,
    anchorWidth: cardWidth,
    anchorHeight: cardHeight,
    actionHandleRadius,
    getActionHandleRoles,
    getActionHandleColor,
  });

  for (const port of inputPorts) root.add(port.mesh);
  for (const port of outputPorts) root.add(port.mesh);
  for (const handle of actionHandles) root.add(handle.mesh);

  const record = {
    node,
    root,
    canvas,
    texture,
    shadowMesh,
    cardMesh,
    textRoot,
    textMeshes,
    labelMesh: textMeshes.shapeTitleText,
    cardWidth,
    cardHeight,
    shapeHalfWidth: shapeMetrics.width * 0.5,
    shapeHalfHeight: shapeMetrics.height * 0.5,
    actionHandleRadius,
    cardHeaderHeightPx,
    cardTitleFontSizePx,
    cardTitleFont: buildGraphNodeTitleFont(cardTitleFontSizePx),
    cardTitleLineGapPx,
    cardBadgeFontSizePx,
    cardBadgeFont: buildGraphNodeTitleFont(cardBadgeFontSizePx),
    cardBodyFontSizePx,
    cardBodyFont: `${Math.round(cardBodyFontSizePx)}px monospace`,
    cardBodyLineGapPx,
    cardBodyStripFontSizePx,
    cardBodyStripBarHeightPx,
    cardBodyStripBottomPaddingPx,
    shape,
    inputPorts,
    outputPorts,
    actionHandles,
    actionHandleByRole: Object.fromEntries(actionHandles.map((entry) => [entry.role, entry])),
  };

  updateCardTexture({
    record,
    getNodeTitle,
    getNodeLeadingBadge,
    getNodeSubtitle,
    getNodeBodyText,
    getNodeBodyStrip,
    getNodeBadge,
    getNodeAccentColor,
    getNodeBodyColor,
    getNodeBorderColor,
  });

  return record;
}

function createNodeTextMeshes({ Text, nodeId }) {
  const titleText = createGraphTroikaText({
    Text,
    color: 0xffffff,
    fontSize: 0.18,
    fontWeight: "bold",
    textAlign: "left",
    anchorX: "left",
    anchorY: "top",
    depthTest: true,
    depthWrite: false,
    renderOrder: 2.42,
  });
  titleText.userData.graphTextRole = "title";
  titleText.userData.nodeId = nodeId;
  titleText.userData.graphBaseRenderOrder = 2.42;
  titleText.userData.graphBaseDepthTest = true;
  titleText.userData.graphBaseDepthWrite = false;

  const leadingBadgeText = createGraphTroikaText({
    Text,
    color: 0xeaf0f6,
    fontSize: 0.1,
    fontWeight: "bold",
    textAlign: "center",
    anchorX: "center",
    anchorY: "middle",
    depthTest: true,
    depthWrite: false,
    renderOrder: 2.43,
  });
  leadingBadgeText.userData.graphTextRole = "leading-badge";
  leadingBadgeText.userData.nodeId = nodeId;
  leadingBadgeText.userData.graphBaseRenderOrder = 2.43;
  leadingBadgeText.userData.graphBaseDepthTest = true;
  leadingBadgeText.userData.graphBaseDepthWrite = false;

  const statusBadgeText = createGraphTroikaText({
    Text,
    color: 0xeaf0f6,
    fontSize: 0.1,
    fontWeight: "bold",
    textAlign: "center",
    anchorX: "center",
    anchorY: "middle",
    depthTest: true,
    depthWrite: false,
    renderOrder: 2.43,
  });
  statusBadgeText.userData.graphTextRole = "status-badge";
  statusBadgeText.userData.nodeId = nodeId;
  statusBadgeText.userData.graphBaseRenderOrder = 2.43;
  statusBadgeText.userData.graphBaseDepthTest = true;
  statusBadgeText.userData.graphBaseDepthWrite = false;

  const bodyText = createGraphTroikaText({
    Text,
    color: 0x9ec1dd,
    fontSize: 0.1,
    textAlign: "left",
    anchorX: "left",
    anchorY: "top",
    depthTest: true,
    depthWrite: false,
    renderOrder: 2.4,
  });
  bodyText.userData.graphTextRole = "body";
  bodyText.userData.nodeId = nodeId;
  bodyText.userData.graphBaseRenderOrder = 2.4;
  bodyText.userData.graphBaseDepthTest = true;
  bodyText.userData.graphBaseDepthWrite = false;

  const stripLabelText = createGraphTroikaText({
    Text,
    color: 0xd6e4ef,
    fontSize: 0.08,
    fontWeight: "bold",
    textAlign: "left",
    anchorX: "left",
    anchorY: "top",
    depthTest: true,
    depthWrite: false,
    renderOrder: 2.44,
  });
  stripLabelText.userData.graphTextRole = "body-strip-label";
  stripLabelText.userData.nodeId = nodeId;
  stripLabelText.userData.graphBaseRenderOrder = 2.44;
  stripLabelText.userData.graphBaseDepthTest = true;
  stripLabelText.userData.graphBaseDepthWrite = false;

  const stripDetailText = createGraphTroikaText({
    Text,
    color: 0xd6e4ef,
    fontSize: 0.08,
    fontWeight: "bold",
    textAlign: "right",
    anchorX: "right",
    anchorY: "top",
    depthTest: true,
    depthWrite: false,
    renderOrder: 2.44,
  });
  stripDetailText.userData.graphTextRole = "body-strip-detail";
  stripDetailText.userData.nodeId = nodeId;
  stripDetailText.userData.graphBaseRenderOrder = 2.44;
  stripDetailText.userData.graphBaseDepthTest = true;
  stripDetailText.userData.graphBaseDepthWrite = false;

  const shapeTitleText = createGraphTroikaText({
    Text,
    color: 0xffffff,
    fontSize: 0.2,
    fontWeight: "bold",
    textAlign: "center",
    anchorX: "center",
    anchorY: "middle",
    depthTest: true,
    depthWrite: false,
    renderOrder: 2.6,
  });
  shapeTitleText.userData.graphTextRole = "shape-title";
  shapeTitleText.userData.nodeId = nodeId;
  shapeTitleText.userData.graphBaseRenderOrder = 2.6;
  shapeTitleText.userData.graphBaseDepthTest = true;
  shapeTitleText.userData.graphBaseDepthWrite = false;

  return {
    titleText,
    leadingBadgeText,
    statusBadgeText,
    bodyText,
    stripLabelText,
    stripDetailText,
    shapeTitleText,
  };
}

function clearNodeTextMeshes(record) {
  for (const textMesh of Object.values(record.textMeshes ?? {})) {
    if (!textMesh) continue;
    textMesh.text = "";
    textMesh.visible = false;
  }
}

function pxToCardLocalX(record, xPx) {
  return (Number(xPx) / Math.max(1, record.canvas.width) - 0.5) * record.cardWidth;
}

function pxToCardLocalY(record, yPx) {
  return record.cardHeight * 0.5 - (Number(yPx) / Math.max(1, record.canvas.height)) * record.cardHeight;
}

function pxToCardWorldSize(record, sizePx) {
  return (Number(sizePx) / Math.max(1, record.canvas.height)) * record.cardHeight;
}

function resolveCardTextBlockHeightPx(fontSizePx, lineGapPx, lineCount) {
  const resolvedFontSizePx = Math.max(1, Number(fontSizePx) || 1);
  const resolvedLineGapPx = Number.isFinite(lineGapPx) ? lineGapPx : resolvedFontSizePx;
  const resolvedLineCount = Math.max(1, Math.trunc(Number(lineCount) || 1));
  return resolvedFontSizePx + Math.max(0, resolvedLineCount - 1) * resolvedLineGapPx;
}

function resolveCardBadgeLayoutPx(fontSizePx) {
  const resolvedFontSizePx = Math.max(1, Number(fontSizePx) || DEFAULT_CARD_BADGE_FONT_SIZE_PX);
  const sidePaddingPx = Math.max(30, Math.round(resolvedFontSizePx * 0.7));
  const verticalPaddingPx = Math.max(10, Math.round(resolvedFontSizePx * 0.28));
  const heightPx = Math.max(DEFAULT_CARD_BADGE_MIN_HEIGHT_PX, Math.round(resolvedFontSizePx + verticalPaddingPx * 2));
  const radiusPx = Math.max(18, Math.round(heightPx * 0.45));
  const gapPx = Math.max(DEFAULT_CARD_BADGE_HORIZONTAL_GAP_PX, Math.round(resolvedFontSizePx * 0.26));
  return {
    topPx: DEFAULT_CARD_BADGE_TOP_PX,
    sidePaddingPx,
    heightPx,
    radiusPx,
    gapPx,
    centerYPx: DEFAULT_CARD_BADGE_TOP_PX + heightPx * 0.5,
  };
}

function setNodeTextMesh(record, textMesh, {
  text,
  xPx,
  yPx,
  z = 0.028,
  fontSizePx,
  lineGapPx = null,
  maxWidthPx = null,
  color,
  fontWeight = undefined,
  textAlign = undefined,
  anchorX = undefined,
  anchorY = undefined,
  outlineWidthPx = 0,
  outlineColor = 0x000000,
  outlineOpacity = 1,
} = {}) {
  if (!textMesh) return null;
  const resolvedFontSizePx = Math.max(1, Number(fontSizePx) || 1);
  const resolvedLineGapPx = Number.isFinite(lineGapPx) ? lineGapPx : resolvedFontSizePx;
  return setGraphTroikaText(textMesh, {
    text,
    color,
    fontSize: pxToCardWorldSize(record, resolvedFontSizePx),
    fontWeight,
    textAlign,
    anchorX,
    anchorY,
    lineHeight: resolvedLineGapPx / resolvedFontSizePx,
    maxWidth: Number.isFinite(maxWidthPx) ? pxToCardWorldSize(record, maxWidthPx) : undefined,
    outlineWidth: pxToCardWorldSize(record, outlineWidthPx),
    outlineColor,
    outlineOpacity,
    x: pxToCardLocalX(record, xPx),
    y: pxToCardLocalY(record, yPx),
    z,
    visible: true,
  });
}

function createPorts({ THREE, node, ports, side, anchorWidth, anchorHeight, portRadius, getPortColor }) {
  const list = Array.isArray(ports) && ports.length ? ports : [];
  const total = Math.max(1, list.length);
  return list.map((port, index) => {
    const y = anchorHeight * 0.5 - ((index + 1) / (total + 1)) * (anchorHeight * 0.84);
    const x = side === "input" ? -anchorWidth * 0.5 - portRadius * 0.92 : anchorWidth * 0.5 + portRadius * 0.92;
    const color = asHexColor(getPortColor(port, { node, side }), 0xffffff);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(portRadius, 12, 12),
      new THREE.MeshBasicMaterial({ color, depthTest: true, depthWrite: false }),
    );
    mesh.position.set(x, y, 0.06);
    mesh.renderOrder = 3;
    mesh.userData.graphBaseRenderOrder = 3;
    mesh.userData.graphBaseDepthTest = true;
    mesh.userData.graphBaseDepthWrite = false;
    mesh.userData.graphHit = {
      kind: "port",
      id: node.id,
      node,
      side,
      portKey: String(port?.key ?? port?.name ?? `${side}-${index}`),
      port,
    };
    return {
      key: String(port?.key ?? port?.name ?? `${side}-${index}`),
      mesh,
      port,
    };
  });
}

function createActionHandles({
  THREE,
  node,
  anchorWidth,
  anchorHeight,
  actionHandleRadius,
  getActionHandleRoles,
  getActionHandleColor,
}) {
  const roles = getActionHandleRoles(node) ?? {};
  const color = asHexColor(getActionHandleColor(node), 0xffffff);
  const entries = [];

  if (roles.in) {
    entries.push(createActionHandle({
      THREE,
      node,
      role: "in",
      x: 0,
      y: anchorHeight * 0.5 + actionHandleRadius * 1.2,
      z: 0.08,
      radius: actionHandleRadius,
      color,
    }));
  }
  if (roles.out) {
    entries.push(createActionHandle({
      THREE,
      node,
      role: "out",
      x: 0,
      y: -anchorHeight * 0.5 - actionHandleRadius * 1.2,
      z: 0.08,
      radius: actionHandleRadius,
      color,
    }));
  }

  return entries;
}

function createActionHandle({ THREE, node, role, x, y, z, radius, color }) {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 4),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthTest: true, depthWrite: false }),
  );
  mesh.position.set(x, y, z);
  mesh.rotation.z = Math.PI * 0.25;
  mesh.renderOrder = 3;
  mesh.userData.graphBaseRenderOrder = 3;
  mesh.userData.graphBaseDepthTest = true;
  mesh.userData.graphBaseDepthWrite = false;
  mesh.userData.graphHit = {
    kind: "action-handle",
    id: node.id,
    node,
    role,
  };
  return { role, mesh, radius, homePosition: mesh.position.clone() };
}

function updateCardTexture({
  record,
  getNodeTitle,
  getNodeLeadingBadge,
  getNodeSubtitle,
  getNodeBodyText,
  getNodeBodyStrip,
  getNodeBadge,
  getNodeAccentColor,
  getNodeBodyColor,
  getNodeBorderColor,
}) {
  const { canvas, texture, node } = record;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const accent = asHexColor(getNodeAccentColor(node), 0x5f8fc9);
  const border = asHexColor(getNodeBorderColor(node), accent);
  const body = asHexColor(getNodeBodyColor(node), 0x172232);
  const title = String(getNodeTitle(node) ?? node.id ?? "Node");
  const subtitle = String(getNodeSubtitle(node) ?? "").trim();
  const leadingBadge = String(getNodeLeadingBadge(node) ?? "").trim();
  const bodyText = String(getNodeBodyText(node) ?? "").trim();
  const bodyStrip = normalizeBodyStrip(getNodeBodyStrip(node));
  const badge = String(getNodeBadge(node) ?? "").trim();
  const shape = normalizeNodeShape(record.shape);
  const headerTextIsDark = getPerceivedLuminance(accent) >= 0.58;
  const headerTextColor = headerTextIsDark ? 0x08131d : 0xf5f8fb;
  const headerTextOutline = headerTextIsDark ? 0xffffff : 0x060a10;
  const headerTextOutlineOpacity = headerTextIsDark ? 0.28 : 0.5;
  const badgeFillColor = headerTextIsDark ? "rgba(8,19,29,0.62)" : "rgba(13,21,33,0.42)";
  const titleFont = record.cardTitleFont ?? GRAPH_NODE_TITLE_FONT;
  const cardHeaderHeightPx = Number(record.cardHeaderHeightPx ?? DEFAULT_HEADER_HEIGHT_PX);
  const titleLineGapPx = Number(record.cardTitleLineGapPx ?? GRAPH_NODE_TITLE_LINE_GAP_PX);
  const badgeFont = record.cardBadgeFont ?? buildGraphNodeTitleFont(DEFAULT_CARD_BADGE_FONT_SIZE_PX);
  const bodyFont = record.cardBodyFont ?? `${DEFAULT_CARD_BODY_FONT_SIZE_PX}px monospace`;
  const titleFontSizePx = Number(record.cardTitleFontSizePx ?? DEFAULT_CARD_TITLE_FONT_SIZE_PX);
  const badgeFontSizePx = Number(record.cardBadgeFontSizePx ?? DEFAULT_CARD_BADGE_FONT_SIZE_PX);
  const bodyFontSizePx = Number(record.cardBodyFontSizePx ?? DEFAULT_CARD_BODY_FONT_SIZE_PX);
  const bodyLineGapPx = Number(record.cardBodyLineGapPx ?? 34);
  const stripFontSizePx = Number(record.cardBodyStripFontSizePx ?? DEFAULT_CARD_BODY_STRIP_FONT_SIZE_PX);
  const stripBarHeightPx = Number(record.cardBodyStripBarHeightPx ?? DEFAULT_CARD_BODY_STRIP_BAR_HEIGHT_PX);
  const stripBottomPaddingPx = Number(record.cardBodyStripBottomPaddingPx ?? DEFAULT_CARD_BODY_STRIP_BOTTOM_PADDING_PX);
  const badgeLayout = resolveCardBadgeLayoutPx(badgeFontSizePx);

  const radius = 36;
  ctx.clearRect(0, 0, width, height);
  clearNodeTextMeshes(record);

  if (shape !== "card") {
    const decoratedShapeTexture = shouldUseDecoratedShapeTexture(shape);
    ctx.clearRect(0, 0, width, height);
    if (decoratedShapeTexture) {
      drawShapeNodeTexture({
        ctx,
        width,
        height,
        shape,
        fill: toCssColor(accent),
        border: toCssColor(border),
        title,
        textColor: toCssColor(headerTextColor),
        textOutline: toCssColor(headerTextOutline),
        drawTitle: false,
      });
      record.cardMesh.material.map = texture;
      record.cardMesh.material.color.setHex(0xffffff);
      texture.needsUpdate = true;
    } else {
      record.cardMesh.material.map = null;
      record.cardMesh.material.color.setHex(accent);
    }
    record.cardMesh.material.needsUpdate = true;
    record.shadowMesh.visible = !decoratedShapeTexture;
    record.shadowMesh.material.color.setHex(border);
    record.shadowMesh.material.opacity = 1;
    record.shadowMesh.material.needsUpdate = true;
    const shapeTitleFontSizePx = resolveShapeTitleFontSizePx(record);
    const shapeTitleLineGapPx = resolveShapeTitleLineGapPx(shapeTitleFontSizePx);
    const shapeTitleMaxWidthPx = width * resolveShapeTitleMaxWidthScale(shape);
    const shapeLines = wrapTextLines(ctx, title, shapeTitleMaxWidthPx, resolveShapeTitleMaxLines(shape));
    setNodeTextMesh(record, record.textMeshes.shapeTitleText, {
      text: shapeLines.join("\n"),
      xPx: width * 0.5,
      yPx: height * 0.5 - ((shapeLines.length - 1) * shapeTitleLineGapPx) * 0.5,
      z: 0.05,
      fontSizePx: shapeTitleFontSizePx,
      lineGapPx: shapeTitleLineGapPx,
      maxWidthPx: shapeTitleMaxWidthPx,
      color: headerTextColor,
      fontWeight: "bold",
      textAlign: "center",
      anchorX: "center",
      anchorY: "middle",
      outlineWidthPx: 8,
      outlineColor: headerTextOutline,
      outlineOpacity: headerTextOutlineOpacity,
    });
    return;
  }

  if (record.cardMesh.material.map !== texture) {
    record.cardMesh.material.map = texture;
    record.cardMesh.material.needsUpdate = true;
  }
  record.shadowMesh.visible = false;

  ctx.font = badgeFont;
  const badgeEntries = [
    leadingBadge ? { text: leadingBadge, mesh: record.textMeshes.leadingBadgeText } : null,
    badge ? { text: badge, mesh: record.textMeshes.statusBadgeText } : null,
  ].filter(Boolean);
  const badgeMetrics = badgeEntries.map((entry) => ({
    ...entry,
    pillWidth: Math.min(
      420,
      Math.max(
        DEFAULT_CARD_BADGE_MIN_WIDTH_PX,
        Math.max(
          ctx.measureText(entry.text).width,
          estimateGraphTextWidthPx(entry.text, badgeFontSizePx),
        ) + badgeLayout.sidePaddingPx * 2,
      ),
    ),
  }));
  const badgeGroupWidth = badgeMetrics.length
    ? badgeMetrics.reduce((total, entry) => total + entry.pillWidth, 0) + (badgeLayout.gapPx * (badgeMetrics.length - 1))
    : 0;

  ctx.font = titleFont;
  ctx.textBaseline = "top";
  const titleMaxWidth = Math.max(220, width - 72 - (badgeGroupWidth ? badgeGroupWidth + Math.max(64, badgeLayout.sidePaddingPx + badgeLayout.gapPx) : 48));
  const titleLines = wrapTextLines(ctx, title, titleMaxWidth, 1);
  const titleBlockHeight = resolveCardTextBlockHeightPx(titleFontSizePx, titleLineGapPx, titleLines.length);
  const headerHeight = Math.max(
    cardHeaderHeightPx,
    GRAPH_NODE_CARD_TITLE_TOP_PX
      + titleBlockHeight
      + GRAPH_NODE_CARD_TITLE_BOTTOM_PADDING_PX,
    badgeLayout.topPx + badgeLayout.heightPx + 24,
  );

  drawRoundedRect(ctx, 0, 0, width, height, radius, toCssColor(body));
  drawRoundedStroke(ctx, 0, 0, width, height, radius, toCssColor(border), 10);
  drawRoundedRect(ctx, 0, 0, width, headerHeight, [radius, radius, 0, 0], toCssColor(accent));

  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, headerHeight, width, 6);

  ctx.font = titleFont;
  ctx.textBaseline = "top";
  setNodeTextMesh(record, record.textMeshes.titleText, {
    text: titleLines.join("\n"),
    xPx: 36,
    yPx: GRAPH_NODE_CARD_TITLE_TOP_PX,
    z: 0.032,
    fontSizePx: titleFontSizePx,
    lineGapPx: titleLineGapPx,
    maxWidthPx: titleMaxWidth,
    color: headerTextColor,
    fontWeight: "bold",
    textAlign: "left",
    anchorX: "left",
    anchorY: "top",
    outlineWidthPx: 6,
    outlineColor: headerTextOutline,
    outlineOpacity: headerTextOutlineOpacity,
  });

  if (badgeMetrics.length) {
    let rightEdgeX = width - 30;
    for (let index = badgeMetrics.length - 1; index >= 0; index -= 1) {
      const entry = badgeMetrics[index];
      const x = rightEdgeX - entry.pillWidth;
      drawRoundedRect(ctx, x, badgeLayout.topPx, entry.pillWidth, badgeLayout.heightPx, badgeLayout.radiusPx, badgeFillColor);
      setNodeTextMesh(record, entry.mesh, {
        text: entry.text,
        xPx: x + entry.pillWidth * 0.5,
        yPx: badgeLayout.centerYPx,
        z: 0.034,
        fontSizePx: badgeFontSizePx,
        color: 0xeaf0f6,
        fontWeight: "bold",
        textAlign: "center",
        anchorX: "center",
        anchorY: "middle",
      });
      rightEdgeX = x - badgeLayout.gapPx;
    }
  }

  if (shape === "card" && bodyText) {
    ctx.font = bodyFont;
    const bodyLines = wrapTextLines(ctx, bodyText, width - 72, bodyStrip ? 3 : 4);
    const bodyTopPx = headerHeight + Math.max(30, Math.round(bodyFontSizePx * 0.55));
    setNodeTextMesh(record, record.textMeshes.bodyText, {
      text: bodyLines.join("\n"),
      xPx: 36,
      yPx: bodyTopPx,
      z: 0.026,
      fontSizePx: bodyFontSizePx,
      lineGapPx: bodyLineGapPx,
      maxWidthPx: width - 72,
      color: 0x9ec1dd,
      textAlign: "left",
      anchorX: "left",
      anchorY: "top",
    });
  } else if (shape === "card" && subtitle) {
    ctx.font = bodyFont;
    const subtitleLines = wrapTextLines(ctx, subtitle.toUpperCase(), width - 72, 2);
    const bodyTopPx = headerHeight + Math.max(30, Math.round(bodyFontSizePx * 0.55));
    setNodeTextMesh(record, record.textMeshes.bodyText, {
      text: subtitleLines.join("\n"),
      xPx: 36,
      yPx: bodyTopPx,
      z: 0.026,
      fontSizePx: bodyFontSizePx,
      lineGapPx: bodyLineGapPx,
      maxWidthPx: width - 72,
      color: 0x9ec1dd,
      textAlign: "left",
      anchorX: "left",
      anchorY: "top",
    });
  }

  if (shape === "card" && bodyStrip) {
    const stripWidth = width - 72;
    const stripY = height - stripBottomPaddingPx;
    const stripTextY = stripY - Math.max(18, Math.round(stripFontSizePx * 1.15));
    setNodeTextMesh(record, record.textMeshes.stripLabelText, {
      text: bodyStrip.label,
      xPx: 36,
      yPx: stripTextY,
      z: 0.03,
      fontSizePx: stripFontSizePx,
      color: 0xd6e4ef,
      fontWeight: "bold",
      textAlign: "left",
      anchorX: "left",
      anchorY: "top",
    });
    setNodeTextMesh(record, record.textMeshes.stripDetailText, {
      text: bodyStrip.detail,
      xPx: width - 36,
      yPx: stripTextY,
      z: 0.03,
      fontSizePx: stripFontSizePx,
      color: 0xd6e4ef,
      fontWeight: "bold",
      textAlign: "right",
      anchorX: "right",
      anchorY: "top",
    });

    ctx.fillStyle = toCssColor(bodyStrip.backgroundColor);
    ctx.fillRect(36, stripY, stripWidth, stripBarHeightPx);
    ctx.fillStyle = toCssColor(bodyStrip.color);
    ctx.fillRect(36, stripY, stripWidth * bodyStrip.value, stripBarHeightPx);
  }

  texture.needsUpdate = true;
}

function normalizeBodyStrip(strip) {
  if (!strip || typeof strip !== "object") {
    return null;
  }
  const value = Number(strip.value);
  if (!Number.isFinite(value)) {
    return null;
  }
  const clampedValue = Math.max(0, Math.min(1, value));
  return {
    label: String(strip.label ?? "METRIC").trim() || "METRIC",
    detail: String(strip.detail ?? `${Math.round(clampedValue * 100)}%`).trim() || `${Math.round(clampedValue * 100)}%`,
    value: clampedValue,
    color: asHexColor(strip.color, 0x72c889),
    backgroundColor: asHexColor(strip.backgroundColor, 0x243444),
  };
}

function resolveEdgeAnchorWorldPosition(record, portKey, side, target, flatAxes = resolveFlatPlaneAxes(DEFAULT_FLAT_PLANE)) {
  const ports = side === "input" ? record.inputPorts : record.outputPorts;
  const key = String(portKey ?? "").trim();
  const port = ports.find((entry) => entry.key === key) ?? ports[0] ?? null;
  if (port?.mesh?.getWorldPosition) {
    port.mesh.getWorldPosition(target);
    return target;
  }
  record.cardMesh.getWorldPosition(target);
  addAxisValue(target, flatAxes.horizontalAxis, side === "input" ? -resolveNodeSideAnchorOffset(record) : resolveNodeSideAnchorOffset(record));
  return target;
}

function resolveNodeSurfaceWorldPosition(record, towardWorld, target) {
  const cardMesh = record.cardMesh;
  target.copy(towardWorld);
  cardMesh.worldToLocal(target);
  const length = Math.hypot(target.x, target.y);
  if (length <= 1e-6) {
    cardMesh.getWorldPosition(target);
    return target;
  }
  const ux = target.x / length;
  const uy = target.y / length;
  const reach = resolveNodeSurfaceReach(record.shape, record.shapeHalfWidth, record.shapeHalfHeight, ux, uy) + NODE_SURFACE_EDGE_GAP;
  target.set(ux * reach, uy * reach, 0.08);
  cardMesh.localToWorld(target);
  return target;
}

function resolveSelfEdgeAnchorWorldPosition(record, verticalSign, target) {
  target.set(record.shapeHalfWidth + NODE_SURFACE_EDGE_GAP, verticalSign * record.shapeHalfHeight * 0.5, 0.08);
  record.cardMesh.localToWorld(target);
  return target;
}

function resolveVirtualActionAnchorWorldPosition(record, role, target) {
  const cardMesh = record?.cardMesh ?? null;
  if (!cardMesh?.localToWorld) {
    cardMesh?.getWorldPosition?.(target);
    return target;
  }

  const halfHeight = Math.max(0.4, Number(record?.cardHeight ?? DEFAULT_CARD_HEIGHT) * 0.5);
  const handleRadius = Math.max(DEFAULT_ACTION_HANDLE_RADIUS, Number(record?.actionHandleRadius ?? DEFAULT_ACTION_HANDLE_RADIUS));
  target.set(
    0,
    role === "in" ? halfHeight + handleRadius * 1.2 : -halfHeight - handleRadius * 1.2,
    0.08,
  );
  cardMesh.localToWorld(target);
  return target;
}

function resolveActionAnchorWorldPosition(record, role, target, flatAxes = resolveFlatPlaneAxes(DEFAULT_FLAT_PLANE)) {
  const handle = record.actionHandleByRole?.[role] ?? null;
  if (handle?.mesh?.getWorldPosition) {
    handle.mesh.getWorldPosition(target);
    return target;
  }
  if (record?.cardMesh?.localToWorld) {
    return resolveVirtualActionAnchorWorldPosition(record, role, target);
  }
  record.cardMesh.getWorldPosition(target);
  addAxisValue(target, flatAxes.horizontalAxis, role === "in" ? -resolveNodeSideAnchorOffset(record) : resolveNodeSideAnchorOffset(record));
  return target;
}

function resolveVirtualActionAnchorWorldPositionForSide(record, side, target) {
  const cardMesh = record?.cardMesh;
  const halfWidth = Math.max(0.6, Number(record?.cardWidth ?? 0) * 0.5);
  const halfHeight = Math.max(0.6, Number(record?.cardHeight ?? 0) * 0.5);
  const handleRadius = Math.max(DEFAULT_ACTION_HANDLE_RADIUS, Number(record?.actionHandleRadius ?? DEFAULT_ACTION_HANDLE_RADIUS));
  const horizontalOffset = halfWidth + handleRadius * 1.2;
  const verticalOffset = halfHeight + handleRadius * 1.2;
  switch (String(side ?? "").trim().toLowerCase()) {
    case "left":
      target.set(-horizontalOffset, 0, 0.08);
      break;
    case "right":
      target.set(horizontalOffset, 0, 0.08);
      break;
    case "top":
      target.set(0, verticalOffset, 0.08);
      break;
    case "bottom":
    default:
      target.set(0, -verticalOffset, 0.08);
      break;
  }
  cardMesh.localToWorld(target);
  return target;
}

function resolveFlatActionAnchorSides(
  fromCenter,
  toCenter,
  flatAxes = resolveFlatPlaneAxes(DEFAULT_FLAT_PLANE),
  anchorMode = "closest-side",
) {
  const deltaHorizontal = getAxisValue(toCenter, flatAxes.horizontalAxis) - getAxisValue(fromCenter, flatAxes.horizontalAxis);
  const deltaVertical = getAxisValue(toCenter, flatAxes.verticalAxis) - getAxisValue(fromCenter, flatAxes.verticalAxis);

  if (anchorMode === "horizontal-sides") {
    return deltaHorizontal >= 0
      ? { fromSide: "right", toSide: "left" }
      : { fromSide: "left", toSide: "right" };
  }

  if (anchorMode === "vertical-sides") {
    return deltaVertical >= 0
      ? { fromSide: "top", toSide: "bottom" }
      : { fromSide: "bottom", toSide: "top" };
  }

  if (Math.abs(deltaHorizontal) > Math.abs(deltaVertical)) {
    return deltaHorizontal >= 0
      ? { fromSide: "right", toSide: "left" }
      : { fromSide: "left", toSide: "right" };
  }

  return deltaVertical >= 0
    ? { fromSide: "top", toSide: "bottom" }
    : { fromSide: "bottom", toSide: "top" };
}

function resolveNodeSideAnchorOffset(record) {
  const halfWidth = Math.max(0.6, Number(record?.cardWidth ?? 0) * 0.5);
  return halfWidth + 0.32;
}

function createEdgeLabelSprite({
  THREE,
  Text,
  text,
  fontSizePx = DEFAULT_EDGE_LABEL_FONT_SIZE_PX,
  worldHeight = DEFAULT_EDGE_LABEL_WORLD_HEIGHT,
  minWorldWidth = DEFAULT_EDGE_LABEL_MIN_WORLD_WIDTH,
}) {
  const resolvedText = String(text ?? "").trim().slice(0, 64);
  const resolvedFontSizePx = Math.max(24, Number(fontSizePx) || DEFAULT_EDGE_LABEL_FONT_SIZE_PX);
  const spriteHeight = Math.max(0.8, Number(worldHeight) || DEFAULT_EDGE_LABEL_WORLD_HEIGHT);
  const resolvedMinWorldWidth = Math.max(0.96, Number(minWorldWidth) || DEFAULT_EDGE_LABEL_MIN_WORLD_WIDTH);
  const estimatedTextWidthPx = estimateGraphTextWidthPx(resolvedText, resolvedFontSizePx);
  const horizontalPaddingPx = Math.max(28, resolvedFontSizePx * 0.7);
  const widthRatio = (estimatedTextWidthPx + horizontalPaddingPx * 2) / resolvedFontSizePx;
  const spriteWidth = Math.max(
    resolvedMinWorldWidth,
    Math.min(4.2, spriteHeight * widthRatio * 0.4),
  );
  return createBillboardTextLabel({
    THREE,
    Text,
    text: resolvedText,
    color: 0xf2f8ff,
    scale: [spriteWidth, spriteHeight, 1],
    font: buildGraphNodeTitleFont(resolvedFontSizePx),
    backgroundColor: 0x162433,
    backgroundOpacity: 0.62,
    borderColor: null,
    lineHeight: 1,
    outlineWidth: 0,
    outlineOpacity: 0,
    depthTest: true,
    depthWrite: false,
    renderOrder: 3,
    textRole: "edge-label",
  });
}

function disposeNodeRecord(record) {
  for (const textMesh of Object.values(record.textMeshes ?? {})) {
    disposeGraphTroikaText(textMesh);
  }
  record.shadowMesh.geometry?.dispose?.();
  record.shadowMesh.material?.dispose?.();
  record.cardMesh.geometry?.dispose?.();
  record.texture?.dispose?.();
  record.cardMesh.material?.dispose?.();
  for (const port of record.inputPorts) {
    port.mesh.geometry?.dispose?.();
    port.mesh.material?.dispose?.();
  }
  for (const port of record.outputPorts) {
    port.mesh.geometry?.dispose?.();
    port.mesh.material?.dispose?.();
  }
  for (const handle of record.actionHandles ?? []) {
    handle.mesh.geometry?.dispose?.();
    handle.mesh.material?.dispose?.();
  }
}

function normalizeNodeShape(shape) {
  const resolved = String(shape ?? "card").trim().toLowerCase();
  const aliased = NODE_SHAPE_ALIASES[resolved] ?? resolved;
  return Object.prototype.hasOwnProperty.call(NODE_SHAPE_METRICS, aliased) ? aliased : "card";
}

function shouldUseDecoratedShapeTexture(shape) {
  const resolvedShape = normalizeNodeShape(shape);
  return resolvedShape === "subroutine" || resolvedShape === "cylinder";
}

function getNodeShapeMetrics(shape, cardWidth, cardHeight) {
  const metrics = NODE_SHAPE_METRICS[normalizeNodeShape(shape)] ?? NODE_SHAPE_METRICS.card;
  return {
    width: Number(cardWidth) * metrics.widthScale,
    height: Number(cardHeight) * metrics.heightScale,
  };
}

function createNodeShapeGeometry({ THREE, shape, width, height }) {
  const resolvedShape = normalizeNodeShape(shape);
  if (resolvedShape === "card") {
    return new THREE.PlaneGeometry(width, height);
  }
  if (resolvedShape === "rect") {
    return new THREE.PlaneGeometry(width, height);
  }
  if (resolvedShape === "round") {
    return normalizeShapeGeometryUvs(createRoundedCardGeometry({ THREE, width, height }));
  }
  if (resolvedShape === "subroutine") {
    return new THREE.PlaneGeometry(width, height);
  }
  if (resolvedShape === "cylinder") {
    return normalizeShapeGeometryUvs(createCylinderShapeGeometry({ THREE, width, height }));
  }

  const path = new THREE.Shape();
  const halfWidth = Number(width) * 0.5;
  const halfHeight = Number(height) * 0.5;

  if (resolvedShape === "pill" || resolvedShape === "circle" || resolvedShape === "double-circle") {
    path.absellipse(0, 0, halfWidth, halfHeight, 0, Math.PI * 2, false, 0);
  } else if (resolvedShape === "diamond") {
    path.moveTo(0, halfHeight);
    path.lineTo(halfWidth, 0);
    path.lineTo(0, -halfHeight);
    path.lineTo(-halfWidth, 0);
    path.closePath();
  } else if (resolvedShape === "parallelogram" || resolvedShape === "parallelogram-alt") {
    const slant = halfWidth * 0.26;
    const leading = resolvedShape === "parallelogram" ? -1 : 1;
    path.moveTo(-halfWidth + (leading < 0 ? slant : 0), halfHeight);
    path.lineTo(halfWidth + (leading < 0 ? 0 : -slant), halfHeight);
    path.lineTo(halfWidth + (leading < 0 ? -slant : 0), -halfHeight);
    path.lineTo(-halfWidth + (leading < 0 ? 0 : slant), -halfHeight);
    path.closePath();
  } else if (resolvedShape === "trapezoid" || resolvedShape === "trapezoid-alt") {
    const inset = halfWidth * 0.24;
    const topWide = resolvedShape === "trapezoid-alt";
    path.moveTo(-halfWidth + (topWide ? 0 : inset), halfHeight);
    path.lineTo(halfWidth - (topWide ? 0 : inset), halfHeight);
    path.lineTo(halfWidth - (topWide ? inset : 0), -halfHeight);
    path.lineTo(-halfWidth + (topWide ? inset : 0), -halfHeight);
    path.closePath();
  } else {
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI / 3) * index - Math.PI / 6;
      const pointX = Math.cos(angle) * halfWidth;
      const pointY = Math.sin(angle) * halfHeight;
      if (index === 0) path.moveTo(pointX, pointY);
      else path.lineTo(pointX, pointY);
    }
    path.closePath();
  }

  return normalizeShapeGeometryUvs(new THREE.ShapeGeometry(path, 24));
}

function normalizeShapeGeometryUvs(geometry) {
  if (!geometry?.getAttribute) return geometry;
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  if (!position || !uv || position.count !== uv.count) return geometry;

  geometry.computeBoundingBox?.();
  const bounds = geometry.boundingBox;
  if (!bounds) return geometry;

  const width = Math.max(1e-6, bounds.max.x - bounds.min.x);
  const height = Math.max(1e-6, bounds.max.y - bounds.min.y);

  for (let index = 0; index < uv.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    uv.setXY(index, (x - bounds.min.x) / width, (y - bounds.min.y) / height);
  }
  uv.needsUpdate = true;

  return geometry;
}

function createRoundedCardGeometry({ THREE, width, height, cornerRadius = null }) {
  const resolvedWidth = Math.max(0.01, Number(width) || 0.01);
  const resolvedHeight = Math.max(0.01, Number(height) || 0.01);
  const halfWidth = resolvedWidth * 0.5;
  const halfHeight = resolvedHeight * 0.5;
  const radius = Math.max(
    0.02,
    Math.min(
      halfWidth,
      halfHeight,
      Number.isFinite(cornerRadius) ? Number(cornerRadius) : Math.min(resolvedWidth, resolvedHeight) * 0.12,
    ),
  );
  const left = -halfWidth;
  const right = halfWidth;
  const top = halfHeight;
  const bottom = -halfHeight;
  const path = new THREE.Shape();

  path.moveTo(left + radius, top);
  path.lineTo(right - radius, top);
  path.quadraticCurveTo(right, top, right, top - radius);
  path.lineTo(right, bottom + radius);
  path.quadraticCurveTo(right, bottom, right - radius, bottom);
  path.lineTo(left + radius, bottom);
  path.quadraticCurveTo(left, bottom, left, bottom + radius);
  path.lineTo(left, top - radius);
  path.quadraticCurveTo(left, top, left + radius, top);
  path.closePath();

  return new THREE.ShapeGeometry(path, 24);
}

function createCylinderShapeGeometry({ THREE, width, height }) {
  const { halfWidth, topSideY, bottomSideY, capRadiusY } = resolveCylinderProfile(width, height);
  const path = new THREE.Shape();

  path.moveTo(-halfWidth, topSideY);
  path.absellipse(0, topSideY, halfWidth, capRadiusY, Math.PI, 0, true);
  path.lineTo(halfWidth, bottomSideY);
  path.absellipse(0, bottomSideY, halfWidth, capRadiusY, 0, Math.PI, true);
  path.closePath();

  return new THREE.ShapeGeometry(path, 24);
}

function resolveCylinderProfile(width, height, inset = 0) {
  const resolvedWidth = Math.max(0.01, Number(width) || 0.01);
  const resolvedHeight = Math.max(0.01, Number(height) || 0.01);
  const resolvedInset = Math.max(0, Number(inset) || 0);
  const halfWidth = Math.max(0.01, resolvedWidth * 0.5 - resolvedInset);
  const halfHeight = Math.max(0.01, resolvedHeight * 0.5 - resolvedInset);
  const capRadiusY = Math.max(0.04, Math.min(halfHeight - 0.01, resolvedHeight * 0.14));
  const topSideY = halfHeight - capRadiusY;
  const bottomSideY = -halfHeight + capRadiusY;

  return {
    width: resolvedWidth,
    height: resolvedHeight,
    halfWidth,
    halfHeight,
    capRadiusY,
    topSideY,
    bottomSideY,
    centerX: resolvedWidth * 0.5,
    centerY: resolvedHeight * 0.5,
    topCenterY: resolvedHeight * 0.5 - halfHeight + capRadiusY,
    bottomCenterY: resolvedHeight * 0.5 + halfHeight - capRadiusY,
  };
}

function resolveEdgeClass(edgeClass) {
  return String(edgeClass ?? "action").trim().toLowerCase() === "data" ? "data" : "action";
}

function resolveEdgeVisualStyle(edge) {
  const explicitStyle = String(edge?.params?.mermaid?.style ?? "").trim().toLowerCase();
  if (["arrow", "line", "dash", "bidirectional-arrow"].includes(explicitStyle)) {
    return explicitStyle;
  }
  if (String(edge?.fromPort ?? "").trim() || String(edge?.toPort ?? "").trim()) {
    return "dash";
  }
  const edgeType = String(edge?.type ?? edge?.edge_type ?? "direct").trim().toLowerCase();
  if (["conditional", "message", "timed"].includes(edgeType)) {
    return "dash";
  }
  return "arrow";
}

function drawShapeNodeTexture({
  ctx,
  width,
  height,
  shape,
  fill,
  border,
  title,
  textColor,
  textOutline,
  drawTitle = true,
}) {
  const resolvedShape = normalizeNodeShape(shape);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.lineWidth = 8;
  ctx.strokeStyle = border;
  traceShapeTexturePath(ctx, resolvedShape, width, height, 0);
  ctx.stroke();

  if (resolvedShape === "subroutine") {
    const insetX = width * 0.14;
    const insetY = height * 0.12;
    ctx.beginPath();
    ctx.moveTo(insetX, insetY);
    ctx.lineTo(insetX, height - insetY);
    ctx.moveTo(width - insetX, insetY);
    ctx.lineTo(width - insetX, height - insetY);
    ctx.stroke();
  } else if (resolvedShape === "double-circle") {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const rx = Math.max(1, width * 0.34);
    const ry = Math.max(1, height * 0.34);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  if (drawTitle !== false) {
    const maxWidth = width * (
      resolvedShape === "pill"
        ? 0.54
        : (resolvedShape === "circle" || resolvedShape === "double-circle")
          ? 0.42
          : (resolvedShape === "diamond" || resolvedShape === "hexagon")
            ? 0.46
            : 0.48
    );
    ctx.fillStyle = textColor;
    ctx.strokeStyle = textOutline;
    ctx.lineWidth = 6;
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    ctx.font = GRAPH_NODE_TITLE_FONT;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const titleLines = wrapTextLines(ctx, title, maxWidth, 2);
    let titleY = height * 0.5 - ((titleLines.length - 1) * GRAPH_NODE_TITLE_LINE_GAP_PX) * 0.5;
    for (const line of titleLines) {
      ctx.strokeText(line, width * 0.5, titleY);
      ctx.fillText(line, width * 0.5, titleY);
      titleY += GRAPH_NODE_TITLE_LINE_GAP_PX;
    }
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
}

function traceShapeTexturePath(ctx, shape, width, height, inset = 0) {
  const resolvedShape = normalizeNodeShape(shape);
  const cx = width * 0.5;
  const cy = height * 0.5;
  const rx = Math.max(1, width * 0.5 - inset);
  const ry = Math.max(1, height * 0.5 - inset);

  ctx.beginPath();
  if (resolvedShape === "rect") {
    ctx.rect(cx - rx, cy - ry, rx * 2, ry * 2);
    return;
  }
  if (resolvedShape === "round") {
    ctx.roundRect(cx - rx, cy - ry, rx * 2, ry * 2, Math.max(12, Math.min(rx, ry) * 0.22));
    return;
  }

  if (resolvedShape === "subroutine") {
    ctx.rect(cx - rx, cy - ry, rx * 2, ry * 2);
    return;
  }

  if (resolvedShape === "cylinder") {
    const {
      centerX,
      topCenterY,
      bottomCenterY,
      halfWidth,
      capRadiusY,
    } = resolveCylinderProfile(width, height, inset);
    ctx.ellipse(centerX, topCenterY, halfWidth, capRadiusY, 0, 0, Math.PI * 2);
    ctx.moveTo(centerX - halfWidth, topCenterY);
    ctx.lineTo(centerX - halfWidth, bottomCenterY);
    ctx.moveTo(centerX + halfWidth, topCenterY);
    ctx.lineTo(centerX + halfWidth, bottomCenterY);
    ctx.moveTo(centerX - halfWidth, bottomCenterY);
    ctx.ellipse(centerX, bottomCenterY, halfWidth, capRadiusY, 0, Math.PI, 0, true);
    return;
  }

  if (resolvedShape === "pill" || resolvedShape === "circle" || resolvedShape === "double-circle") {
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    return;
  }

  if (resolvedShape === "diamond") {
    ctx.moveTo(cx, cy - ry);
    ctx.lineTo(cx + rx, cy);
    ctx.lineTo(cx, cy + ry);
    ctx.lineTo(cx - rx, cy);
    ctx.closePath();
    return;
  }

  if (resolvedShape === "parallelogram" || resolvedShape === "parallelogram-alt") {
    const slant = rx * 0.26;
    const leading = resolvedShape === "parallelogram" ? -1 : 1;
    ctx.moveTo(cx - rx + (leading < 0 ? slant : 0), cy - ry);
    ctx.lineTo(cx + rx + (leading < 0 ? 0 : -slant), cy - ry);
    ctx.lineTo(cx + rx + (leading < 0 ? -slant : 0), cy + ry);
    ctx.lineTo(cx - rx + (leading < 0 ? 0 : slant), cy + ry);
    ctx.closePath();
    return;
  }

  if (resolvedShape === "trapezoid" || resolvedShape === "trapezoid-alt") {
    const insetX = rx * 0.24;
    const topWide = resolvedShape === "trapezoid-alt";
    ctx.moveTo(cx - rx + (topWide ? 0 : insetX), cy - ry);
    ctx.lineTo(cx + rx - (topWide ? 0 : insetX), cy - ry);
    ctx.lineTo(cx + rx - (topWide ? insetX : 0), cy + ry);
    ctx.lineTo(cx - rx + (topWide ? insetX : 0), cy + ry);
    ctx.closePath();
    return;
  }

  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 3) * index - Math.PI / 6;
    const pointX = cx + Math.cos(angle) * rx;
    const pointY = cy + Math.sin(angle) * ry;
    if (index === 0) ctx.moveTo(pointX, pointY);
    else ctx.lineTo(pointX, pointY);
  }
  ctx.closePath();
}

function computePlanarBounds(positions, flatAxes = resolveFlatPlaneAxes(DEFAULT_FLAT_PLANE)) {
  let minHorizontal = Infinity;
  let maxHorizontal = -Infinity;
  let minVertical = Infinity;
  let maxVertical = -Infinity;
  for (const pos of positions.values()) {
    minHorizontal = Math.min(minHorizontal, getAxisValue(pos, flatAxes.horizontalAxis));
    maxHorizontal = Math.max(maxHorizontal, getAxisValue(pos, flatAxes.horizontalAxis));
    minVertical = Math.min(minVertical, getAxisValue(pos, flatAxes.verticalAxis));
    maxVertical = Math.max(maxVertical, getAxisValue(pos, flatAxes.verticalAxis));
  }
  if (!Number.isFinite(minHorizontal)) {
    return { minHorizontal: -1, maxHorizontal: 1, minVertical: -1, maxVertical: 1 };
  }
  return { minHorizontal, maxHorizontal, minVertical, maxVertical };
}

function resolveFlatPlane(flatPlane) {
  return String(flatPlane ?? DEFAULT_FLAT_PLANE).trim().toLowerCase() === "xy" ? "xy" : DEFAULT_FLAT_PLANE;
}

function resolveFlatPlaneAxes(flatPlane) {
  return resolveFlatPlane(flatPlane) === "xy"
    ? { horizontalAxis: "x", verticalAxis: "y", normalAxis: "z" }
    : { horizontalAxis: "x", verticalAxis: "z", normalAxis: "y" };
}

function getAxisValue(vector, axis) {
  return Number(vector?.[axis] ?? 0);
}

function setAxisValue(vector, axis, value) {
  if (vector) vector[axis] = Number.isFinite(value) ? Number(value) : 0;
  return vector;
}

function addAxisValue(vector, axis, delta) {
  if (vector) vector[axis] = getAxisValue(vector, axis) + (Number.isFinite(delta) ? Number(delta) : 0);
  return vector;
}

function writeEdgeCurvePoint(target, startPoint, endPoint, controlPoint, controlPointB, useDirectionalHandles, t) {
  if (useDirectionalHandles) {
    const inverseT = 1 - t;
    target.copy(startPoint).multiplyScalar(inverseT * inverseT * inverseT);
    target.addScaledVector(controlPoint, 3 * inverseT * inverseT * t);
    target.addScaledVector(controlPointB, 3 * inverseT * t * t);
    target.addScaledVector(endPoint, t * t * t);
    return target;
  }

  target.copy(startPoint).multiplyScalar((1 - t) * (1 - t));
  target.addScaledVector(controlPoint, 2 * (1 - t) * t);
  target.addScaledVector(endPoint, t * t);
  return target;
}

function normalizeRange(value, min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || Math.abs(max - min) < 1e-6) return 0.5;
  return (Number(value) - min) / (max - min);
}

function toCssColor(hex) {
  return `#${(Number(hex) >>> 0).toString(16).padStart(6, "0")}`;
}

function getPerceivedLuminance(hex) {
  const value = Number(hex) >>> 0;
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
}

function drawRoundedRect(ctx, x, y, w, h, radius, fillStyle) {
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
}

function drawRoundedStroke(ctx, x, y, w, h, radius, strokeStyle, lineWidth) {
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.roundRect(x + lineWidth * 0.5, y + lineWidth * 0.5, w - lineWidth, h - lineWidth, radius);
  ctx.stroke();
}

function wrapTextLines(ctx, text, maxWidth, maxLines) {
  const normalizedMaxLines = Math.max(1, Math.floor(Number(maxLines) || 0));
  const paragraphs = String(text ?? "").replace(/\r/g, "").split("\n");
  if (!paragraphs.length) return [""];
  const lines = [];
  let truncated = false;

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex += 1) {
    const paragraph = String(paragraphs[paragraphIndex] ?? "");
    const tokens = paragraph.split(/\s+/).filter(Boolean);

    if (!tokens.length) {
      lines.push("");
      if (lines.length >= normalizedMaxLines) {
        truncated = paragraphIndex < paragraphs.length - 1;
        break;
      }
      continue;
    }

    let current = tokens.shift();
    while (tokens.length) {
      const candidate = `${current} ${tokens[0]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
        tokens.shift();
        continue;
      }
      lines.push(current);
      if (lines.length >= normalizedMaxLines) {
        truncated = true;
        break;
      }
      current = tokens.shift();
    }
    if (truncated) break;

    lines.push(current);
    if (lines.length >= normalizedMaxLines) {
      truncated = tokens.length > 0 || paragraphIndex < paragraphs.length - 1;
      break;
    }
  }

  if (!lines.length) return [""];
  if (truncated) {
    const last = lines[normalizedMaxLines - 1] ?? lines[lines.length - 1] ?? "";
    const trimmed = last.length > 3 ? `${last.slice(0, Math.max(0, last.length - 3))}...` : `${last}...`;
    lines[lines.length - 1] = trimmed;
  }
  return lines.slice(0, normalizedMaxLines);
}

function buildGraphNodeTitleFont(sizePx) {
  return `bold ${Math.round(sizePx)}px ${GRAPH_NODE_TITLE_FONT_FAMILY}`;
}

function resolveShapeTitleFontSizePx(record) {
  const baseFontSizePx = Number(record?.cardTitleFontSizePx ?? DEFAULT_CARD_TITLE_FONT_SIZE_PX);
  return Math.max(76, Math.round(baseFontSizePx * 0.96));
}

function resolveShapeTitleLineGapPx(fontSizePx) {
  const resolvedFontSizePx = Math.max(1, Number(fontSizePx) || DEFAULT_CARD_TITLE_FONT_SIZE_PX);
  return Math.max(72, Math.round(resolvedFontSizePx * 0.84));
}

function resolveShapeTitleMaxLines(shape) {
  const resolvedShape = normalizeNodeShape(shape);
  if (["rect", "round", "subroutine", "cylinder"].includes(resolvedShape)) {
    return 4;
  }
  if (resolvedShape === "pill") {
    return 3;
  }
  return 2;
}

function resolveShapeTitleMaxWidthScale(shape) {
  const resolvedShape = normalizeNodeShape(shape);
  if (resolvedShape === "pill") return 0.82;
  if (["circle", "double-circle"].includes(resolvedShape)) return 0.42;
  if (["diamond", "hexagon"].includes(resolvedShape)) return 0.46;
  if (["rect", "round", "subroutine", "cylinder"].includes(resolvedShape)) return 0.74;
  return 0.5;
}
