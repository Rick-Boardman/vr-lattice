// SPDX-License-Identifier: Apache-2.0
const WORKFLOW_V3_ACTION_EDGE_COLORS = Object.freeze({
  direct: 0x78909c,
  conditional: 0xffa726,
  timed: 0xff7043,
  loopback: 0xab47bc,
  default: 0x607d8b,
  user_action: 0x42a5f5,
  flag: 0xef5350,
  rendezvous: 0x26c6da,
  message: 0x66bb6a,
  error: 0xff1744,
  compensation: 0xe040fb,
});

const WORKFLOW_V3_PORT_COLORS = Object.freeze({
  flow: 0xffffff,
  string: 0x9e9e9e,
  number: 0x42a5f5,
  bool: 0xfdd835,
  list: 0xab47bc,
  object: 0x66bb6a,
  file: 0xff9800,
  file_ref: 0xff9800,
  any: 0xffffff,
});

// source and destination (gm-workflow’s ingestion ends) are drawn as start and end are.
const PILL_NODE_TYPES = new Set(["start", "end", "fail", "source", "destination"]);
const DIAMOND_NODE_TYPES = new Set(["decision", "inclusive_gateway", "event_gateway"]);
const HEXAGON_NODE_TYPES = new Set(["gate", "rule"]);
const NO_ACTION_IN_NODE_TYPES = new Set(["start", "source"]);
const NO_ACTION_OUT_NODE_TYPES = new Set(["end", "fail"]);

export const WORKFLOW_V3_ACTION_EDGE_OPACITY = 0.85;
export const WORKFLOW_V3_DATA_WIRE_OPACITY = 0.6;
export const WORKFLOW_V3_ACTION_HANDLE_COLOR = 0xffffff;

export function getWorkflowV3EdgeClass(edge) {
  return edge?.fromPort && edge?.toPort ? "data" : "action";
}

export function getWorkflowV3NodeShape(node) {
  const type = String(node?.type ?? node?.node_type ?? node?.kind ?? "task").trim().toLowerCase();
  if (PILL_NODE_TYPES.has(type)) return "pill";
  if (DIAMOND_NODE_TYPES.has(type)) return "diamond";
  if (HEXAGON_NODE_TYPES.has(type)) return "hexagon";
  return "card";
}

export function getWorkflowV3ActionHandleRoles(node) {
  const type = String(node?.type ?? node?.node_type ?? node?.kind ?? "task").trim().toLowerCase();
  return {
    in: !NO_ACTION_IN_NODE_TYPES.has(type),
    out: !NO_ACTION_OUT_NODE_TYPES.has(type),
  };
}

export function getWorkflowV3PortColor(port) {
  const type = String(port?.type ?? port ?? "any").trim().toLowerCase();
  return WORKFLOW_V3_PORT_COLORS[type] ?? WORKFLOW_V3_PORT_COLORS.any;
}

export function getWorkflowV3ActionEdgeColor(edge) {
  const type = String(edge?.type ?? edge?.edge_type ?? "direct").trim().toLowerCase();
  return WORKFLOW_V3_ACTION_EDGE_COLORS[type] ?? WORKFLOW_V3_ACTION_EDGE_COLORS.direct;
}

export function getWorkflowV3ActionEdgeOpacity() {
  return WORKFLOW_V3_ACTION_EDGE_OPACITY;
}

export function getWorkflowV3DataWireColor(edge, sourcePort = null) {
  return getWorkflowV3PortColor(sourcePort?.type ?? edge?.portType ?? edge?.fromPortType ?? "any");
}

export function getWorkflowV3DataWireOpacity() {
  return WORKFLOW_V3_DATA_WIRE_OPACITY;
}

export const WORKFLOW_V3_GRAPH_VISUAL_PRESET = Object.freeze({
  getEdgeClass: getWorkflowV3EdgeClass,
  getNodeShape: getWorkflowV3NodeShape,
  getActionHandleRoles: getWorkflowV3ActionHandleRoles,
  getActionHandleColor: () => WORKFLOW_V3_ACTION_HANDLE_COLOR,
  getPortColor: getWorkflowV3PortColor,
  getActionEdgeColor: getWorkflowV3ActionEdgeColor,
  getActionEdgeOpacity: getWorkflowV3ActionEdgeOpacity,
  getDataWireColor: getWorkflowV3DataWireColor,
  getDataWireOpacity: getWorkflowV3DataWireOpacity,
});
