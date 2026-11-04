// SPDX-License-Identifier: Apache-2.0
import { createCardGraphScene } from "./graph/card-graph-scene.js";
import { layoutFlow } from "./mermaid-flow-layout.js";

export { parseMermaidFlowchart } from "./mermaid-flow-parser.js";

/**
 * Purpose: Render a parsed Mermaid flowchart through the shared card-based graph scene so Mermaid diagrams use the same flat and spherical scene surface as workflow editors.
 * @param {object} [options] Renderer inputs.
 * @param {object} [options.THREE] Three.js namespace used to allocate meshes, vectors, and materials.
 * @param {{ add: (object: unknown) => void, remove?: (object: unknown) => void }} [options.parent] Parent object that receives the rendered flowchart group.
 * @param {{ direction: "TB" | "LR", nodes: Array<{ id: string, label: string, shape: string }>, edges: Array<{ from: string, to: string, label: string, style: string }> }} [options.parsed] Parsed Mermaid flowchart model produced by parseMermaidFlowchart.
 * @returns {{ group: unknown, nodeMeshes: Map<string, unknown>, getFlatBounds: (targetBox?: unknown) => unknown, setLayoutMode: (nextMode: string) => void, update: (dt?: number) => void, dispose: () => void }} Rendered flowchart controller exposing the shared graph scene helpers and disposal hook.
 * Side effects: allocates shared card-scene objects, adds them to the supplied parent, and disposes them when `dispose()` is called.
 */
export function renderMermaidFlowchart3d({ THREE, parent, parsed } = {}) {
  if (!THREE) throw new Error("renderMermaidFlowchart3d: THREE required");
  if (!parent) throw new Error("renderMermaidFlowchart3d: parent required");
  if (!parsed) throw new Error("renderMermaidFlowchart3d: parsed required");

  const graph = {
    nodes: parsed.nodes.map((node) => ({
      id: node.id,
      label: node.label || node.id,
      shape: node.shape,
      kind: node.shape,
    })),
    edges: parsed.edges.map((edge) => ({
      fromId: edge.from,
      toId: edge.to,
      label: edge.label || "",
      style: edge.style,
      type: edge.style === "dash" ? "conditional" : "direct",
    })),
  };

  const flatPositions = new Map();
  const layoutPositions = layoutFlow(parsed, {
    nodeW: 4.8,
    nodeD: 2.4,
    marginMajor: 2.2,
    marginMinor: 1.4,
  });

  for (const node of graph.nodes) {
    const point = layoutPositions.get(node.id) ?? { x: 0, z: 0 };
    flatPositions.set(node.id, new THREE.Vector3(point.x * 1.1, -point.z * 1.1, 0));
  }

  const sceneController = createCardGraphScene({
    THREE,
    parent,
    graph,
    positions: flatPositions,
    style: {
      cardLift: 0,
      flatOrientation: "panel",
      flatPlane: "xy",
    },
    getNodeTitle: (node) => node.label,
    getNodeSubtitle: (node) => String(node.shape || "mermaid").toUpperCase(),
    getNodeBadge: () => null,
    getNodeAccentColor: (node) => shapeAccentColor(node.shape),
    getNodeBodyColor: () => 0x15202f,
    getNodeBorderColor: (node) => shapeAccentColor(node.shape),
    getEdgeColor: (edge) => edge.style === "dash" ? 0xe2bd57 : 0x84a8cf,
    getEdgeOpacity: () => 0.9,
    getEdgeLabel: (edge) => edge.label || null,
    sphere: {
      center: new THREE.Vector3(0, 7.5, -6),
      radius: 22,
      yawSpan: Math.PI * 1.08,
      pitchSpan: Math.PI * 0.56,
    },
  });

  return {
    group: sceneController.root,
    nodeMeshes: new Map(graph.nodes.map((node) => [node.id, sceneController.getNodeMeshById(node.id)])),
    getFlatBounds: sceneController.getFlatBounds,
    setLayoutMode: sceneController.setLayoutMode,
    update: sceneController.update,
    dispose: sceneController.dispose,
  };
}

function shapeAccentColor(shape) {
  const kind = String(shape || "rect").toLowerCase();
  if (kind === "diamond") return 0xe2bd57;
  if (kind === "circle") return 0x8ed0b3;
  if (kind === "round") return 0x70aef4;
  if (kind === "db") return 0xb88df2;
  return 0x7e9fc1;
}
