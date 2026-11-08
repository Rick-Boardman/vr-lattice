// SPDX-License-Identifier: Apache-2.0
/**
 * Purpose: Re-export the shared graph boot helpers from the graph runtime barrel.
 * Parameters and return values: forwarded from the corresponding exports in ./boot.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported boot helpers.
 */
export {
  detectOculusBrowser,
  configureXrSafeRenderer,
  createXrRenderer,
  wireDesktopResize,
  startAsyncBootLoop,
} from "./boot.js";

/**
 * Purpose: Re-export the canonical graph normalization helper from the graph runtime barrel.
 * Parameters and return value: forwarded from toCanonicalGraph in ./canonical.js.
 * Side effects: none in this barrel; side effects occur when callers invoke toCanonicalGraph.
 */
export { toCanonicalGraph } from "./canonical.js";

/**
 * Purpose: Re-export the shared graph scene context factory from the graph runtime barrel.
 * Parameters and return value: forwarded from createGraphSceneContext in ./context.js.
 * Side effects: none in this barrel; side effects occur when callers invoke createGraphSceneContext.
 */
export { createGraphSceneContext } from "./context.js?v=workflow4-inline-render-12";

/**
 * Purpose: Re-export the shared graph derived-metrics helpers from the graph runtime barrel.
 * Parameters and return values: forwarded from the corresponding exports in ./derived.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported derived-metrics helpers.
 */
export {
  deriveGraphStats,
  deriveAdjacency,
  getTopConnections,
  mapCountsToObject,
} from "./derived.js";

/**
 * Purpose: Re-export the shared graph scene runner helpers from the graph runtime barrel.
 * Parameters and return values: forwarded from the corresponding exports in ./graph-scene.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported graph scene runners.
 */
export { runGraphScene, startGraphSceneBoot } from "./graph-scene.js";

/**
 * Purpose: Re-export the shared graph HUD formatting helpers from the graph runtime barrel.
 * Parameters and return values: forwarded from the corresponding exports in ./hud-format.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported HUD formatting helpers.
 */
export {
  formatTopConnectionsLines,
  formatDirectedEdgeLists,
  formatAppNetworkApplicationConnectivity,
} from "./hud-format.js";

/**
 * Purpose: Re-export the shared graph HUD layout helpers from the graph runtime barrel.
 * Parameters and return values: forwarded from the corresponding exports in ./hud-layout.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported HUD layout helpers.
 */
export {
  hideHudWindow,
  ensureGraphHudWindows,
  applyStandardGraphHudLayout,
  hideDefaultDemoWindows,
} from "./hud-layout.js";

/**
 * Purpose: Re-export the shared graph JSON fetch helper from the graph runtime barrel.
 * Parameters and return value: forwarded from fetchJsonWithTimeout in ./json-io.js.
 * Side effects: none in this barrel; side effects occur when callers invoke fetchJsonWithTimeout.
 */
export { fetchJsonWithTimeout } from "./json-io.js";

/**
 * Purpose: Re-export the shared graph-document hotbar action helpers so graph apps can reuse the same primary New/Load/Save slot semantics across workflow and planning modes.
 * Parameters and return values: forwarded from the corresponding exports in ./hotbar-actions.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported helpers.
 */
export {
  resolveGraphDocumentHotbarPrimaryCommands,
  resolveGraphDocumentHotbarPrimaryItems,
} from "./hotbar-actions.js";

/**
 * Purpose: Re-export the shared graph hit-resolution helpers from the graph runtime barrel.
 * Parameters and return value: forwarded from the corresponding exports in ./picking.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported helpers.
 */
export {
  pickClosestControlGraphHitByClientPoint,
  selectPreferredGraphHit,
} from "./picking.js?v=workflow4-planning-entry-12";

/**
 * Purpose: Re-export the shared graph scene-config helpers and canonical scene configs from the graph runtime barrel.
 * Parameters and return values: forwarded from the corresponding exports in ./scene-config.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported scene-config helpers or consume the config objects.
 */
export {
  makePulseConfig,
  isPulseableEdgeKind,
  APPLICATION_NETWORK_SCENE_CONFIG,
  PEOPLE_NETWORK_SCENE_CONFIG,
} from "./scene-config.js";

/**
 * Purpose: Re-export the shared universal graph-scene launch helpers from the graph runtime barrel.
 * Parameters and return values: forwarded from the corresponding exports in ./universal-network-main.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported universal graph-scene helpers.
 */
export {
  runUniversalNetworkSceneFromJson,
  runUniversalNetworkSceneFromUrlParams,
  runUniversalNetworkScene,
} from "./universal-network-main.js";

/**
 * Purpose: Re-export the shared application-style clustered graph layout helper from the graph runtime barrel.
 * Parameters and return value: forwarded from layoutClusteredGraphApplicationStyle in ./application-style-layout.js.
 * Side effects: none in this barrel; side effects occur when callers invoke layoutClusteredGraphApplicationStyle.
 */
export { layoutClusteredGraphApplicationStyle } from "./application-style-layout.js";

/**
 * Purpose: Re-export the shared card-based graph scene helpers from the graph runtime barrel.
 * Parameters and return values: forwarded from the corresponding exports in ./card-graph-scene.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported helpers.
 */
export {
  createCardGraphScene,
  projectPlanarGraphPositionsToSphere,
} from "./card-graph-scene.js";

/**
 * Purpose: Re-export the shared workflow-v3 graph visual preset so apps can opt into the promoted legacy workflow visual grammar through the runtime library.
 * Parameters and return values: forwarded from the corresponding exports in ./workflow-v3-visual-preset.js.
 * Side effects: none in this barrel; side effects occur when callers consume the preset accessors.
 */
export {
  WORKFLOW_V3_ACTION_EDGE_OPACITY,
  WORKFLOW_V3_ACTION_HANDLE_COLOR,
  WORKFLOW_V3_DATA_WIRE_OPACITY,
  WORKFLOW_V3_GRAPH_VISUAL_PRESET,
  getWorkflowV3ActionEdgeColor,
  getWorkflowV3ActionEdgeOpacity,
  getWorkflowV3ActionHandleRoles,
  getWorkflowV3DataWireColor,
  getWorkflowV3DataWireOpacity,
  getWorkflowV3EdgeClass,
  getWorkflowV3NodeShape,
  getWorkflowV3PortColor,
} from "./workflow-v3-visual-preset.js";

/**
 * Purpose: Re-export the shared flat-board backdrop helper used by front-facing flat graph surfaces.
 * Parameters and return values: forwarded from createFlatBoardBackdrop in ./flat-board-backdrop.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the helper.
 */
export { createFlatBoardBackdrop } from "./flat-board-backdrop.js";

/**
 * Purpose: Re-export the shared network inspector HUD factory from the graph runtime barrel.
 * Parameters and return value: forwarded from createNetworkInspectorHud in ../network-inspector.js.
 * Side effects: none in this barrel; side effects occur when callers invoke createNetworkInspectorHud.
 */
export { createNetworkInspectorHud } from "../network-inspector.js";

/**
 * Purpose: Re-export the shared network pulse effect factory from the graph runtime barrel.
 * Parameters and return value: forwarded from createNetworkPulseEffect in ../network-pulse.js.
 * Side effects: none in this barrel; side effects occur when callers invoke createNetworkPulseEffect.
 */
export { createNetworkPulseEffect } from "../network-pulse.js";

/**
 * Purpose: Re-export the shared force-layout helpers from the graph runtime barrel.
 * Parameters and return values: forwarded from the corresponding exports in ../force-layout.js.
 * Side effects: none in this barrel; side effects occur when callers invoke the re-exported force-layout helpers.
 */
export { relaxSpringRepelLayout, buildSpringList } from "../force-layout.js";

/**
 * Purpose: Re-export the shared business board look, connection model and line preview used by Conduit, Loom and Insight.
 */
export {
  BUSINESS_BOARD_HUD_THEME,
  BUSINESS_BOARD_SCENE_ACCESSORS,
  BUSINESS_BOARD_SCENE_STYLE,
  BUSINESS_HOTBAR_SLOT_COLORS,
  BUSINESS_PANEL_COLORS,
  createBoardEdgePreview,
  resolveBusinessHotbarStatusColor,
} from "./business-board.js";
export { BUSINESS_ICON_PATHS, createBusinessIconTextures } from "./business-icons.js";
