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
import { layoutConnectivityNetwork3d } from "./network-connectivity-layout.js";
import { layoutPackedNetwork } from "./network-packed-layout.js";
import { layoutClusteredGraphApplicationStyle } from "./application-style-layout.js";
import { fetchJsonWithTimeout } from "./json-io.js";
import { buildDetailsLinesFromMode } from "./hud-format.js";
import {
  asHexColor,
  buildNodeMeshFromSpec,
  buildEdgeLineFromSpec,
  makeLabelSpriteFactory,
  orderOpaqueNetworkBillboards,
  applyGenericNodeHighlight,
} from "./graph-mesh-builders.js";
import { defaultHotbarVisuals, projectWorldToHud, applySmartInitialView } from "./graph-view-helpers.js";
import { createGraphSettingsHotbarItem, installGraphPanelThemeControl, resolveGraphPanelTheme } from "./panel-theme-control.js";
import { graphPanelTheme } from "./panel-theme.js";
import { createBusinessIconTextures } from "./business-icons.js";
import { graphContrastColor } from "./appearance-contrast.js";
import { createNetworkLabelProjector, retainNonoverlappingNetworkLabels } from "./network-label-collision.js";
import { createNetworkViewModel, deriveNetworkView, networkGroupKey, networkFitDistance } from "./network-view.js";


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

    networkView: json?.networkView || null,
    context: {
      renderer: {
        antialias: !oculus,
        alpha: false,
        desktopMaxPixelRatio: 2,
        oculusMaxPixelRatio: 1,
        ...(json?.context?.renderer || {}),
      },
      scene: {
        background: json?.context?.scene?.background == null ? undefined : asHexColor(json.context.scene.background, 0x0a0e27),
        fog: json?.context?.scene?.fog ?? true,
        fogColor: json?.context?.scene?.fogColor == null ? undefined : asHexColor(json.context.scene.fogColor, 0x0a0e27),
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
        if (json?.layout?.strategy === "connectivity3d") {
          return layoutConnectivityNetwork3d({ THREE, graph, groupById, settings: json.layout, seed });
        }
        if (["community", "packed"].includes(json?.layout?.strategy)) {
          return layoutPackedNetwork({ THREE, graph, groupById, settings: json.layout, seed });
        }
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

export async function runUniversalNetworkSceneFromJson(json, {appearanceSettings} = {}) {
  const cfg = compileJsonConfig(json);
  cfg.appearanceSettings = appearanceSettings ?? json.appearanceSettings;
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
  appearanceSettings,
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
  return runUniversalNetworkSceneFromJson(json,{appearanceSettings});
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
  const prefOptions=config.appearanceSettings===true ? {} : config.appearanceSettings || null;
  const graphHud=config.context?.hud ?? {};
  const baselineSlots=Number.isInteger(graphHud.hotbarSlotCount)?graphHud.hotbarSlotCount:4;
  // For default universals keep indexes 0-3, then Settings; if Help/Debug
  // are reserved, give them their own appended slots rather than stealing 2/3.
  const settingsIndex=prefOptions && prefOptions.settings!==false ? Math.max(4,baselineSlots) : -1;
  const networkViewOptions = config.networkView;
  const viewIndex = networkViewOptions ? Math.max(4, baselineSlots, settingsIndex + 1) : -1;
  const authoredSlots = Math.max(settingsIndex + 1, viewIndex + 1);
  const slotCount=authoredSlots>0 ? authoredSlots+(graphHud.reserveSystemHotbarSlots===false?0:2) : baselineSlots;
  const bakedMode=prefOptions ? (prefOptions.preference?.getMode?.() ?? resolveGraphPanelTheme(prefOptions)) : null;
  const settingsItem=settingsIndex>=0 ? createGraphSettingsHotbarItem({THREE}) : null;
  const networkIcons=settingsItem || networkViewOptions ? createBusinessIconTextures(THREE,["connectors","view","refresh","fit"]) : {};
  const hotbarTooltips=Array.isArray(config.hud?.tooltips)
    ? [...config.hud.tooltips] : ["Toggle edges","Toggle labels","Reload network","Reset view"];
  if(settingsItem) hotbarTooltips[settingsIndex]=settingsItem.tooltip;
  if(viewIndex >= 0) hotbarTooltips[viewIndex]="Network View: Overview, Focus, All Links";
  let settingsControl=null;
  let networkModel = null, visibleView = null, viewOpen = false;
  let allLinks = false, selectedGroup = null, focused = false;
  let overviewLinks = networkViewOptions?.overviewLinks ?? "group-summary";
  const changedHosts = new Set(), groupLabels = new Map();
  let summaryLines = [], visiblePulseLines = [];
  const viewWindowKey = "lattice-network-view";


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

  let activePanelTheme = graphPanelTheme(bakedMode);
  const authoredInk = new WeakMap();
  const adjustMaterial = (material,theme,target,opacity) => {
    if(!material?.color?.getHex || !material.color.setHex) return null;
    if(!authoredInk.has(material)) authoredInk.set(material,material.color.getHex());
    const base=authoredInk.get(material);
    if(!theme || !prefOptions || prefOptions.networkContrast===false) return base;
    const background=scene.background?.getHex?.() ?? theme.background;
    const alpha=Number.isFinite(opacity)?Math.max(0,Math.min(1,opacity)):1;
    return graphContrastColor(base,background,target,alpha);
  };
  const refreshNodeInk=(mesh,theme)=>{
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      const next=adjustMaterial(material,theme,3,material?.opacity);
      if(next!=null) material.color.setHex(next);
    }
  };
  const refreshEdgeInk=(line,theme)=>{
    const next=adjustMaterial(line.material,theme,2.8,line.userData.baseOpacity);
    if(next!=null){line.userData.baseColor=next;line.material.color.setHex(next);}
  };

  const explicitLabelColors = new WeakSet();
  const applyLabelTheme = (label, theme) => {
    if (!theme) return;
    const { textMesh, backgroundMesh, borderMesh } = label.userData;
    if (textMesh) {
      if (!explicitLabelColors.has(label)) textMesh.color = theme.labelColor;
      textMesh.fillOpacity = 1;
    }
    if (backgroundMesh?.material) {
      backgroundMesh.material.color.setHex(theme.labelBackgroundColor);
      backgroundMesh.material.opacity = 1;
    }
    borderMesh?.material?.color.setHex(theme.labelBorderColor);
  };
  const makeLabelSprite = makeLabelSpriteFactory({
    THREE,
    ...(config?.render?.labelSprite || {}),
    legible: !!prefOptions,
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
        ...graphHud,
        ...(bakedMode ? {theme:bakedMode} : {}),
        ...(authoredSlots > 0 ? {hotbarSlotCount:slotCount} : {}),
        hotbarTooltips:settingsItem ? hotbarTooltips : Array.isArray(config?.hud?.tooltips) ? config.hud.tooltips : undefined,
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
      if (showLabels && (labelSprites.length || groupLabels.size)) {
        _ctx.camera.getWorldPosition(_labelCamPos);
        _ctx.camera.getWorldDirection(_labelCamForward);
        _visibleOpaqueLabels.length = 0;
        const reduceLabelOverlaps = !!networkModel && networkViewOptions.labelCollision !== false
          && !renderer.xr?.isPresenting;
        _projectedNetworkLabels.length = 0;
        const labelWidth = reduceLabelOverlaps ? renderer.domElement.clientWidth : 0;
        const labelHeight = reduceLabelOverlaps ? renderer.domElement.clientHeight : 0;
        const selectedGroupKey = selectedGroup == null ? null : networkGroupKey(selectedGroup);
        for (const spr of [...labelSprites, ...groupLabels.values()]) {
          if (networkModel && (spr.userData.groupKey ? !visibleView?.overview : !visibleView?.nodeIds.has(spr.userData.nodeId))) {
            spr.visible = false; continue;
          }
          spr.getWorldPosition(_labelSpritePos);
          const dist = _labelCamPos.distanceTo(_labelSpritePos);
          const isGroup = !!spr.userData.groupKey;
          const isActive = isGroup
            ? spr.userData.groupKey === selectedGroupKey
            : spr.userData.nodeId === selectedNodeId || spr.userData.nodeId === hoveredNodeId;
          const keep = isGroup || isActive;
          if (reduceLabelOverlaps && (keep || dist <= LABEL_MAX_DISTANCE)) {
            const rect = projectNetworkLabel(spr,_labelSpritePos,_ctx.camera,labelWidth,labelHeight);
            if (rect) {
              _projectedNetworkLabels.push({label:spr,rect,depth:dist,
                protected:keep,priority:isActive ? 2 : isGroup ? 1 : 0});
            }
          }
          if (activePanelTheme) {
            // A themed plate is a readability surface, not a translucent
            // decoration: keep its ink and backing solid until culled together.
            spr.visible = isGroup || (reduceLabelOverlaps && isActive) || dist <= LABEL_MAX_DISTANCE;
            if (spr.visible) {
              const layer = spr.userData.opaqueNetworkLayer ??= { label: spr, depth: 0 };
              layer.depth = _labelSpritePos.sub(_labelCamPos).dot(_labelCamForward);
              _visibleOpaqueLabels.push(layer);
            }
          } else if (!spr.userData.groupKey && dist > LABEL_MAX_DISTANCE) {
            spr.visible = false;
          } else {
            spr.visible = true;
            const fade = dist > LABEL_FADE_START
              ? clamp(1 - (dist - LABEL_FADE_START) / (LABEL_MAX_DISTANCE - LABEL_FADE_START), 0.1, 1)
              : 1;
            const { textMesh, backgroundMesh } = spr.userData;
            if (textMesh) textMesh.fillOpacity = fade;
            if (backgroundMesh?.material) backgroundMesh.material.opacity = 0.35 * fade;
          }
        }
        if (reduceLabelOverlaps) {
          _previousNetworkLabels=retainNonoverlappingNetworkLabels(_projectedNetworkLabels,_previousNetworkLabels);
          for (const {label} of _projectedNetworkLabels) label.visible &&= _previousNetworkLabels.has(label);
        } else _previousNetworkLabels.clear();
        orderOpaqueNetworkBillboards(_visibleOpaqueLabels);
      }

      if (nodeMeshes.length) {
        const tS = nowSeconds();
        pulseEffect.setEdgeEmphasis(networkModel ? visiblePulseLines : edgeLines, {
          dimOpacity: config?.pulse?.dimOpacity,
          brightOpacity: config?.pulse?.brightOpacity,
        });
        pulseEffect.update(tS, nodeById, networkModel ? visiblePulseLines : edgeLines, { speed: config?.pulse?.speed });
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

  if(prefOptions){
    settingsControl=installGraphPanelThemeControl(ctx,prefOptions);
    ctx.appearanceSettings=settingsControl;
  }
  if(settingsItem || networkViewOptions) ctx.onDispose?.(()=>{
    settingsItem?.iconTexture?.dispose?.();
    for(const texture of Object.values(networkIcons)) texture?.dispose?.();
  });

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
  const _labelCamForward = new THREE.Vector3();
  const _visibleOpaqueLabels = [];
  const _projectedNetworkLabels = [];
  let _previousNetworkLabels = new Set();
  const projectNetworkLabel = createNetworkLabelProjector(THREE);
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

  const syncGraphAppearance=theme=>{
    activePanelTheme=theme;
    for(const label of [...labelSprites,...groupLabels.values()]) applyLabelTheme(label,theme);
    if(!prefOptions) return;
    pulseEffect.setTheme(theme?.key);
    for(const mesh of nodeMeshes) refreshNodeInk(mesh,theme);
    for(const line of [...edgeLines,...summaryLines]) refreshEdgeInk(line,theme);
    pulseEffect.setEdgeEmphasis(networkModel ? visiblePulseLines : edgeLines,{
      dimOpacity:config?.pulse?.dimOpacity,brightOpacity:config?.pulse?.brightOpacity,force:true,
    });
  };
  const detachAppearance=ctx.onPanelThemeChange?.(syncGraphAppearance);
  ctx.onDispose?.(()=>detachAppearance?.());
  syncGraphAppearance(graphPanelTheme(ctx.panelTheme));

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

    for (const label of groupLabels.values()) { networkRoot.remove(label); label.dispose?.(); }
    groupLabels.clear();
    clearSummaryLines();
    networkModel = visibleView = null;
    allLinks = focused = false; selectedGroup = null; changedHosts.clear();
    pulseEffect.clear();
  }

  function applyToggles() {
    if (networkModel) { updateNetworkView(); return; }
    for (const l of edgeLines) l.visible = showEdges;
    for (const s of labelSprites) s.visible = showLabels;

    pulseEffect.setEdgeEmphasis(edgeLines, {
      dimOpacity: config?.pulse?.dimOpacity,
      brightOpacity: config?.pulse?.brightOpacity,
    });
  }

  function clearSummaryLines() {
    for (const line of summaryLines) {
      networkRoot.remove(line);
      line.geometry?.dispose?.();
      line.material?.dispose?.();
    }
    summaryLines = [];
  }

  function buildGroupLabels() {
    if (networkViewOptions.summarizeOverview !== true || networkModel.groups.size < 2) return;
    for (const [group, ids] of networkModel.groups) {
      const key = networkGroupKey(group);
      if (nodeById.has(key)) continue;
      const label = makeLabelSprite({ text: group, color: "#dde3ea" });
      const position = new THREE.Vector3();
      let highest = -Infinity, count = 0;
      for (const id of ids) {
        const mesh = nodeById.get(id);
        if (!mesh) continue;
        position.add(mesh.position);
        highest = Math.max(highest, mesh.position.y);
        count++;
      }
      if (!count) { label.dispose?.(); continue; }
      position.multiplyScalar(1 / count);
      position.y = highest + 4;
      label.position.copy(position);
      label.scale.multiplyScalar(1.15);
      label.userData.groupKey = key;
      if (label.userData.backgroundMesh) label.userData.backgroundMesh.userData.id = key;
      applyLabelTheme(label, activePanelTheme);
      groupLabels.set(key, label);
      networkRoot.add(label);
    }
  }

  function networkPickTargets() {
    return [
      ...nodeMeshes.filter(mesh => mesh.visible),
      ...[...groupLabels.values()].filter(label => label.visible && label.userData.backgroundMesh)
        .map(label => label.userData.backgroundMesh),
    ];
  }

  function updateNetworkView() {
    if (!networkModel) return;
    visibleView = deriveNetworkView(networkModel, {
      all: allLinks, groupId: selectedGroup, nodeId: selectedNodeId, focused, expandedHosts: changedHosts, overviewLinks,
    });
    for (const node of nodeMeshes) node.visible = visibleView.nodeIds.has(node.userData.id);
    for (const label of labelSprites) label.visible = showLabels && visibleView.nodeIds.has(label.userData.nodeId);
    for (const label of groupLabels.values()) label.visible = showLabels && visibleView.overview;
    const raw = new Set(visibleView.raw);
    for (const line of edgeLines) line.visible = showEdges && raw.has(line.userData.sourceEdge);
    clearSummaryLines();
    if (showEdges) for (const edge of visibleView.aggregated) {
      const from = edge.anchorFromId != null ? nodeById.get(edge.anchorFromId)
        : groupLabels.get(edge.fromId) ?? nodeById.get(edge.fromId);
      const to = edge.anchorToId != null ? nodeById.get(edge.anchorToId)
        : groupLabels.get(edge.toId) ?? nodeById.get(edge.toId);
      if (!from || !to) continue;
      const line = config.render.buildEdgeLine({
        THREE, edge: { ...edge, type: "summary" }, fromPos: from.position, toPos: to.position, ctx,
      });
      line.userData.edge = { ...edge, aggregate: true };
      line.userData.pulseable = false;
      if (prefOptions) refreshEdgeInk(line, activePanelTheme);
      summaryLines.push(line);
      networkRoot.add(line);
    }
    visiblePulseLines = edgeLines.filter(line => line.visible);
    pulseEffect.rebuild(visiblePulseLines);
    updatePulseActive();
    renderNetworkViewPanel();
  }

  function fitNetworkView() {
    if (!visibleView || renderer.xr?.isPresenting) return false;
    const box = new THREE.Box3();
    for (const mesh of nodeMeshes) if (mesh.visible) box.expandByObject(mesh);
    if (visibleView.overview) for (const label of groupLabels.values()) if (label.visible) box.expandByObject(label);
    if (box.isEmpty()) return false;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const center = sphere.center;
    const radius = Math.max(2, sphere.radius);
    // A focused graph needs room between its open floating view and target panels.
    // Use their actual layout extents; if they leave no usable central corridor,
    // keep the standard full-viewport fit and let the user move/collapse the panels.
    let fraction = 1, horizontalOffset = 0;
    const ui = hudSystem.hud;
    const viewport = Number(ui?.layoutW);
    if (focused && viewport > 0) {
      const windows = ui.ui?.windows;
      const view = viewOpen ? windows?.[viewWindowKey] : null;
      const target = windows?.selection;
      const onScreen = win => win && !win.collapsed && !win.hidden && win.x < viewport &&
        win.x + win.w > 0 && win.y < Number(ui.layoutH) && win.y + win.h > 0;
      const left = onScreen(view) && view.x < viewport * 0.5 ? Math.max(0, view.x + view.w + 14) : 0;
      const right = onScreen(target) && target.x >= viewport * 0.5 ? Math.min(viewport, target.x - 14) : viewport;
      if (right - left >= viewport * 0.32) {
        fraction = (right - left) / viewport;
        horizontalOffset = 1 - (left + right) / viewport;
      }
    }
    const distance = Math.max(8, networkFitDistance(radius, camera.fov, camera.aspect * fraction));
    for (const label of groupLabels.values()) {
      const base = label.userData.overviewBaseScale ??= label.scale.clone();
      label.scale.copy(base).multiplyScalar(Math.max(1, distance / 92));
    }
    // A stable elevated outlook shows the entire layout instead of choosing one random group.
    const out = new THREE.Vector3(0.08, 0.61, 0.8).normalize();
    const right = new THREE.Vector3(out.z, 0, -out.x).normalize();
    const shift = horizontalOffset * distance * Math.tan(camera.fov * Math.PI / 360) * camera.aspect;
    const lookAtCenter = center.clone().addScaledVector(right, shift);
    rig.player.position.copy(lookAtCenter).addScaledVector(out, distance);
    camera.far = Math.max(camera.far, distance + 2.2 * radius);
    camera.updateProjectionMatrix();
    if (scene.fog?.isFog) {
      scene.fog.near = Math.max(0, distance - 1.06 * radius);
      scene.fog.far = distance + 3 * radius;
    }
    navigation?.lookAtWorld?.(lookAtCenter);
    return true;
  }

  function restoreNetworkOverview() {
    allLinks = false;
    setSelected(null);
    applyGenericNodeHighlight(nodeMeshes, { selectedId: null, hoveredId: hoveredNodeId });
    fitNetworkView();
  }

  function focusNetworkSelection() {
    if (!selectedNodeId && selectedGroup == null) return;
    allLinks = false; focused = true;
    updateNetworkView(); fitNetworkView();
  }

  function toggleNetworkHost(id) {
    if (!networkModel?.children.has(id)) return false;
    if (changedHosts.has(id)) changedHosts.delete(id); else changedHosts.add(id);
    allLinks = false;
    updateNetworkView();
    return true;
  }

  function showAllNetworkLinks() {
    showEdges = true;
    allLinks = true; focused = false;
    updateNetworkView(); updateHotbarVisuals();
  }

  function setNetworkOverviewLinks(mode) {
    if (mode !== "backbone" && mode !== "group-summary") return false;
    overviewLinks = mode;
    restoreNetworkOverview();
    return true;
  }

  function renderNetworkViewPanel() {
    if (!viewOpen || !networkModel) return;
    const action = (text, label, onClick) => ({
      text, actionButtonText: label, actionButtonWidthPx: 108, actionButtonOnClick: onClick,
    });
    const title = selectedGroup ?? (selectedNodeId ? pickTextFromFields(nodeById.get(selectedNodeId)?.userData.node, ["name", "label", "id"]) : null);
    const rows = [
      { text: allLinks ? "All links" : focused ? "Focused view" : title ? "Selected relationships" :
        visibleView?.backbone ? "Connectivity backbone" : "Overview" },
      action("Return to overview", "Back", restoreNetworkOverview),
      action("Show original relationships", "All Links", showAllNetworkLinks),
      action("Frame visible graph", "Fit", fitNetworkView),
    ];
    const represented = visibleView?.aggregated.reduce((sum, edge) => sum + edge.count, 0) ?? 0;
    if (visibleView?.backbone) {
      rows.push({ text: `${visibleView.aggregated.length} of ${visibleView.overviewPathCount} connection paths` });
      if (represented) rows.push({ text: `${represented} source links in the displayed paths` });
    } else if (represented) rows.push({ text: `${represented} links in ${visibleView.aggregated.length} grouped paths` });
    if (networkViewOptions.overviewLinks === "backbone" || networkViewOptions.overviewLinks === "group-summary") {
      const alternative = overviewLinks === "backbone" ? "group-summary" : "backbone";
      rows.push(action(alternative === "backbone" ? "Show strongest paths and bridges" : "Show all group-to-group paths",
        alternative === "backbone" ? "Backbone" : "Grouped", () => setNetworkOverviewLinks(alternative)));
    }
    if (focused && selectedGroup != null) rows.push({ text: "Group members and internal links only" });
    if (title) rows.push(action(title, "Focus", focusNetworkSelection));
    const children = networkModel.children.get(selectedNodeId);
    if (children?.length) {
      const open = allLinks || (networkModel.options.hierarchy?.collapsedByDefault === false
        ? !changedHosts.has(selectedNodeId) : changedHosts.has(selectedNodeId));
      rows.push(action(`${children.length} dependent items`, open ? "Collapse" : "Expand", () => toggleNetworkHost(selectedNodeId)));
    }
    if (!title && groupLabels.size) for (const group of networkModel.groups.keys()) {
      rows.push(action(group, "Select", () => setSelected(networkGroupKey(group))));
    }
    hudSystem.setWindowLines(viewWindowKey, rows, { scrollMode: "top" });
  }

  function toggleNetworkViewPanel() {
    if (viewOpen) {
      viewOpen = false;
      hudSystem.destroyWindow?.(viewWindowKey);
    } else {
      hudSystem.createWindow(viewWindowKey, {
        title: "Network View", x: 16, y: 84, w: 326, h: 260, scrollable: true,
        onClose: () => toggleNetworkViewPanel(),
      });
      viewOpen = true;
      renderNetworkViewPanel();
    }
    updateHotbarVisuals();
  }

  function updateHotbarVisuals() {
    if((!settingsItem && !networkViewOptions) || typeof hudSystem.setHotbarItems!=="function"){
      defaultHotbarVisuals(hudSystem,[showEdges,showLabels,false,false]);
      return;
    }
    const items=[...(hudSystem.hud?.ui?.data?.hotbarItems ?? new Array(slotCount))];
    const specs=[
      [networkIcons.connectors,"EDGE",showEdges],
      [networkIcons.view,"LABEL",showLabels],
      [networkIcons.refresh,"LOAD",false],
      [networkIcons.fit,"FIT",false],
    ];
    for(const [index,[iconTexture,shortLabel,active]] of specs.entries()){
      items[index]={...items[index],systemSlot:false,showNumber:false,tooltip:hotbarTooltips[index],
        iconTexture,iconText:shortLabel,shortLabel,active};
    }
    if(settingsItem) items[settingsIndex]={...settingsItem,systemSlot:false,showNumber:false};
    if(viewIndex >= 0) items[viewIndex]={systemSlot:false,showNumber:false,tooltip:hotbarTooltips[viewIndex],
      iconTexture:networkIcons.view,iconText:"VIEW",shortLabel:"VIEW",active:viewOpen};
    hudSystem.setHotbarItems(items);
  }

  function setSelected(nodeId) {
    if (networkModel) {
      selectedGroup = nodeId && groupLabels.has(nodeId) ? nodeId.slice("group:".length) : null;
      if (nodeId) allLinks = false;
      focused = false;
    }
    selectedNodeId = selectedGroup ? null : nodeId || null;
    selectedAtS = nowSeconds();

    hud.setSelectionCollapsed(!selectedNodeId && !selectedGroup);

    const lines = selectedNodeId
      ? config.templates.buildSelectionLines({ ctx, hud, graph, derived, nodeId: selectedNodeId })
      : [{ text: selectedGroup ?? "(none)", color: HUD_TEXT_DEFAULT_COLOR }];
    hud.setSelectionLines(lines);
    if (networkModel) updateNetworkView();

    // Hover overrides selection for pulse.
    updatePulseActive();
  }

  function setHovered(nodeId) {
    hoveredNodeId = nodeId && !groupLabels.has(nodeId) ? nodeId : null;
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
    pulseEffect.setEdgeEmphasis(networkModel ? visiblePulseLines : edgeLines, {
      dimOpacity: config?.pulse?.dimOpacity,
      brightOpacity: config?.pulse?.brightOpacity,
    });
  }

  function pickFromClientPoint(clientX, clientY) {
    const pointerNdc = getClientPointNdc(clientX, clientY, renderer.domElement);
    if (!pointerNdc) return null;
    _ndc.set(pointerNdc.x, pointerNdc.y);
    raycaster.setFromCamera(_ndc, camera);
    raycaster.far = networkModel ? camera.far : 680;

    const hits = raycaster.intersectObjects(networkModel ? networkPickTargets() : nodeMeshes, false);
    if (!hits || hits.length === 0) return null;
    const m = hits[0]?.object;
    const id = m?.userData?.id ?? m?.userData?.node?.id ?? null;
    return id || null;
  }

  function pickHitFromRay(rayOrigin, rayDir) {
    raycaster.set(rayOrigin, rayDir);
    raycaster.far = networkModel ? camera.far : 680;
    const hits = raycaster.intersectObjects(networkModel ? networkPickTargets() : nodeMeshes, false);
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
      if(prefOptions) refreshNodeInk(mesh,activePanelTheme);

      nodeMeshes.push(mesh);
      nodeById.set(id, mesh);
      networkRoot.add(mesh);

      if ((showLabels || networkViewOptions) && config.render.labelText) {
        const labelText = config.render.labelText({ node, ctx });
        if (labelText) {
          const labelColor = config.render.labelColor ? config.render.labelColor({ node, ctx }) : "#dde3ea";
          const spr = makeLabelSprite({ text: labelText, color: labelColor });
          if (config.render.labelColor) explicitLabelColors.add(spr);
          applyLabelTheme(spr, activePanelTheme);

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
      line.userData.sourceEdge = e;
      if (line.userData.baseOpacity == null && line.material?.opacity != null) line.userData.baseOpacity = line.material.opacity;
      if (line.userData.baseColor == null && line.material?.color?.getHex) line.userData.baseColor = line.material.color.getHex();

      if(prefOptions) refreshEdgeInk(line,activePanelTheme);

      // Pulse policy is config-driven.
      line.userData.pulseable = typeof config?.pulse?.isEdgePulseable === "function" ? !!config.pulse.isEdgePulseable(e) : true;

      edgeLines.push(line);
      networkRoot.add(line);
    }

    if (networkViewOptions) {
      const map = positions.clusterByNode ?? new Map();
      networkModel = createNetworkViewModel(graph, map, networkViewOptions, positions.communityByNode);
      buildGroupLabels();
    } else pulseEffect.rebuild(edgeLines);
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
      if (networkModel && !renderer.xr?.isPresenting) fitNetworkView();
      else await config?.view?.applyInitialView?.({ THREE, ctx, graph, positions, nodeById, navigation, rig });
    } catch {
      // no-op
    }
  }

  async function handleHotbarSlot(ev) {
    const idx = Number(ev?.index);
    if (viewIndex>=0 && idx===viewIndex) { toggleNetworkViewPanel(); return; }
    if (settingsIndex>=0 && idx===settingsIndex) {settingsControl?.toggleSettings();return;}
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
      if (networkModel && !renderer.xr?.isPresenting) {fitNetworkView(); return;}
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

  if (networkViewOptions) {
    ctx.networkView = {
      snapshot: () => visibleView ? { all: allLinks, focused, selectedGroup, selectedNodeId,
        overviewLinks, backbone: visibleView.backbone, overviewPathCount: visibleView.overviewPathCount,
        nodeIds: [...visibleView.nodeIds], raw: visibleView.raw.length, aggregates: visibleView.aggregated.map(edge => ({...edge})),
        groups: [...(networkModel?.groups.keys() ?? [])] } : null,
      showAll: showAllNetworkLinks,
      back: restoreNetworkOverview,
      focus: focusNetworkSelection,
      selectGroup: id => { if (networkModel?.groups.has(id)) setSelected(networkGroupKey(id)); },
      toggleHost: toggleNetworkHost,
      setOverviewLinks: setNetworkOverviewLinks,
      fit: fitNetworkView,
      togglePanel: toggleNetworkViewPanel,
    };
  }
  return ctx;
}
