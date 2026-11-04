import * as THREE from "three";
import { createGraphSceneContext, toCanonicalGraph } from "../../src/graph/index.js";
import { buildNodeMeshFromSpec, buildEdgeLineFromSpec, createBillboardTextLabel, setGraphTroikaText } from "../../src/graph/graph-mesh-builders.js";
import { renderHudFrame, startAnimationLoop } from "@rb/halo";
import { wireSceneSelection } from "@rb/halo/src/navigation/scene-selection.js";
import { HUD_WINDOW_TITLE_HEIGHT_PX } from "@rb/halo/src/hud-layout-policy.js";

const graph = toCanonicalGraph({
  nodes: [
    { id: "input", kind: "step", label: "Input" },
    { id: "transform", kind: "step", label: "Transform" },
    { id: "output", kind: "step", label: "Output" },
  ],
  edges: [{ from: "input", to: "transform", kind: "flow" }, { from: "transform", to: "output", kind: "flow" }],
});
const ctx = createGraphSceneContext({
  THREE, canvas: document.getElementById("c"),
  hud: {
    uiPreset: "minimal", visibleWindowKeys: ["hotbar"],
    ensureHelpWindow: false, ensureSelectionWindow: false,
    applyStandardLayout: false, hideDemoWindows: false,
    reserveSystemHotbarSlots: false,
    onHotbarSlot: ({ index }) => [fitGraph, resetView, toggleHelp, toggleDiagnostics][index]?.(),
  },
});
const { hudSystem, camera, renderer } = ctx;
const meshes = new Map(), labels = [];
const positions = new Map(graph.nodes.map((node, index) => [node.id, new THREE.Vector3((index - 1) * 5, 0, 0)]));
const descriptions = { input: "Receive source data.", transform: "Shape and combine the data.", output: "Deliver the result." };
for (const node of graph.nodes) {
  const mesh = buildNodeMeshFromSpec({ THREE, node, spec: { defaultColor: 0x59c7e8 } });
  mesh.position.copy(positions.get(node.id));
  mesh.userData.nodeId = node.id;
  ctx.scene.add(mesh);
  meshes.set(node.id, mesh);
  const label = createBillboardTextLabel({ THREE, text: node.label, scale: [3.8, 0.9, 1], backgroundOpacity: 0 });
  setGraphTroikaText(label.userData.textMesh, { text: node.label, fontSize: 0.65 });
  label.position.copy(mesh.position).add(new THREE.Vector3(0, -2, 0));
  ctx.scene.add(label);
  labels.push(label);
}
for (const edge of graph.edges) ctx.scene.add(buildEdgeLineFromSpec({ THREE, edge, fromPos: positions.get(edge.from), toPos: positions.get(edge.to), spec: { defaultColor: 0xcbd5e1 } }));

const panelOptions = { minW: 120, minH: 60, draggable: false, resizable: false, minimizable: false, closeable: false };
hudSystem.createWindow("example", { ...panelOptions, title: "LATTICE / SAMPLE FLOW", w: 280, h: 110 });
hudSystem.setWindowLines("example", [{ text: "3 nodes / 2 connections" }, { text: "Click a node to inspect it." }]);
hudSystem.createWindow("help", { ...panelOptions, title: "HELP / NAVIGATION", w: 300, h: 290, minimizable: true, scrollable: true });
hudSystem.setHelpOverrideLines([
  { text: "Left drag: look around" }, { text: "Click / tap: select a node" },
  { text: "W A S D: move / strafe" }, { text: "T / G: move up / down" },
  { text: "Q / E: turn, R / F: tilt" }, { text: "Z / C: roll, Shift: faster" },
  { text: "Touch: drag to look" }, { text: "FIT: frame the graph" }, { text: "RESET: restore front view" },
]);
hudSystem.createWindow("selection", { ...panelOptions, title: "SELECTED NODE", w: 280, h: 150, scrollable: true, closeable: true, onClose: () => selectNode(null) });
hudSystem.setWindowHidden("selection", true);
hudSystem.setHotbarItems([
  { iconText: "FIT", slotWidthPx: 68, showNumber: false, tooltip: "Fit graph: frame all nodes in the available space" },
  { iconText: "RESET", slotWidthPx: 88, showNumber: false, tooltip: "Reset view: restore the front view and stop movement" },
  { iconText: "HELP", slotWidthPx: 68, showNumber: false, tooltip: "Expand or collapse navigation help" },
  { iconText: "TOOLS", slotWidthPx: 88, showNumber: false, tooltip: "Show or hide debug and system log panels" },
]);
const toolbar = hudSystem.hud.ui.windows.hotbar;
Object.assign(toolbar, { draggable: false, resizable: false });

let selectedId = null, diagnosticsOpen = false, layoutSignature = "", narrowMode = null, graphViewport = null;
function selectNode(id) {
  selectedId = id;
  for (const [key, mesh] of meshes) mesh.material.emissive.setHex(key === id ? 0x235b72 : 0);
  hudSystem.setWindowHidden("selection", !id);
  if (id) {
    const node = graph.nodes.find(entry => entry.id === id);
    const incoming = graph.edges.filter(edge => edge.to === id).length;
    const outgoing = graph.edges.filter(edge => edge.from === id).length;
    hudSystem.setWindowLines("selection", [
      { text: node.label }, { text: descriptions[id] }, { text: `${incoming} incoming / ${outgoing} outgoing` },
    ]);
  }
  if (layoutPanels() && narrowMode) fitGraph();
}
function toggleHelp() {
  const help = hudSystem.hud.ui.windows.help;
  if (narrowMode && diagnosticsOpen && help.collapsed) toggleDiagnostics();
  hudSystem.setWindowCollapsed("help", !help.collapsed);
  layoutPanels();
  fitGraph();
}
function toggleDiagnostics() {
  diagnosticsOpen = !diagnosticsOpen;
  for (const key of ["debug", "chat"]) {
    hudSystem.createWindow(key, { ...panelOptions, title: key === "debug" ? "DEBUG" : "SYSTEM LOG", w: 280, h: 150, scrollable: true });
    Object.assign(hudSystem.hud.ui.windows[key], { ...panelOptions, minimizable: true, closeable: true, onClose: toggleDiagnostics });
    hudSystem.setWindowHidden(key, !diagnosticsOpen);
  }
  hudSystem.hud.ui.windows.chat.title = "SYSTEM LOG";
  hudSystem.setWindowLines("chat", [{ text: "Sample graph loaded locally." }, { text: "No remote services connected." }]);
  if (diagnosticsOpen && narrowMode) hudSystem.setWindowCollapsed("help", true);
  layoutPanels();
  fitGraph();
}

function layoutPanels() {
  const hud = hudSystem.hud;
  const { layoutW: width, layoutH: height, ui } = hud;
  const needsInitialization = !ui._layoutInitialized;
  const helpWasCollapsed = ui.windows.help.collapsed;
  // Initialize before placement, but never re-enter HUD click handling from
  // a toolbar callback: the current pointer press is still being processed.
  if (needsInitialization) hudSystem.update(0);
  const narrow = width < 960;
  if (narrow !== narrowMode) {
    narrowMode = narrow;
    hudSystem.setWindowCollapsed("help", narrow);
  } else if (needsInitialization) {
    hudSystem.setWindowCollapsed("help", helpWasCollapsed);
  }
  const signature = [width, height, selectedId, diagnosticsOpen, ui.windows.help.collapsed, ui.windows.debug?.collapsed, ui.windows.chat?.collapsed].join(":");
  if (signature === layoutSignature && !needsInitialization) return false;
  layoutSignature = signature;
  const margin = 16, gap = 12;
  const short = height < 650;
  const infoHeight = short ? 86 : 110;
  const slotWidths = width < 380 ? [56, 68, 56, 68] : [68, 88, 68, 88];
  ui.data.hotbarItems.forEach((item, index) => { item.slotWidthPx = slotWidths[index]; });
  const size = hudSystem.syncHotbarWindowSize();
  Object.assign(toolbar, { x: (width - size.w) / 2, y: height - margin - size.h });
  const sideWidth = narrow ? width - margin * 2 : 280;
  Object.assign(ui.windows.example, { x: margin, y: margin, w: sideWidth, h: infoHeight });
  let leftBottom = margin + infoHeight;
  const showSelection = selectedId && !(narrow && (diagnosticsOpen || (short && !ui.windows.help.collapsed)));
  hudSystem.setWindowHidden("selection", !showSelection);
  if (showSelection) {
    const selectionHeight = short ? 86 : 150;
    Object.assign(ui.windows.selection, { x: margin, y: leftBottom + gap, w: sideWidth, h: selectionHeight });
    leftBottom += gap + selectionHeight;
  }
  const help = ui.windows.help;
  const helpHeight = narrow ? Math.min(290, Math.max(100, toolbar.y - leftBottom - gap * 3 - 100)) : 290;
  Object.assign(help, { x: narrow ? margin : width - margin - 300, y: narrow ? leftBottom + gap : margin, w: narrow ? sideWidth : 300, h: helpHeight });
  let top = narrow ? help.y + (help.collapsed ? HUD_WINDOW_TITLE_HEIGHT_PX : help.h) + gap : 130;
  if (diagnosticsOpen) {
    let y = narrow ? top : leftBottom + gap;
    for (const key of ["debug", "chat"]) {
      const win = ui.windows[key];
      const diagnosticHeight = narrow
        ? Math.max(44, Math.min(100, (toolbar.y - gap - top - 60 - gap * 2) / 2))
        : Math.max(44, Math.min(150, (height - margin - leftBottom - gap * 2) / 2));
      Object.assign(win, { x: margin, y, w: sideWidth, h: diagnosticHeight });
      y += (win.collapsed ? HUD_WINDOW_TITLE_HEIGHT_PX : win.h) + gap;
    }
    if (narrow) top = y;
  }
  const left = narrow ? margin : margin + sideWidth + gap;
  const right = narrow ? width - margin : width - 300 - margin - gap;
  graphViewport = { x: left, y: top, w: Math.max(40, right - left), h: Math.max(40, toolbar.y - gap - top) };
  hud._dirty = true;
  return true;
}

// Include sphere radii and label extents, independent of asynchronous font loading.
const graphBounds = new THREE.Box3();
for (const position of positions.values()) {
  graphBounds.expandByPoint(position.clone().add(new THREE.Vector3(-1.9, -2.5, -1.2)));
  graphBounds.expandByPoint(position.clone().add(new THREE.Vector3(1.9, 1.2, 1.2)));
}
function fitGraph() {
  if (!graphViewport || renderer.xr.isPresenting) return;
  camera.updateWorldMatrix(true, false);
  const rotation = camera.getWorldQuaternion(new THREE.Quaternion());
  const inverse = rotation.clone().invert();
  const viewBounds = new THREE.Box3();
  for (const x of [graphBounds.min.x, graphBounds.max.x]) for (const y of [graphBounds.min.y, graphBounds.max.y]) for (const z of [graphBounds.min.z, graphBounds.max.z]) {
    viewBounds.expandByPoint(new THREE.Vector3(x, y, z).applyQuaternion(inverse));
  }
  const span = viewBounds.getSize(new THREE.Vector3());
  const { layoutW: width, layoutH: height } = hudSystem.hud;
  const area = graphViewport;
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const distance = 1.18 * Math.max(span.x / (2 * tan * camera.aspect * area.w / width), span.y / (2 * tan * area.h / height)) + span.z / 2;
  const desired = viewBounds.getCenter(new THREE.Vector3()).add(new THREE.Vector3(
    (width / 2 - area.x - area.w / 2) * 2 * distance * tan / height,
    (area.y + area.h / 2 - height / 2) * 2 * distance * tan / height,
    distance,
  )).applyQuaternion(rotation);
  ctx.rig.player.position.add(desired.sub(camera.getWorldPosition(new THREE.Vector3())));
  camera.updateWorldMatrix(true, false);
}
function resetView() {
  ctx.navigation.autoWalk = false;
  ctx.navigation.keysDown.clear();
  ctx.look.setYaw(0);
  ctx.look.setPitch(0);
  ctx.look.state.roll = 0;
  ctx.look.applyLook();
  fitGraph();
}

const raycaster = new THREE.Raycaster();
function hitFromRay() {
  const hit = raycaster.intersectObjects([...meshes.values()], false)[0];
  return hit ? { id: hit.object.userData.nodeId, distance: hit.distance, point: hit.point } : null;
}
const selection = wireSceneSelection({
  THREE, renderer, camera, hudSystem, controllerRays: [ctx.controllers?.ray0, ctx.controllers?.ray1].filter(Boolean),
  getWorldControlsEnabled: ctx.getWorldControlsEnabled,
  pickFromClientPoint(x, y) {
    const rect = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((x - rect.left) / rect.width * 2 - 1, 1 - (y - rect.top) / rect.height * 2), camera);
    return hitFromRay()?.id ?? null;
  },
  pickHitFromRay(origin, direction) { raycaster.set(origin, direction); return hitFromRay(); },
  onSelect: selectNode, onSelectMiss: () => selectNode(null),
  desktop: { ignoreUiForClick: true },
});
layoutPanels();
resetView();
startAnimationLoop({
  renderer, THREE, maxDelta: 0.05,
  onFrame: ({ dt }) => {
    if (layoutPanels()) fitGraph();
    selection.updateVrHover();
    renderHudFrame({ ...ctx, dt });
  },
});
globalThis.__latticeExample = { ctx, graph, meshes, labels, fitGraph, resetView, getGraphViewport: () => graphViewport, getSelectedId: () => selectedId };
window.addEventListener("pagehide", () => {
  renderer.setAnimationLoop(null);
  selection.dispose();
  for (const label of labels) label.dispose();
  ctx.scene.traverse(object => {
    object.geometry?.dispose();
    for (const material of [object.material].flat()) material?.dispose();
  });
  ctx.navigation.dispose();
  hudSystem.dispose();
  ctx.dispose();
  renderer.dispose();
}, { once: true });
