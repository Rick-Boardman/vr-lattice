// SPDX-License-Identifier: Apache-2.0
// Universal graph-network scene implementation.
//
// Non-negotiable goal: one scene implementation file; network differences are config-only.
// This module contains the shared runtime loop, rendering, picking, HUD plumbing, and pulse wiring.

import * as THREE_NS from "three";
import { runGraphScene } from "./graph-scene.js";
import { deriveAdjacency, deriveGraphStats, makeGroupByIdForLayoutMode } from "./derived.js";
import { createNetworkPulseEffect } from "../network-pulse.js";
import { NETWORK_PULSE_DEFAULTS } from "../network-pulse-policy.js";
import { getClientPointNdc } from "@rb/halo/src/pointer-coordinates.js";
import { DEFAULT_SCENE_RIG_PITCH_CLAMP_EPSILON_RAD } from "@rb/halo/src/rig.js";
import { wireSceneSelection } from "@rb/halo/src/navigation/index.js";
import { clamp } from "@rb/halo/src/scalar-math.js";
import { detectOculusBrowser } from "./boot.js";
import {
  HUD_TEXT_DEFAULT_COLOR,
  HUD_TEXT_EMPHASIS_COLOR,
  HUD_TEXT_INFO_COLOR,
} from "@rb/halo/src/hud-text-style.js";
import { createWorldHoverOutline } from "@rb/halo/src/world-hover-outline.js";
import { layoutClusteredGraphApplicationStyle } from "./application-style-layout.js";
import { fetchJsonWithTimeout } from "./json-io.js";
import { buildDetailsLinesFromMode } from "./hud-format.js";
import {
  asHexColor,
  buildNodeMeshFromSpec,
  buildEdgeLineFromSpec,
  makeLabelSpriteFactory,
  applyGenericNodeHighlight,
} from "./graph-mesh-builders.js";
import { defaultHotbarVisuals, projectWorldToHud, applySmartInitialView } from "./graph-view-helpers.js";

const GRAPH_HOTBAR_HINT_COLOR = 0x7cd992;

function validateBasicGraphShape(g) {
  if (!g || typeof g !== "object") throw new Error("Graph JSON must be an object");
  if (!Array.isArray(g.nodes)) throw new Error("Graph JSON must have 'nodes' array");
  if (!Array.isArray(g.edges)) throw new Error("Graph JSON must have 'edges' array");
  return g;
}

function nowSeconds() {
  return performance.now() / 1000;
}

function getUrlParam(name) {
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get(name);
  } catch {
    return null;
  }
}

function asVec3(THREE, v, fallback = null) {
  if (v && typeof v === "object" && v.isVector3) return v;
  if (Array.isArray(v) && v.length >= 3) return new THREE.Vector3(Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0);
  if (fallback) return fallback;
  return new THREE.Vector3(0, 0, 0);
}

function pickTextFromFields(node, fields) {
  const arr = Array.isArray(fields) ? fields : ["displayName", "name", "id"];
  for (const f of arr) {
    const v = node?.[f];
    if (v != null && String(v).trim() !== "") return String(v);
  }
  return String(node?.id || "");
}

function compileJsonConfig(json) {
  if (!json || typeof json !== "object") throw new Error("Invalid JSON config");

  const THREE = THREE_NS;
  const oculus = detectOculusBrowser();
  const hudContextOptions = json?.context?.hud && typeof json.context.hud === "object"
    ? json.context.hud
    : {};

  const loadFn = async ({ url, timeoutMs }) => {
    const raw = await fetchJsonWithTimeout({ url, timeoutMs, cache: "no-store" });
    return validateBasicGraphShape(raw);
  };

  const labelSpec = json?.render?.labels || {};

  const layoutMode = String(json?.layout?.grouping?.mode || "");
  const detailsMode = String(json?.templates?.detailsMode || "");

  return {
    id: String(json.id || "graph"),
    title: String(json.title || json.id || "graph"),
    isOculusBrowser: oculus,

    context: {
      renderer: {
        antialias: !oculus,
        alpha: false,
        desktopMaxPixelRatio: 2,
        oculusMaxPixelRatio: 1,
        ...(json?.context?.renderer || {}),
      },
      scene: {
        background: asHexColor(json?.context?.scene?.background ?? "#0a0e27", 0x0a0e27),
        fogColor: asHexColor(json?.context?.scene?.fogColor ?? "#0a0e27", 0x0a0e27),
        fogNear: Number(json?.context?.scene?.fogNear ?? 55),
        fogFar: Number(json?.context?.scene?.fogFar ?? 260),
      },
      camera: {
        fov: Number(json?.context?.camera?.fov ?? 70),
        near: Number(json?.context?.camera?.near ?? 0.05),
        far: Number(json?.context?.camera?.far ?? 700),
      },
      rig: {
        desktopStartPos: asVec3(THREE, json?.context?.rig?.desktopStartPos ?? [-14, 6, 26]),
        vrStartPos: asVec3(THREE, json?.context?.rig?.vrStartPos ?? [0, 0, 0]),
        initialYaw: Number(json?.context?.rig?.initialYaw ?? -0.25),
        initialPitch: Number(json?.context?.rig?.initialPitch ?? -0.18),
        pitchMode: String(json?.context?.rig?.pitchMode ?? "wrap"),
        pitchClampEps: Number(json?.context?.rig?.pitchClampEps ?? DEFAULT_SCENE_RIG_PITCH_CLAMP_EPSILON_RAD),
      },
      hud: {
        statusMode: "text",
        hotbarTooltips: Array.isArray(json?.hud?.tooltips) ? json.hud.tooltips : undefined,
        visibleWindowKeys: Array.isArray(hudContextOptions.visibleWindowKeys)
          ? hudContextOptions.visibleWindowKeys
          : ["xr", "chat", "hotbar", "debug"],
        ...hudContextOptions,
      },
      navigation: {
        // Enable speed ramp in fly mode: holding Shift while moving accelerates over time.
        speedRampEnabled: json?.context?.navigation?.speedRampEnabled ?? true,
        speedRampMaxMultiplier: Number(json?.context?.navigation?.speedRampMaxMultiplier ?? 8.0),
        speedRampAccelPerSec: Number(json?.context?.navigation?.speedRampAccelPerSec ?? 2.4),
        speedRampDecelPerSec: Number(json?.context?.navigation?.speedRampDecelPerSec ?? 4.0),
        baseSpeed: Number(json?.context?.navigation?.baseSpeed ?? 2.8),
        fastMultiplier: Number(json?.context?.navigation?.fastMultiplier ?? 2.4),
        ...(json?.context?.navigation || {}),
      },
    },

    hud: {
      tooltips: Array.isArray(json?.hud?.tooltips) ? json.hud.tooltips : undefined,
      helpLines: Array.isArray(json?.hud?.helpLines) ? json.hud.helpLines : getDefaultHelpLines(),
    },

    data: {
      defaultUrl: String(json?.data?.defaultUrl || "./graph.json"),
      load: loadFn,
      toGraph: ({ raw }) => raw,
      seedFromGraph: (g) => g?.seed,
    },

    layout: {
      computePositions: async ({ graph, seed }) => {
        const groupById = makeGroupByIdForLayoutMode(graph, layoutMode, json?.layout?.grouping || {});
        const physicsEdgeTypes = new Set(json?.layout?.physicsEdgeTypes || []);
        return layoutClusteredGraphApplicationStyle({
          THREE,
          nodes: graph.nodes,
          edges: graph.edges,
          groupById,
          seed,
          isOculusBrowser: oculus,
          centerGroupName: json?.layout?.centerGroupName ?? "SHARED",
          splitCenterGroupCount: Number(json?.layout?.splitCenterGroupCount ?? 3),
          typeOfNode: (n) => n?.type ?? "node",
          initRadiusByType: json?.layout?.initRadiusByType || null,
          includeEdgeInPhysics: (e) => {
            if (!physicsEdgeTypes.size) return true;
            return physicsEdgeTypes.has(e?.type);
          },
          restLengthForEdge: (e, na, nb) => {
            const table = json?.layout?.restLengthByPair || null;
            if (table && na?.type && nb?.type) {
              const k1 = `${na.type}|${nb.type}`;
              const k2 = `${nb.type}|${na.type}`;
              if (Number.isFinite(table[k1])) return Number(table[k1]);
              if (Number.isFinite(table[k2])) return Number(table[k2]);
            }
            return Number(json?.layout?.defaultRestLength ?? 18);
          },
          minNodeSpacing: Number(json?.layout?.minNodeSpacing ?? 3.6),
          spacingSolverIters: Number(json?.layout?.spacingSolverIters ?? 1),
        });
      },
    },

    render: {
      labelSprite: {
        canvasW: oculus ? Number(labelSpec?.canvasWOculus ?? 256) : Number(labelSpec?.canvasWDesktop ?? 512),
        canvasH: oculus ? Number(labelSpec?.canvasHOculus ?? 64) : Number(labelSpec?.canvasHDesktop ?? 128),
        font: oculus ? String(labelSpec?.fontOculus ?? "26px monospace") : String(labelSpec?.fontDesktop ?? "44px monospace"),
        scale: oculus ? (labelSpec?.scaleOculus || [6.5, 1.6, 1]) : (labelSpec?.scaleDesktop || [8, 2, 1]),
      },
      labelText: ({ node }) => (labelSpec?.enabled === false ? null : pickTextFromFields(node, labelSpec?.fields)),
      labelOffset: ({ THREE }) => asVec3(THREE, labelSpec?.offset ?? [0, 2.0, 0]),
      buildNodeMesh: ({ THREE, node }) => buildNodeMeshFromSpec({ THREE, node, spec: json?.render?.nodes || {}, isOculus: oculus }),
      buildEdgeLine: ({ THREE, edge, fromPos, toPos }) => buildEdgeLineFromSpec({ THREE, edge, fromPos, toPos, spec: json?.render?.edges || {} }),
    },

    pulse: {
      color: asHexColor(json?.pulse?.color ?? "#9ec2ff", NETWORK_PULSE_DEFAULTS.color),
      maxPulses: Number(json?.pulse?.maxPulses ?? NETWORK_PULSE_DEFAULTS.maxPulses),
      pulsesPerEdge: Number(json?.pulse?.pulsesPerEdge ?? NETWORK_PULSE_DEFAULTS.pulsesPerEdge),
      pulseRadius: Number(json?.pulse?.pulseRadius ?? NETWORK_PULSE_DEFAULTS.pulseRadius),
      speed: Number(json?.pulse?.speed ?? NETWORK_PULSE_DEFAULTS.speed),
      dimOpacity: Number(json?.pulse?.dimOpacity ?? NETWORK_PULSE_DEFAULTS.dimOpacity),
      brightOpacity: Number(json?.pulse?.brightOpacity ?? NETWORK_PULSE_DEFAULTS.brightOpacity),
      isEdgePulseable: (edge) => {
        const mode = String(json?.pulse?.edgePulseable?.mode || "all");
        if (mode === "edgeTypeAllowlist") {
          const allow = new Set(json?.pulse?.edgePulseable?.allow || []);
          return allow.size ? allow.has(String(edge?.type || "")) : true;
        }
        return true;
      },
    },

    templates: {
      createBindings: ({ hudSystem }) => {
        const selectionKey = hudSystem.hud?.ui?.windows?.selection ? "selection" : "target";
        return {
          setStatusLines: (lines) => hudSystem.setWindowLines("status", lines, { scrollMode: "top" }),
          setSelectionLines: (lines) => hudSystem.setWindowLines(selectionKey, lines, { scrollMode: "top" }),
          setSelectionCollapsed: (collapsed) => {
            const sel = hudSystem.hud?.ui?.windows?.selection;
            if (sel) sel.collapsed = !!collapsed;
          },
        };
      },

      buildStatusLines: ({ ctx, graph, fps }) => {
        if (!graph) return [{ text: "no graph", color: HUD_TEXT_DEFAULT_COLOR }];

        const mode = String(json?.templates?.statusMode || "default");
        const lines = [];
        // NOTE: FPS/speed/VR depth/error are owned by the runtime Status panel
        // via hud.ui.metrics. Keep graph status content limited to graph/domain info
        // to avoid duplicate/competing metrics across entrypoints.

        if (mode === "application") {
          const { bucketCounts, edgeCount } = deriveGraphStats(graph, {
            mapKindToBucket: (kind) => {
              if (kind === "application") return "apps";
              if (kind === "database-server") return "servers";
              if (kind === "database") return "dbs";
              if (kind === "fileshare") return "shares";
              return null;
            },
          });
          lines.push({ text: `apps: ${bucketCounts.get("apps") || 0}`, color: HUD_TEXT_DEFAULT_COLOR });
          lines.push({ text: `servers: ${bucketCounts.get("servers") || 0}`, color: HUD_TEXT_DEFAULT_COLOR });
          lines.push({ text: `dbs: ${bucketCounts.get("dbs") || 0}`, color: HUD_TEXT_DEFAULT_COLOR });
          lines.push({ text: `shares: ${bucketCounts.get("shares") || 0}`, color: HUD_TEXT_DEFAULT_COLOR });
          lines.push({ text: `edges: ${edgeCount}`, color: HUD_TEXT_INFO_COLOR });
          return lines;
        }

        lines.push({ text: `nodes: ${graph.nodes?.length || 0}`, color: HUD_TEXT_DEFAULT_COLOR });
        lines.push({ text: `edges: ${graph.edges?.length || 0}`, color: HUD_TEXT_INFO_COLOR });
        return lines;
      },

      buildSelectionLines: ({ graph, derived, nodeId }) => {
        const node = graph?.nodes?.find((n) => n.id === nodeId) || null;
        return buildDetailsLinesFromMode(detailsMode || "default", { node, graph, derived });
      },

      buildHoverLines: ({ graph, derived, nodeId }) => {
        const node = graph?.nodes?.find((n) => n.id === nodeId) || null;
        return buildDetailsLinesFromMode(detailsMode || "default", { node, graph, derived });
      },
    },

    // View: initial placement + reset logic
    view: {
      applyInitialView: ({ THREE, ctx, graph, positions, nodeById, navigation, rig }) => {
        applySmartInitialView({ THREE, ctx, graph, positions, nodeById, navigation, rig, json });
      },
      resetView: ({ THREE, ctx, graph, nodeById, navigation, rig }) => {
        applySmartInitialView({ THREE, ctx, graph, positions: null, nodeById, navigation, rig, json });
      },
    },
  };
}

/**
 * Default help content for graph scenes.
 */
function getDefaultHelpLines() {
  return [
    { text: "mouse: move = hover", color: HUD_TEXT_DEFAULT_COLOR },
    { text: "mouse: click = select", color: HUD_TEXT_DEFAULT_COLOR },
    { text: "mouse: drag = look", color: HUD_TEXT_DEFAULT_COLOR },
    { text: "WASD = move", color: HUD_TEXT_EMPHASIS_COLOR },
    { text: "Shift = speed ramp", color: HUD_TEXT_EMPHASIS_COLOR },
    { text: "Q/E = yaw  R/F = pitch", color: HUD_TEXT_INFO_COLOR },
    { text: "T = up  G = down", color: HUD_TEXT_INFO_COLOR },
    { text: "X = toggle auto-walk", color: HUD_TEXT_INFO_COLOR },
    { text: "hotbar: [0]=edges [1]=labels", color: GRAPH_HOTBAR_HINT_COLOR },
    { text: "hotbar: [2]=reload [3]=reset", color: GRAPH_HOTBAR_HINT_COLOR },
  ];
}

export async function runUniversalNetworkSceneFromJson(json) {
  const cfg = compileJsonConfig(json);
  return runUniversalNetworkScene(cfg);
}

// Convenience boot helper for simple HTML entrypoints.
// Reads ?scene=name (maps to ./<name>.json relative to entrypoint) or ?config=path/to.json,
// loads the JSON, then starts the scene.
export async function runUniversalNetworkSceneFromUrlParams({
  sceneParam = "scene",
  configParam = "config",
  baseUrl = null,
  timeoutMs = 15000,
} = {}) {
  const base = baseUrl || window.location.href;
  const scene = getUrlParam(sceneParam);
  const config = getUrlParam(configParam);

  const configPath = config || (scene ? `./${scene}.json` : null);
  if (!configPath) {
    throw new Error(
      "Missing args. Use: 3d-scenes.html?scene=application-network or 3d-scenes.html?scene=people-network"
    );
  }

  const configUrl = new URL(configPath, base);
  const json = await fetchJsonWithTimeout({ url: configUrl.href, timeoutMs });
  return runUniversalNetworkSceneFromJson(json);
}

/**
 * @typedef {Object} UniversalGraphSceneConfig
 * @property {string} id
 * @property {string} title
 * @property {boolean} isOculusBrowser
 * @property {Object} context - forwarded into createGraphSceneContext via runGraphScene
 * @property {{ tooltips?: string[], onHotbarSlot?: Function }} hud
 * @property {{ defaultUrl: string, load: Function, toGraph: Function, seedFromGraph?: Function }} data
 * @property {{ buildNodeMesh: Function, buildEdgeLine: Function, labelText: Function, labelColor?: Function, labelOffset?: Function }} render
 * @property {{ computePositions: Function }} layout
 * @property {{ createBindings: Function, buildStatusLines: Function, buildSelectionLines: Function, buildHoverLines: Function }} templates
 * @property {{ color:number, maxPulses:number, pulsesPerEdge:number, pulseRadius:number, speed:number, dimOpacity:number, brightOpacity:number, isEdgePulseable?: Function }} pulse
 */

export async function runUniversalNetworkScene(config) {
  if (!config || typeof config !== "object") throw new Error("runUniversalNetworkScene: missing config");

  const stageVar = config.stageVar || null;
  const okVar = config.okVar || null;
  const stagePrefix = config.stagePrefix || "run";

  const THREE = config.THREE || THREE_NS;

  let showEdges = true;
  let showLabels = true;

  let selectedNodeId = null;
  let selectedAtS = 0;
  let hoveredNodeId = null;
  let hoveredAtS = 0;

  let graph = null;
  let derived = null;

  let nodeMeshes = [];
  let edgeLines = [];
  let labelSprites = [];
  const nodeById = new Map();

  const raycaster = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();

  const _tmpV3a = new THREE.Vector3();

  const makeLabelSprite = makeLabelSpriteFactory({
    THREE,
    ...(config?.render?.labelSprite || {}),
  });

  // Desktop world hover outline state (wired after ctx is created)
  let worldHoverOutline = null;
  let _desktopHoverX = NaN;
  let _desktopHoverY = NaN;

  const ctx = await runGraphScene({
    name: config.title || config.id || "graph",
    isOculusBrowser: !!config.isOculusBrowser,
    stageVar,
    okVar,
    stagePrefix,
    context: {
      THREE,
      ...(config.context || {}),
      hud: {
        ...(config?.context?.hud || {}),
        hotbarTooltips: Array.isArray(config?.hud?.tooltips) ? config.hud.tooltips : undefined,
        onHotbarSlot: (ev) => handleHotbarSlot(ev),
      },
    },
    build: async () => {
      await buildNetwork();
    },
    onFrame: (_ctx) => {
      picking?.updateVrHover();

      // Desktop: outline hovered world mesh so hover is obvious.
      // The helper suppresses outlining if the cursor is over HUD UI.
      worldHoverOutline?.updateFromClientPoint(_desktopHoverX, _desktopHoverY);

      // Update VR object hit collision dot
      if (objectHitDot && renderer.xr?.isPresenting) {
        const vrHit = picking?.getLastVrHit?.();
        if (vrHit?.point) {
          objectHitDot.visible = true;
          objectHitDot.position.copy(vrHit.point);
        } else {
          objectHitDot.visible = false;
        }
      } else if (objectHitDot) {
        objectHitDot.visible = false;
      }

      // Distance-based label culling
      if (showLabels && labelSprites.length) {
        _ctx.camera.getWorldPosition(_labelCamPos);
        for (const spr of labelSprites) {
          spr.getWorldPosition(_labelSpritePos);
          const dist = _labelCamPos.distanceTo(_labelSpritePos);
          if (dist > LABEL_MAX_DISTANCE) {
            spr.visible = false;
          } else if (dist > LABEL_FADE_START) {
            spr.visible = true;
            const fade = 1 - (dist - LABEL_FADE_START) / (LABEL_MAX_DISTANCE - LABEL_FADE_START);
            if (spr.material) spr.material.opacity = clamp(fade, 0.1, 1);
          } else {
            spr.visible = true;
            if (spr.material) spr.material.opacity = 1;
          }
        }
      }

      if (nodeMeshes.length) {
        const tS = nowSeconds();
        pulseEffect.setEdgeEmphasis(edgeLines, {
          dimOpacity: config?.pulse?.dimOpacity,
          brightOpacity: config?.pulse?.brightOpacity,
        });
        pulseEffect.update(tS, nodeById, edgeLines, { speed: config?.pulse?.speed });
      }
    },
    onFps: (_ctx, fps) => {
      try {
        const lines = config.templates.buildStatusLines({
          ctx: _ctx,
          hud,
          graph,
          derived,
          fps,
        });
        hud.setStatusLines(lines);
      } catch {
        // no-op
      }
    },
    fpsWindowSeconds: Number.isFinite(config?.fpsWindowSeconds) ? config.fpsWindowSeconds : 0.5,
  });

  const { renderer, scene, camera, rig, navigation, hudSystem, getWorldControlsEnabled } = ctx;

  // Wire desktop hover tracking for outlines.
  renderer.domElement.addEventListener(
    "pointermove",
    (e) => {
      _desktopHoverX = e.clientX;
      _desktopHoverY = e.clientY;
    },
    { capture: true }
  );
  renderer.domElement.addEventListener(
    "pointerleave",
    () => {
      _desktopHoverX = NaN;
      _desktopHoverY = NaN;
      worldHoverOutline?.clear();
    },
    { capture: true }
  );

  const hud = config.templates.createBindings({ ctx, hudSystem });

  // Populate help window with default controls if present.
  try {
    const helpLines = typeof config?.hud?.helpLines === "function"
      ? config.hud.helpLines({ ctx })
      : Array.isArray(config?.hud?.helpLines)
        ? config.hud.helpLines
        : getDefaultHelpLines();
    if (helpLines?.length) {
      hudSystem.setWindowLines("help", helpLines, { scrollMode: "top" });
    }
  } catch {
    // no-op
  }

  const networkRoot = new THREE.Group();
  networkRoot.name = `${config.id || "network"}:root`;
  scene.add(networkRoot);

  worldHoverOutline = createWorldHoverOutline({
    THREE,
    renderer,
    camera,
    scene,
    hudSystem,
    pickables: nodeMeshes,
    mode: "silhouette",
    allowRoundGeometry: true,
    canOutline: (m) => !!m?.visible,
  });

  // VR object hit collision dot (green sphere at hit point)
  let objectHitDot = null;
  if (renderer.xr) {
    const geo = new THREE.SphereGeometry(0.08, 10, 10);
    const mat = new THREE.MeshBasicMaterial({ color: 0x4aff7a, transparent: true, opacity: 0.85 });
    objectHitDot = new THREE.Mesh(geo, mat);
    objectHitDot.visible = false;
    objectHitDot.frustumCulled = false;
    scene.add(objectHitDot);
  }

  // Distance-based label visibility constants
  const LABEL_MAX_DISTANCE = Number(config?.render?.labelMaxDistance ?? 65);
  const LABEL_FADE_START = LABEL_MAX_DISTANCE * 0.7;
  const _labelCamPos = new THREE.Vector3();
  const _labelSpritePos = new THREE.Vector3();

  const pulseEffect = createNetworkPulseEffect({
    THREE,
    parent: networkRoot,
    color: config?.pulse?.color,
    maxPulses: config?.pulse?.maxPulses,
    pulsesPerEdge: config?.pulse?.pulsesPerEdge,
    pulseRadius: config?.pulse?.pulseRadius,
    isEdgePulseable: (line) => {
      const user = line?.userData;
      if (user?.pulseable != null) return !!user.pulseable;
      const edge = user?.edge;
      if (!edge) return true;
      if (typeof config?.pulse?.isEdgePulseable === "function") return !!config.pulse.isEdgePulseable(edge);
      return true;
    },
  });

  function clearNetwork() {
    graph = null;
    derived = null;

    for (const m of nodeMeshes) {
      networkRoot.remove(m);
      m.geometry?.dispose?.();
      if (Array.isArray(m.material)) m.material.forEach((mm) => mm.dispose?.());
      else m.material?.dispose?.();
    }
    for (const l of edgeLines) {
      networkRoot.remove(l);
      l.geometry?.dispose?.();
      l.material?.dispose?.();
    }
    for (const s of labelSprites) {
      networkRoot.remove(s);
      s.material?.map?.dispose?.();
      s.material?.dispose?.();
    }

    nodeMeshes = [];
    edgeLines = [];
    labelSprites = [];
    nodeById.clear();

    pulseEffect.clear();
  }

  function applyToggles() {
    for (const l of edgeLines) l.visible = showEdges;
    for (const s of labelSprites) s.visible = showLabels;

    pulseEffect.setEdgeEmphasis(edgeLines, {
      dimOpacity: config?.pulse?.dimOpacity,
      brightOpacity: config?.pulse?.brightOpacity,
    });
  }

  function updateHotbarVisuals() {
    defaultHotbarVisuals(hudSystem, [showEdges, showLabels, false, false]);
  }

  function setSelected(nodeId) {
    selectedNodeId = nodeId || null;
    selectedAtS = nowSeconds();

    hud.setSelectionCollapsed(!selectedNodeId);

    const lines = selectedNodeId
      ? config.templates.buildSelectionLines({ ctx, hud, graph, derived, nodeId: selectedNodeId })
      : [{ text: "(none)", color: HUD_TEXT_DEFAULT_COLOR }];
    hud.setSelectionLines(lines);

    // Hover overrides selection for pulse.
    updatePulseActive();
  }

  function setHovered(nodeId) {
    hoveredNodeId = nodeId || null;
    if (hoveredNodeId) hoveredAtS = nowSeconds();

    if (!hoveredNodeId) {
      try {
        hudSystem.setExternalTooltip({ visible: false, text: "" });
      } catch {
        // no-op
      }
      updatePulseActive();
      return;
    }

    const lines = config.templates.buildHoverLines({ ctx, hud, graph, derived, nodeId: hoveredNodeId });
    const entries = Array.isArray(lines) ? lines.slice(0, 14) : [];

    const mesh = nodeById.get(hoveredNodeId);
    if (mesh) mesh.getWorldPosition(_tmpV3a);

    const { x, y, ok } = projectWorldToHud({ THREE, camera, hudSystem, worldPos: _tmpV3a, margin: 16 });

    try {
      if (!ok || !Number.isFinite(x) || !Number.isFinite(y)) {
        hudSystem.setExternalTooltip({ visible: false, text: "" });
      } else {
        hudSystem.setExternalTooltip({
          visible: true,
          entries,
          x,
          y,
          vrWorldPos: { x: _tmpV3a.x, y: _tmpV3a.y, z: _tmpV3a.z },
        });
      }
    } catch {
      // no-op
    }

    updatePulseActive();
  }

  function updatePulseActive() {
    const activeNodeId = hoveredNodeId || selectedNodeId;
    if (!activeNodeId) {
      pulseEffect.setActiveNode(null, 0);
    } else {
      pulseEffect.setActiveNode(activeNodeId, hoveredNodeId ? hoveredAtS : selectedAtS);
    }
    pulseEffect.setEdgeEmphasis(edgeLines, {
      dimOpacity: config?.pulse?.dimOpacity,
      brightOpacity: config?.pulse?.brightOpacity,
    });
  }

  function pickFromClientPoint(clientX, clientY) {
    const pointerNdc = getClientPointNdc(clientX, clientY, renderer.domElement);
    if (!pointerNdc) return null;
    _ndc.set(pointerNdc.x, pointerNdc.y);
    raycaster.setFromCamera(_ndc, camera);
    raycaster.far = 680;

    const hits = raycaster.intersectObjects(nodeMeshes, false);
    if (!hits || hits.length === 0) return null;
    const m = hits[0]?.object;
    const id = m?.userData?.id ?? m?.userData?.node?.id ?? null;
    return id || null;
  }

  function pickHitFromRay(rayOrigin, rayDir) {
    raycaster.set(rayOrigin, rayDir);
    raycaster.far = 680;
    const hits = raycaster.intersectObjects(nodeMeshes, false);
    if (!hits || hits.length === 0) return null;
    const hit = hits[0];
    const m = hit?.object;
    const id = m?.userData?.id ?? m?.userData?.node?.id ?? null;
    if (!id) return null;
    return { id, distance: hit.distance };
  }

  const picking = wireSceneSelection({
    THREE,
    renderer,
    camera,
    hudSystem,
    getWorldControlsEnabled,
    controllerRays: [ctx.controllers?.ray0, ctx.controllers?.ray1].filter(Boolean),
    pickFromClientPoint,
    pickHitFromRay,
    onHover: (id) => {
      setHovered(id);
      applyGenericNodeHighlight(nodeMeshes, { selectedId: selectedNodeId, hoveredId: hoveredNodeId });
    },
    onSelect: (id) => {
      setSelected(id);
      applyGenericNodeHighlight(nodeMeshes, { selectedId: selectedNodeId, hoveredId: hoveredNodeId });
    },
    onSelectMiss: () => {
      setSelected(null);
      applyGenericNodeHighlight(nodeMeshes, { selectedId: selectedNodeId, hoveredId: hoveredNodeId });
    },
    desktop: {
      requireWorldControlsEnabledForClick: true,
      ignoreUiForClick: true,
      ignoreUiForPointerFallback: true,
    },
  });

  async function buildNetwork() {
    clearNetwork();

    const graphUrl = getUrlParam("graph") || getUrlParam("data") || config?.data?.defaultUrl;
    const raw = await config.data.load({ url: graphUrl, timeoutMs: 15000 });
    const g = await config.data.toGraph({ raw, url: graphUrl, ctx });

    graph = g;
    derived = deriveAdjacency(graph);

    const seedParam = getUrlParam("seed");
    let seed = 1;
    if (seedParam != null && seedParam !== "") {
      const n = Number(seedParam);
      if (Number.isFinite(n)) seed = (n >>> 0) || 1;
    } else if (typeof config?.data?.seedFromGraph === "function") {
      const n = Number(config.data.seedFromGraph(graph));
      seed = Number.isFinite(n) ? (n >>> 0) || 1 : 1;
    } else {
      const n = Number(graph?.seed);
      seed = Number.isFinite(n) ? (n >>> 0) || 1 : 1;
    }

    const positions = await config.layout.computePositions({ THREE, graph, seed, ctx });

    // Nodes
    for (const node of graph.nodes || []) {
      const id = String(node.id);
      const pos = positions.get(id) || new THREE.Vector3();

      const mesh = config.render.buildNodeMesh({ THREE, node, ctx });
      mesh.position.copy(pos);
      mesh.userData.id = id;
      mesh.userData.node = node;

      nodeMeshes.push(mesh);
      nodeById.set(id, mesh);
      networkRoot.add(mesh);

      if (showLabels && config.render.labelText) {
        const labelText = config.render.labelText({ node, ctx });
        if (labelText) {
          const labelColor = config.render.labelColor ? config.render.labelColor({ node, ctx }) : "#dde3ea";
          const spr = makeLabelSprite({ text: labelText, color: labelColor });

          const off = config.render.labelOffset
            ? config.render.labelOffset({ THREE, node, ctx })
            : new THREE.Vector3(0, 2.0, 0);
          spr.position.copy(pos).add(off);
          spr.visible = showLabels;

          spr.userData.nodeId = id;
          labelSprites.push(spr);
          networkRoot.add(spr);
        }
      }
    }

    // Yield after nodes (Quest friendliness)
    await new Promise((r) => requestAnimationFrame(r));

    // Edges
    const edges = Array.isArray(graph.edges) ? graph.edges.slice() : [];
    for (const e of edges) {
      const a = String(e.fromId ?? e.from);
      const b = String(e.toId ?? e.to);
      const fromMesh = nodeById.get(a);
      const toMesh = nodeById.get(b);
      if (!fromMesh || !toMesh) continue;

      const line = config.render.buildEdgeLine({ THREE, edge: e, fromPos: fromMesh.position, toPos: toMesh.position, ctx });
      line.visible = showEdges;

      line.userData.edge = { ...e, fromId: a, toId: b };
      if (line.userData.baseOpacity == null && line.material?.opacity != null) line.userData.baseOpacity = line.material.opacity;
      if (line.userData.baseColor == null && line.material?.color?.getHex) line.userData.baseColor = line.material.color.getHex();

      // Pulse policy is config-driven.
      line.userData.pulseable = typeof config?.pulse?.isEdgePulseable === "function" ? !!config.pulse.isEdgePulseable(e) : true;

      edgeLines.push(line);
      networkRoot.add(line);
    }

    pulseEffect.rebuild(edgeLines);
    updatePulseActive();

    // Status + selection reset
    try {
      const fps = Number(hudSystem?.hud?.ui?.demo?.fps);
      const lines = config.templates.buildStatusLines({ ctx, hud, graph, derived, fps: Number.isFinite(fps) ? fps : null });
      hud.setStatusLines(lines);
    } catch {
      // no-op
    }

    setSelected(null);
    setHovered(null);
    updateHotbarVisuals();

    // Start/view (config-driven)
    try {
      await config?.view?.applyInitialView?.({ THREE, ctx, graph, positions, nodeById, navigation, rig });
    } catch {
      // no-op
    }
  }

  async function handleHotbarSlot(ev) {
    const idx = Number(ev?.index);
    if (idx === 0) {
      showEdges = !showEdges;
      applyToggles();
      updateHotbarVisuals();
      return;
    }
    if (idx === 1) {
      showLabels = !showLabels;
      applyToggles();
      updateHotbarVisuals();
      return;
    }
    if (idx === 2) {
      await buildNetwork();
      updateHotbarVisuals();
      return;
    }
    if (idx === 3) {
      try {
        await config?.view?.resetView?.({ THREE, ctx, graph, positions: null, nodeById, navigation, rig });
      } catch {
        // If no resetView provided, keep a safe default.
        rig.player.position.set(0, rig.player.position.y, 26);
        ctx.look.state.yaw = 0;
        ctx.look.state.pitch = 0;
        ctx.look.applyLook();
      }
      updateHotbarVisuals();
      return;
    }

    if (typeof config?.hud?.onHotbarSlot === "function") {
      await config.hud.onHotbarSlot({ idx, ev, ctx, graph });
    }
  }

  // Ensure hotbar callback points at our handler.
  if (hudSystem?.hud?.ui) hudSystem.hud.ui.onHotbarSlot = handleHotbarSlot;

  // Initial HUD state.
  updateHotbarVisuals();

  return ctx;
}
