// SPDX-License-Identifier: Apache-2.0
import dagre from "@dagrejs/dagre";
import { layoutFlow } from "./mermaid-flow-layout.js";

const SIDE_BAND_LAYER_FRACTION = 0.65;
const SIDE_BAND_GAP_MULTIPLE = 1.75;
const SIDE_BAND_MINOR_SPACING = 0.95;
const ROOT_CONTAINER_KEY = "__root__";

function resolveContainerKey(containerId) {
  return String(containerId ?? ROOT_CONTAINER_KEY);
}

function cloneBounds(bounds) {
  return {
    minX: Number(bounds?.minX ?? 0),
    maxX: Number(bounds?.maxX ?? 0),
    minZ: Number(bounds?.minZ ?? 0),
    maxZ: Number(bounds?.maxZ ?? 0),
  };
}

function offsetBounds(bounds, offset) {
  return {
    minX: Number(bounds?.minX ?? 0) + Number(offset?.x ?? 0),
    maxX: Number(bounds?.maxX ?? 0) + Number(offset?.x ?? 0),
    minZ: Number(bounds?.minZ ?? 0) + Number(offset?.z ?? 0),
    maxZ: Number(bounds?.maxZ ?? 0) + Number(offset?.z ?? 0),
  };
}

function shiftBounds(bounds, x, z) {
  bounds.minX -= x;
  bounds.maxX -= x;
  bounds.minZ -= z;
  bounds.maxZ -= z;
  return bounds;
}

function normalizeBounds(bounds) {
  const minX = Number(bounds?.minX ?? 0);
  const maxX = Number(bounds?.maxX ?? 0);
  const minZ = Number(bounds?.minZ ?? 0);
  const maxZ = Number(bounds?.maxZ ?? 0);
  return {
    minX: Math.min(minX, maxX),
    maxX: Math.max(minX, maxX),
    minZ: Math.min(minZ, maxZ),
    maxZ: Math.max(minZ, maxZ),
  };
}

function coerceDirection(value, fallback = "TB") {
  const normalized = String(value ?? fallback).trim().toUpperCase();
  if (["TB", "TD", "BT", "LR", "RL"].includes(normalized)) return normalized;
  return fallback;
}

function normalizeClusterPath(path) {
  if (Array.isArray(path)) {
    return path
      .map((entry) => {
        if (entry && typeof entry === "object") {
          return String(entry.id ?? entry.clusterId ?? entry.label ?? entry.name ?? "").trim();
        }
        return String(entry ?? "").trim();
      })
      .filter(Boolean);
  }
  if (path == null) return [];
  const single = String(path ?? "").trim();
  return single ? [single] : [];
}

function nodeBelongsToContainer(node, containerId) {
  if (containerId == null) return true;
  const clusterPath = normalizeClusterPath(node?.clusterPath);
  return clusterPath.includes(String(containerId));
}

function resolveDirectChildItemId(node, containerId) {
  const clusterPath = normalizeClusterPath(node?.clusterPath);
  if (containerId == null) {
    return clusterPath[0] ?? String(node?.id ?? "").trim();
  }
  const index = clusterPath.indexOf(String(containerId));
  if (index >= 0 && index + 1 < clusterPath.length) {
    return clusterPath[index + 1];
  }
  return String(node?.id ?? "").trim();
}

function itemMajorSpan(item, direction) {
  return coerceDirection(direction) === "LR" ? Number(item?.width ?? 0) : Number(item?.height ?? 0);
}

function itemMinorSpan(item, direction) {
  return coerceDirection(direction) === "LR" ? Number(item?.height ?? 0) : Number(item?.width ?? 0);
}

function resolveLayoutMajorValue(position, direction) {
  return coerceDirection(direction) === "LR"
    ? Number(position?.x ?? 0)
    : Number(position?.z ?? 0);
}

function resolveLayoutMinorValue(position, direction) {
  return coerceDirection(direction) === "LR"
    ? Number(position?.z ?? 0)
    : Number(position?.x ?? 0);
}

function countLayoutRankViolations(positions, edges, direction) {
  let count = 0;
  for (const edge of Array.isArray(edges) ? edges : []) {
    if (!edge || edge.layoutIgnore !== false) continue;
    const from = positions.get(String(edge.from ?? "").trim());
    const to = positions.get(String(edge.to ?? "").trim());
    if (!from || !to) continue;
    if (resolveLayoutMajorValue(to, direction) <= resolveLayoutMajorValue(from, direction) + 1e-6) {
      count += 1;
    }
  }
  return count;
}

function resolveBoundsMajorRange(bounds, direction) {
  const normalizedDirection = coerceDirection(direction);
  return normalizedDirection === "LR"
    ? {
      min: Number(bounds?.minX ?? 0),
      max: Number(bounds?.maxX ?? 0),
    }
    : {
      min: Number(bounds?.minZ ?? 0),
      max: Number(bounds?.maxZ ?? 0),
    };
}

function resolveBoundsMinorRange(bounds, direction) {
  const normalizedDirection = coerceDirection(direction);
  return normalizedDirection === "LR"
    ? {
      min: Number(bounds?.minZ ?? 0),
      max: Number(bounds?.maxZ ?? 0),
    }
    : {
      min: Number(bounds?.minX ?? 0),
      max: Number(bounds?.maxX ?? 0),
    };
}

function resolveBoundsMinorCenter(bounds, direction) {
  const minorRange = resolveBoundsMinorRange(bounds, direction);
  return (minorRange.min + minorRange.max) * 0.5;
}

function resolveBoundsMinorSpan(bounds, direction) {
  const minorRange = resolveBoundsMinorRange(bounds, direction);
  return Math.max(0, minorRange.max - minorRange.min);
}

function resolveBoundsMajorCenter(bounds, direction) {
  const majorRange = resolveBoundsMajorRange(bounds, direction);
  return (majorRange.min + majorRange.max) * 0.5;
}

function resolveBoundsMajorSpan(bounds, direction) {
  const majorRange = resolveBoundsMajorRange(bounds, direction);
  return Math.max(0, majorRange.max - majorRange.min);
}

function layoutVariableItems(items, edges, direction, {
  baseMajorGap = 1,
  baseMinorGap = 1,
} = {}) {
  const byId = new Map((Array.isArray(items) ? items : []).map((item) => [item.id, item]));
  const layoutIn = new Map(Array.from(byId.keys(), (id) => [id, 0]));
  const layoutOut = new Map(Array.from(byId.keys(), (id) => [id, 0]));
  const layoutPreds = new Map(Array.from(byId.keys(), (id) => [id, []]));
  const layoutSuccs = new Map(Array.from(byId.keys(), (id) => [id, []]));
  const sideNeighbors = new Map(Array.from(byId.keys(), (id) => [id, new Set()]));
  const normalizedDirection = coerceDirection(direction);
  const rankDirection = normalizedDirection === "LR" ? "LR" : "TB";

  for (const edge of Array.isArray(edges) ? edges : []) {
    if (!edge || !byId.has(edge.from) || !byId.has(edge.to)) continue;
    if (edge.layoutIgnore) {
      sideNeighbors.get(edge.from)?.add(edge.to);
      sideNeighbors.get(edge.to)?.add(edge.from);
      continue;
    }
    layoutOut.set(edge.from, (layoutOut.get(edge.from) ?? 0) + 1);
    layoutIn.set(edge.to, (layoutIn.get(edge.to) ?? 0) + 1);
    layoutSuccs.get(edge.from)?.push(edge.to);
    layoutPreds.get(edge.to)?.push(edge.from);
  }

  const isSideNode = (id) => ((layoutIn.get(id) ?? 0) + (layoutOut.get(id) ?? 0)) === 0 && (sideNeighbors.get(id)?.size ?? 0) > 0;
  const mainItemIds = Array.from(byId.keys()).filter((id) => !isSideNode(id));
  const sideItemIds = Array.from(byId.keys()).filter((id) => isSideNode(id));

  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: rankDirection,
    ranksep: Math.max(1, Number(baseMajorGap) || 0),
    nodesep: Math.max(1, Number(baseMinorGap) || 0),
    edgesep: Math.max(1, Number(baseMinorGap) || 0) * 0.5,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const id of mainItemIds) {
    const item = byId.get(id);
    graph.setNode(id, {
      width: Math.max(0.1, Number(item?.width ?? 0)),
      height: Math.max(0.1, Number(item?.height ?? 0)),
    });
  }

  for (const edge of Array.isArray(edges) ? edges : []) {
    if (!edge || edge.layoutIgnore || !graph.hasNode(edge.from) || !graph.hasNode(edge.to)) continue;
    graph.setEdge(edge.from, edge.to, {
      weight: Math.max(1, Number(edge.weight ?? 1)),
    });
  }

  dagre.layout(graph);

  const positions = new Map();
  const rankById = new Map();
  const rankItemIds = new Map();
  const rankCenterByValue = new Map();
  for (const id of mainItemIds) {
    const node = graph.node(id);
    if (!node) continue;
    const nextPosition = { x: Number(node.x ?? 0), z: Number(node.y ?? 0) };
    positions.set(id, nextPosition);
    const rankKey = Number(node.rank ?? 0);
    rankById.set(id, rankKey);
    if (!rankItemIds.has(rankKey)) rankItemIds.set(rankKey, []);
    rankItemIds.get(rankKey)?.push(id);
    if (!rankCenterByValue.has(rankKey)) rankCenterByValue.set(rankKey, []);
    rankCenterByValue.get(rankKey)?.push(resolveLayoutMajorValue(nextPosition, rankDirection));
  }

  const setLayoutMinorValue = (position, value) => {
    if (!position) return;
    if (rankDirection === "LR") {
      position.z = value;
      return;
    }
    position.x = value;
  };

  const resolveAverageNeighborMinor = (neighborIds, predicate) => {
    let total = 0;
    let count = 0;
    for (const neighborId of neighborIds) {
      const neighborRank = rankById.get(neighborId);
      if (!Number.isFinite(neighborRank) || !predicate(neighborRank)) continue;
      const neighborPosition = positions.get(neighborId);
      if (!neighborPosition) continue;
      total += resolveLayoutMinorValue(neighborPosition, rankDirection);
      count += 1;
    }
    return count ? (total / count) : Number.NaN;
  };

  const packRankMinorCenters = (itemIds, targetMinorById) => {
    const orderedItemIds = [...itemIds].sort((leftId, rightId) => {
      const leftTarget = Number(targetMinorById.get(leftId) ?? resolveLayoutMinorValue(positions.get(leftId), rankDirection));
      const rightTarget = Number(targetMinorById.get(rightId) ?? resolveLayoutMinorValue(positions.get(rightId), rankDirection));
      if (Math.abs(leftTarget - rightTarget) > 1e-6) return leftTarget - rightTarget;
      const leftCurrent = resolveLayoutMinorValue(positions.get(leftId), rankDirection);
      const rightCurrent = resolveLayoutMinorValue(positions.get(rightId), rankDirection);
      if (Math.abs(leftCurrent - rightCurrent) > 1e-6) return leftCurrent - rightCurrent;
      return String(leftId).localeCompare(String(rightId));
    });

    let occupiedMax = Number.NEGATIVE_INFINITY;
    let targetMin = Infinity;
    let targetMax = -Infinity;
    let packedMin = Infinity;
    let packedMax = -Infinity;
    const packedMinorById = new Map();

    for (const itemId of orderedItemIds) {
      const item = byId.get(itemId);
      const targetMinor = Number(targetMinorById.get(itemId) ?? resolveLayoutMinorValue(positions.get(itemId), rankDirection));
      const minorHalfSpan = itemMinorSpan(item, rankDirection) * 0.5;
      const nextMinor = Number.isFinite(occupiedMax)
        ? Math.max(targetMinor, occupiedMax + baseMinorGap + minorHalfSpan)
        : targetMinor;
      packedMinorById.set(itemId, nextMinor);
      occupiedMax = nextMinor + minorHalfSpan;
      targetMin = Math.min(targetMin, targetMinor - minorHalfSpan);
      targetMax = Math.max(targetMax, targetMinor + minorHalfSpan);
      packedMin = Math.min(packedMin, nextMinor - minorHalfSpan);
      packedMax = Math.max(packedMax, nextMinor + minorHalfSpan);
    }

    const targetCenter = Number.isFinite(targetMin) && Number.isFinite(targetMax)
      ? (targetMin + targetMax) * 0.5
      : 0;
    const packedCenter = Number.isFinite(packedMin) && Number.isFinite(packedMax)
      ? (packedMin + packedMax) * 0.5
      : 0;
    const centerShift = targetCenter - packedCenter;
    for (const itemId of orderedItemIds) {
      packedMinorById.set(itemId, (packedMinorById.get(itemId) ?? 0) + centerShift);
    }
    return packedMinorById;
  };

  const sortedRankKeys = [...rankItemIds.keys()].sort((left, right) => left - right);
  for (let sweep = 0; sweep < 2; sweep += 1) {
    for (const rankKey of sortedRankKeys) {
      const itemIds = rankItemIds.get(rankKey) ?? [];
      if (itemIds.length < 2) continue;
      const targetMinorById = new Map();
      for (const itemId of itemIds) {
        const currentMinor = resolveLayoutMinorValue(positions.get(itemId), rankDirection);
        const predecessorMinor = resolveAverageNeighborMinor(layoutPreds.get(itemId) ?? [], (neighborRank) => neighborRank < rankKey);
        const successorMinor = resolveAverageNeighborMinor(layoutSuccs.get(itemId) ?? [], (neighborRank) => neighborRank > rankKey);
        let targetMinor = currentMinor;
        if (Number.isFinite(predecessorMinor) && Number.isFinite(successorMinor)) {
          targetMinor = predecessorMinor * 0.72 + successorMinor * 0.28;
        } else if (Number.isFinite(predecessorMinor)) {
          targetMinor = predecessorMinor;
        } else if (Number.isFinite(successorMinor)) {
          targetMinor = successorMinor;
        }
        targetMinorById.set(itemId, currentMinor * 0.2 + targetMinor * 0.8);
      }
      const packedMinorById = packRankMinorCenters(itemIds, targetMinorById);
      for (const itemId of itemIds) {
        setLayoutMinorValue(positions.get(itemId), packedMinorById.get(itemId));
      }
    }
  }

  for (const [rankKey, values] of rankCenterByValue.entries()) {
    const total = values.reduce((sum, value) => sum + value, 0);
    rankCenterByValue.set(rankKey, [values.length ? total / values.length : 0]);
  }

  let mainMinorMin = Infinity;
  let mainMinorMax = -Infinity;
  for (const id of mainItemIds) {
    const item = byId.get(id);
    const position = positions.get(id);
    if (!item || !position) continue;
    const minorCenter = resolveLayoutMinorValue(position, rankDirection);
    const minorHalfSpan = itemMinorSpan(item, rankDirection) * 0.5;
    mainMinorMin = Math.min(mainMinorMin, minorCenter - minorHalfSpan);
    mainMinorMax = Math.max(mainMinorMax, minorCenter + minorHalfSpan);
  }
  const mainMinorSpan = Number.isFinite(mainMinorMin) && Number.isFinite(mainMinorMax)
    ? Math.max(0, mainMinorMax - mainMinorMin)
    : 0;
  const sideBandMajorOffset = mainMinorSpan * SIDE_BAND_LAYER_FRACTION + baseMinorGap * SIDE_BAND_GAP_MULTIPLE;

  const sideBandByRank = new Map();
  for (const id of sideItemIds) {
    const neighbors = Array.from(sideNeighbors.get(id) ?? []);
    let totalRank = 0;
    let count = 0;
    for (const neighborId of neighbors) {
      if (!graph.hasNode(neighborId)) continue;
      const node = graph.node(neighborId);
      const rank = Number(node?.rank ?? 0);
      if (!Number.isFinite(rank)) continue;
      totalRank += rank;
      count += 1;
    }
    const anchorRank = count ? Math.round(totalRank / count) : 0;
    if (!sideBandByRank.has(anchorRank)) sideBandByRank.set(anchorRank, []);
    sideBandByRank.get(anchorRank)?.push(id);
  }

  for (const [rankKey, itemIds] of sideBandByRank.entries()) {
    itemIds.sort((leftId, rightId) => String(leftId).localeCompare(String(rightId)));
    const totalSideMinorSpan = itemIds.reduce((sum, id) => sum + itemMinorSpan(byId.get(id), rankDirection), 0)
      + Math.max(0, itemIds.length - 1) * (baseMinorGap * SIDE_BAND_MINOR_SPACING);
    let sideMinorCursor = -totalSideMinorSpan * 0.5;
    const rankCenterValues = rankCenterByValue.get(rankKey) ?? [0];
    const major = Number(rankCenterValues[0] ?? 0);
    for (const id of itemIds) {
      const item = byId.get(id);
      const minorSpan = itemMinorSpan(item, rankDirection);
      const minor = sideMinorCursor + minorSpan * 0.5;
      positions.set(id, rankDirection === "LR"
        ? { x: major, z: minor - sideBandMajorOffset }
        : { x: minor - sideBandMajorOffset, z: major });
      sideMinorCursor += minorSpan + baseMinorGap * SIDE_BAND_MINOR_SPACING;
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [id, position] of positions.entries()) {
    const item = byId.get(id);
    if (!item || !position) continue;
    minX = Math.min(minX, position.x - Number(item?.width ?? 0) * 0.5);
    maxX = Math.max(maxX, position.x + Number(item?.width ?? 0) * 0.5);
    minZ = Math.min(minZ, position.z - Number(item?.height ?? 0) * 0.5);
    maxZ = Math.max(maxZ, position.z + Number(item?.height ?? 0) * 0.5);
  }

  const centerX = Number.isFinite(minX) && Number.isFinite(maxX) ? (minX + maxX) * 0.5 : 0;
  const centerZ = Number.isFinite(minZ) && Number.isFinite(maxZ) ? (minZ + maxZ) * 0.5 : 0;
  for (const position of positions.values()) {
    position.x -= centerX;
    position.z -= centerZ;
  }

  return positions;
}

function approximateEmptyClusterWidth(label, nodeW, paddingX) {
  const textLength = String(label ?? "Cluster").trim().length || 7;
  return Math.max(nodeW + paddingX * 2, Math.min(nodeW * 5, textLength * Math.max(0.48, nodeW * 0.2)));
}

function buildClusterLayoutContext(parsed) {
  const nodes = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
  const clusters = Array.isArray(parsed?.clusters) ? parsed.clusters : [];
  const edges = Array.isArray(parsed?.edges) ? parsed.edges : [];

  const nodeById = new Map(nodes.map((node) => [String(node?.id ?? "").trim(), node]));
  const clusterById = new Map();
  const childClustersByParent = new Map();
  const directNodeIdsByParent = new Map();

  for (const cluster of clusters) {
    const clusterId = String(cluster?.id ?? "").trim();
    if (!clusterId) continue;
    const parentKey = resolveContainerKey(cluster?.parentId ?? null);
    clusterById.set(clusterId, {
      id: clusterId,
      label: String(cluster?.label ?? clusterId),
      parentId: cluster?.parentId != null ? String(cluster.parentId) : null,
      direction: cluster?.direction ? coerceDirection(cluster.direction) : null,
    });
    if (!childClustersByParent.has(parentKey)) childClustersByParent.set(parentKey, []);
    childClustersByParent.get(parentKey)?.push(clusterId);
  }

  for (const node of nodes) {
    const nodeId = String(node?.id ?? "").trim();
    if (!nodeId) continue;
    const clusterPath = normalizeClusterPath(node?.clusterPath).filter((clusterId) => clusterById.has(clusterId));
    const parentKey = resolveContainerKey(clusterPath[clusterPath.length - 1] ?? null);
    if (!directNodeIdsByParent.has(parentKey)) directNodeIdsByParent.set(parentKey, []);
    directNodeIdsByParent.get(parentKey)?.push(nodeId);
  }

  return {
    edges,
    nodeById,
    clusterById,
    childClustersByParent,
    directNodeIdsByParent,
  };
}

function buildClusterNodeIdsById(context) {
  const clusterNodeIdsById = new Map();

  const collectNodeIds = (clusterId) => {
    const resolvedClusterId = String(clusterId ?? "").trim();
    if (!resolvedClusterId) return [];
    if (clusterNodeIdsById.has(resolvedClusterId)) {
      return clusterNodeIdsById.get(resolvedClusterId);
    }

    const nodeIds = [
      ...(context.directNodeIdsByParent.get(resolveContainerKey(resolvedClusterId)) ?? []),
    ];
    for (const childClusterId of context.childClustersByParent.get(resolveContainerKey(resolvedClusterId)) ?? []) {
      nodeIds.push(...collectNodeIds(childClusterId));
    }

    clusterNodeIdsById.set(resolvedClusterId, nodeIds);
    return nodeIds;
  };

  for (const clusterId of context.clusterById.keys()) {
    collectNodeIds(clusterId);
  }

  return clusterNodeIdsById;
}

function buildCollapsedContainerEdges(context, containerId) {
  const collapsed = new Map();
  for (const edge of context.edges) {
    const fromNode = context.nodeById.get(String(edge?.from ?? "").trim());
    const toNode = context.nodeById.get(String(edge?.to ?? "").trim());
    if (!fromNode || !toNode) continue;
    if (!nodeBelongsToContainer(fromNode, containerId) || !nodeBelongsToContainer(toNode, containerId)) continue;
    const fromItemId = resolveDirectChildItemId(fromNode, containerId);
    const toItemId = resolveDirectChildItemId(toNode, containerId);
    if (!fromItemId || !toItemId || fromItemId === toItemId) continue;
    const key = `${fromItemId}|${toItemId}`;
    const layoutIgnore = edge.layoutIgnore !== false;
    const existing = collapsed.get(key);
    if (!existing) {
      collapsed.set(key, {
        from: fromItemId,
        to: toItemId,
        layoutIgnore,
        weight: layoutIgnore ? 0 : 1,
      });
      continue;
    }
    existing.layoutIgnore = existing.layoutIgnore && layoutIgnore;
    if (!layoutIgnore) existing.weight = Math.max(1, Number(existing.weight ?? 0) + 1);
  }
  return Array.from(collapsed.values());
}

function mergeLayoutAxes(majorAxisLayout, minorAxisLayout, direction, nodeIds = []) {
  const normalizedDirection = coerceDirection(direction);
  const merged = new Map();
  const resolvedNodeIds = Array.isArray(nodeIds) ? nodeIds : [];
  for (const nodeId of resolvedNodeIds) {
    const majorPosition = majorAxisLayout.get(nodeId) ?? minorAxisLayout.get(nodeId) ?? { x: 0, z: 0 };
    const minorPosition = minorAxisLayout.get(nodeId) ?? majorAxisLayout.get(nodeId) ?? { x: 0, z: 0 };
    if (normalizedDirection === "LR") {
      merged.set(nodeId, {
        x: Number(majorPosition?.x ?? 0),
        z: Number(minorPosition?.z ?? 0),
      });
      continue;
    }
    merged.set(nodeId, {
      x: Number(minorPosition?.x ?? 0),
      z: Number(majorPosition?.z ?? 0),
    });
  }
  return merged;
}

function resolveItemComponentIds(itemIds, edges) {
  const resolvedItemIds = Array.isArray(itemIds) ? itemIds.map((itemId) => String(itemId ?? "").trim()).filter(Boolean) : [];
  const adjacency = new Map(resolvedItemIds.map((itemId) => [itemId, []]));
  for (const edge of Array.isArray(edges) ? edges : []) {
    const fromId = String(edge?.from ?? "").trim();
    const toId = String(edge?.to ?? "").trim();
    if (!adjacency.has(fromId) || !adjacency.has(toId)) continue;
    adjacency.get(fromId)?.push(toId);
  }

  const indexById = new Map();
  const lowLinkById = new Map();
  const stack = [];
  const onStack = new Set();
  const componentById = new Map();
  let nextIndex = 0;
  let nextComponentId = 0;

  const visit = (itemId) => {
    indexById.set(itemId, nextIndex);
    lowLinkById.set(itemId, nextIndex);
    nextIndex += 1;
    stack.push(itemId);
    onStack.add(itemId);

    for (const neighborId of adjacency.get(itemId) ?? []) {
      if (!indexById.has(neighborId)) {
        visit(neighborId);
        lowLinkById.set(itemId, Math.min(lowLinkById.get(itemId) ?? 0, lowLinkById.get(neighborId) ?? 0));
        continue;
      }
      if (onStack.has(neighborId)) {
        lowLinkById.set(itemId, Math.min(lowLinkById.get(itemId) ?? 0, indexById.get(neighborId) ?? 0));
      }
    }

    if ((lowLinkById.get(itemId) ?? -1) !== (indexById.get(itemId) ?? -2)) return;

    while (stack.length) {
      const nextItemId = stack.pop();
      onStack.delete(nextItemId);
      componentById.set(nextItemId, nextComponentId);
      if (nextItemId === itemId) break;
    }
    nextComponentId += 1;
  };

  for (const itemId of resolvedItemIds) {
    if (!indexById.has(itemId)) visit(itemId);
  }

  return componentById;
}

function packConnectedItemsAlongMajorAxis(basePositions, context, rootDirection, {
  nodeW,
  nodeD,
  marginMajor,
  clusterPaddingX,
  clusterPaddingZ,
  clusterLabelBand,
} = {}) {
  const positions = new Map(Array.from(basePositions.entries(), ([nodeId, position]) => [
    nodeId,
    {
      x: Number(position?.x ?? 0),
      z: Number(position?.z ?? 0),
    },
  ]));
  const clusterNodeIdsById = buildClusterNodeIdsById(context);
  const separationGap = Math.max(Number(marginMajor) || 0, 0.8);

  const resolveNodeBounds = (nodeId) => {
    const position = positions.get(String(nodeId ?? "").trim()) ?? { x: 0, z: 0 };
    return {
      minX: position.x - nodeW * 0.5,
      maxX: position.x + nodeW * 0.5,
      minZ: position.z - nodeD * 0.5,
      maxZ: position.z + nodeD * 0.5,
    };
  };

  const resolveClusterBounds = (clusterId) => {
    const resolvedClusterId = String(clusterId ?? "").trim();
    const cluster = context.clusterById.get(resolvedClusterId);
    if (!cluster) {
      return normalizeBounds({
        minX: -nodeW * 0.5,
        maxX: nodeW * 0.5,
        minZ: -nodeD * 0.5,
        maxZ: nodeD * 0.5,
      });
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const nodeId of context.directNodeIdsByParent.get(resolveContainerKey(resolvedClusterId)) ?? []) {
      const nodeBounds = resolveNodeBounds(nodeId);
      minX = Math.min(minX, nodeBounds.minX);
      maxX = Math.max(maxX, nodeBounds.maxX);
      minZ = Math.min(minZ, nodeBounds.minZ);
      maxZ = Math.max(maxZ, nodeBounds.maxZ);
    }

    for (const childClusterId of context.childClustersByParent.get(resolveContainerKey(resolvedClusterId)) ?? []) {
      const childBounds = resolveClusterBounds(childClusterId);
      minX = Math.min(minX, childBounds.minX);
      maxX = Math.max(maxX, childBounds.maxX);
      minZ = Math.min(minZ, childBounds.minZ);
      maxZ = Math.max(maxZ, childBounds.maxZ);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
      const emptyWidth = approximateEmptyClusterWidth(cluster.label, nodeW, clusterPaddingX);
      const emptyHeight = Math.max(nodeD + clusterPaddingZ * 2 + clusterLabelBand, nodeD * 2.1);
      return normalizeBounds({
        minX: -emptyWidth * 0.5,
        maxX: emptyWidth * 0.5,
        minZ: -emptyHeight * 0.5,
        maxZ: emptyHeight * 0.5,
      });
    }

    return normalizeBounds({
      minX: minX - clusterPaddingX,
      maxX: maxX + clusterPaddingX,
      minZ: minZ - clusterPaddingZ - clusterLabelBand,
      maxZ: maxZ + clusterPaddingZ,
    });
  };

  const resolveItemBounds = (item) => item.kind === "cluster"
    ? resolveClusterBounds(item.id)
    : resolveNodeBounds(item.id);

  const shiftItemNodesAlongMajorAxis = (nodeIds, direction, delta) => {
    if (Math.abs(delta) <= 1e-6) return;
    const normalizedDirection = coerceDirection(direction);
    for (const nodeId of nodeIds) {
      const position = positions.get(String(nodeId ?? "").trim());
      if (!position) continue;
      if (normalizedDirection === "LR") {
        position.x += delta;
        continue;
      }
      position.z += delta;
    }
  };

  const packContainer = (containerId, inheritedDirection) => {
    const cluster = containerId == null ? null : context.clusterById.get(String(containerId));
    const containerDirection = cluster?.direction
      ? coerceDirection(cluster.direction, inheritedDirection)
      : coerceDirection(inheritedDirection);
    const childClusterIds = context.childClustersByParent.get(resolveContainerKey(containerId)) ?? [];

    for (const childClusterId of childClusterIds) {
      const childCluster = context.clusterById.get(childClusterId);
      packContainer(childClusterId, childCluster?.direction ?? containerDirection);
    }

    const items = [];
    for (const childClusterId of childClusterIds) {
      items.push({
        id: childClusterId,
        kind: "cluster",
        nodeIds: clusterNodeIdsById.get(childClusterId) ?? [],
      });
    }
    for (const nodeId of context.directNodeIdsByParent.get(resolveContainerKey(containerId)) ?? []) {
      items.push({
        id: nodeId,
        kind: "node",
        nodeIds: [nodeId],
      });
    }

    if (items.length < 2) return;

    const layoutEdges = buildCollapsedContainerEdges(context, containerId).filter((edge) => {
      return edge.layoutIgnore === false && items.some((item) => item.id === edge.from) && items.some((item) => item.id === edge.to);
    });
    const componentById = resolveItemComponentIds(items.map((item) => item.id), layoutEdges);
    const components = new Map();
    for (const item of items) {
      const componentId = componentById.get(item.id) ?? item.id;
      if (!components.has(componentId)) {
        components.set(componentId, {
          id: componentId,
          items: [],
          nodeIds: new Set(),
          incomingComponentIds: new Set(),
        });
      }
      const component = components.get(componentId);
      component.items.push(item);
      for (const nodeId of item.nodeIds) {
        component.nodeIds.add(nodeId);
      }
    }
    for (const edge of layoutEdges) {
      const fromComponentId = componentById.get(edge.from) ?? edge.from;
      const toComponentId = componentById.get(edge.to) ?? edge.to;
      if (fromComponentId === toComponentId) continue;
      components.get(toComponentId)?.incomingComponentIds.add(fromComponentId);
    }

    const resolveComponentBounds = (component) => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const item of component?.items ?? []) {
        const bounds = resolveItemBounds(item);
        minX = Math.min(minX, bounds.minX);
        maxX = Math.max(maxX, bounds.maxX);
        minZ = Math.min(minZ, bounds.minZ);
        maxZ = Math.max(maxZ, bounds.maxZ);
      }
      return normalizeBounds({ minX, maxX, minZ, maxZ });
    };

    const resolveComponentBaseMajorCenter = (component) => {
      const majorValues = Array.from(component?.nodeIds ?? [])
        .map((nodeId) => resolveLayoutMajorValue(basePositions.get(String(nodeId ?? "").trim()), containerDirection))
        .filter((value) => Number.isFinite(value));
      if (majorValues.length) {
        const minMajor = Math.min(...majorValues);
        const maxMajor = Math.max(...majorValues);
        return (minMajor + maxMajor) * 0.5;
      }
      return resolveBoundsMajorCenter(resolveComponentBounds(component), containerDirection);
    };

    const resolveItemBaseMajorCenter = (item) => {
      const majorValues = Array.from(item?.nodeIds ?? [])
        .map((nodeId) => resolveLayoutMajorValue(basePositions.get(String(nodeId ?? "").trim()), containerDirection))
        .filter((value) => Number.isFinite(value));
      if (majorValues.length) {
        const minMajor = Math.min(...majorValues);
        const maxMajor = Math.max(...majorValues);
        return (minMajor + maxMajor) * 0.5;
      }
      return resolveBoundsMajorCenter(resolveItemBounds(item), containerDirection);
    };

    const packItemsWithinComponentAlongMajorAxis = (component) => {
      if (containerId != null || (component?.items?.length ?? 0) < 4) return;
      const orderedItems = [...(component?.items ?? [])].sort((left, right) => {
        const leftCenter = resolveItemBaseMajorCenter(left);
        const rightCenter = resolveItemBaseMajorCenter(right);
        if (Math.abs(leftCenter - rightCenter) > 1e-6) return leftCenter - rightCenter;
        return String(left.id).localeCompare(String(right.id));
      });

      let previousMax = Number.NEGATIVE_INFINITY;
      for (const item of orderedItems) {
        const currentBounds = resolveItemBounds(item);
        const currentRange = resolveBoundsMajorRange(currentBounds, containerDirection);
        const nextMin = Number.isFinite(previousMax)
          ? Math.max(currentRange.min, previousMax + separationGap * 0.85)
          : currentRange.min;
        shiftItemNodesAlongMajorAxis(item.nodeIds, containerDirection, nextMin - currentRange.min);
        previousMax = resolveBoundsMajorRange(resolveItemBounds(item), containerDirection).max;
      }
    };

    for (const component of components.values()) {
      packItemsWithinComponentAlongMajorAxis(component);
    }

    const orderedComponents = [...components.values()].sort((left, right) => {
      const leftCenter = resolveComponentBaseMajorCenter(left);
      const rightCenter = resolveComponentBaseMajorCenter(right);
      if (Math.abs(leftCenter - rightCenter) > 1e-6) return leftCenter - rightCenter;
      return String(left.id).localeCompare(String(right.id));
    });

    const processed = new Set();
    for (const component of orderedComponents) {
      const currentBounds = resolveComponentBounds(component);
      const currentRange = resolveBoundsMajorRange(currentBounds, containerDirection);
      let nextMin = currentRange.min;
      for (const predecessorId of component.incomingComponentIds) {
        if (!processed.has(predecessorId)) continue;
        const predecessorBounds = resolveComponentBounds(components.get(predecessorId));
        const predecessorRange = resolveBoundsMajorRange(predecessorBounds, containerDirection);
        nextMin = Math.max(nextMin, predecessorRange.max + separationGap);
      }
      shiftItemNodesAlongMajorAxis(Array.from(component.nodeIds), containerDirection, nextMin - currentRange.min);
      processed.add(component.id);
    }
  };

  packContainer(null, rootDirection);
  return positions;
}

function separateClusterSiblings(basePositions, context, rootDirection, {
  nodeW,
  nodeD,
  marginMinor,
  clusterPaddingX,
  clusterPaddingZ,
  clusterLabelBand,
} = {}) {
  const positions = new Map(Array.from(basePositions.entries(), ([nodeId, position]) => [
    nodeId,
    {
      x: Number(position?.x ?? 0),
      z: Number(position?.z ?? 0),
    },
  ]));
  const clusterNodeIdsById = buildClusterNodeIdsById(context);
  const separationGap = Math.max(Number(marginMinor) || 0, 0.6);

  const resolveNodeBounds = (nodeId) => {
    const position = positions.get(String(nodeId ?? "").trim()) ?? { x: 0, z: 0 };
    return {
      minX: position.x - nodeW * 0.5,
      maxX: position.x + nodeW * 0.5,
      minZ: position.z - nodeD * 0.5,
      maxZ: position.z + nodeD * 0.5,
    };
  };

  const resolveClusterBounds = (clusterId) => {
    const resolvedClusterId = String(clusterId ?? "").trim();
    const cluster = context.clusterById.get(resolvedClusterId);
    if (!cluster) {
      return normalizeBounds({
        minX: -nodeW * 0.5,
        maxX: nodeW * 0.5,
        minZ: -nodeD * 0.5,
        maxZ: nodeD * 0.5,
      });
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const nodeId of context.directNodeIdsByParent.get(resolveContainerKey(resolvedClusterId)) ?? []) {
      const nodeBounds = resolveNodeBounds(nodeId);
      minX = Math.min(minX, nodeBounds.minX);
      maxX = Math.max(maxX, nodeBounds.maxX);
      minZ = Math.min(minZ, nodeBounds.minZ);
      maxZ = Math.max(maxZ, nodeBounds.maxZ);
    }

    for (const childClusterId of context.childClustersByParent.get(resolveContainerKey(resolvedClusterId)) ?? []) {
      const childBounds = resolveClusterBounds(childClusterId);
      minX = Math.min(minX, childBounds.minX);
      maxX = Math.max(maxX, childBounds.maxX);
      minZ = Math.min(minZ, childBounds.minZ);
      maxZ = Math.max(maxZ, childBounds.maxZ);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
      const emptyWidth = approximateEmptyClusterWidth(cluster.label, nodeW, clusterPaddingX);
      const emptyHeight = Math.max(nodeD + clusterPaddingZ * 2 + clusterLabelBand, nodeD * 2.1);
      return normalizeBounds({
        minX: -emptyWidth * 0.5,
        maxX: emptyWidth * 0.5,
        minZ: -emptyHeight * 0.5,
        maxZ: emptyHeight * 0.5,
      });
    }

    return normalizeBounds({
      minX: minX - clusterPaddingX,
      maxX: maxX + clusterPaddingX,
      minZ: minZ - clusterPaddingZ - clusterLabelBand,
      maxZ: maxZ + clusterPaddingZ,
    });
  };

  const buildMajorOverlapComponents = (items, direction) => {
    const sortedItems = [...items].sort((left, right) => {
      const leftRange = resolveBoundsMajorRange(left.bounds, direction);
      const rightRange = resolveBoundsMajorRange(right.bounds, direction);
      if (leftRange.min !== rightRange.min) return leftRange.min - rightRange.min;
      if (leftRange.max !== rightRange.max) return leftRange.max - rightRange.max;
      return String(left.id).localeCompare(String(right.id));
    });

    const components = [];
    let active = [];
    let activeMaxMajor = -Infinity;
    for (const item of sortedItems) {
      const majorRange = resolveBoundsMajorRange(item.bounds, direction);
      if (!active.length || majorRange.min <= activeMaxMajor + 1e-6) {
        active.push(item);
        activeMaxMajor = Math.max(activeMaxMajor, majorRange.max);
        continue;
      }
      components.push(active);
      active = [item];
      activeMaxMajor = majorRange.max;
    }
    if (active.length) components.push(active);
    return components;
  };

  const resolvePackedMinorCenters = (items, direction, targetCenterById = null) => {
    const orderedItems = [...items].sort((left, right) => {
      const leftTarget = Number(targetCenterById?.get(left.id) ?? resolveBoundsMinorCenter(left.bounds, direction));
      const rightTarget = Number(targetCenterById?.get(right.id) ?? resolveBoundsMinorCenter(right.bounds, direction));
      if (Math.abs(leftTarget - rightTarget) > 1e-6) return leftTarget - rightTarget;
      const delta = resolveBoundsMinorCenter(left.bounds, direction) - resolveBoundsMinorCenter(right.bounds, direction);
      if (Math.abs(delta) > 1e-6) return delta;
      return String(left.id).localeCompare(String(right.id));
    });

    const packedCenters = new Map();
    let occupiedMax = Number.NEGATIVE_INFINITY;
    let targetMin = Infinity;
    let targetMax = -Infinity;
    let packedMin = Infinity;
    let packedMax = -Infinity;
    for (const item of orderedItems) {
      const minorCenter = Number(targetCenterById?.get(item.id) ?? resolveBoundsMinorCenter(item.bounds, direction));
      const minorHalfSpan = resolveBoundsMinorSpan(item.bounds, direction) * 0.5;
      const nextCenter = Number.isFinite(occupiedMax)
        ? Math.max(minorCenter, occupiedMax + separationGap + minorHalfSpan)
        : minorCenter;
      packedCenters.set(item.id, nextCenter);
      occupiedMax = nextCenter + minorHalfSpan;

      targetMin = Math.min(targetMin, minorCenter - minorHalfSpan);
      targetMax = Math.max(targetMax, minorCenter + minorHalfSpan);
      packedMin = Math.min(packedMin, nextCenter - minorHalfSpan);
      packedMax = Math.max(packedMax, nextCenter + minorHalfSpan);
    }

    const targetCenter = Number.isFinite(targetMin) && Number.isFinite(targetMax)
      ? (targetMin + targetMax) * 0.5
      : 0;
    const packedCenter = Number.isFinite(packedMin) && Number.isFinite(packedMax)
      ? (packedMin + packedMax) * 0.5
      : 0;
    const centerShift = targetCenter - packedCenter;
    if (Math.abs(centerShift) <= 1e-6) {
      return packedCenters;
    }

    for (const item of orderedItems) {
      packedCenters.set(item.id, (packedCenters.get(item.id) ?? 0) + centerShift);
    }
    return packedCenters;
  };

  const shiftItemNodesAlongMinorAxis = (nodeIds, direction, delta) => {
    if (Math.abs(delta) <= 1e-6) return;
    const normalizedDirection = coerceDirection(direction);
    for (const nodeId of nodeIds) {
      const position = positions.get(String(nodeId ?? "").trim());
      if (!position) continue;
      if (normalizedDirection === "LR") {
        position.z += delta;
        continue;
      }
      position.x += delta;
    }
  };

  const separateContainer = (containerId, inheritedDirection) => {
    const cluster = containerId == null ? null : context.clusterById.get(String(containerId));
    const containerDirection = cluster?.direction
      ? coerceDirection(cluster.direction, inheritedDirection)
      : coerceDirection(inheritedDirection);
    const childClusterIds = context.childClustersByParent.get(resolveContainerKey(containerId)) ?? [];

    for (const childClusterId of childClusterIds) {
      const childCluster = context.clusterById.get(childClusterId);
      separateContainer(childClusterId, childCluster?.direction ?? containerDirection);
    }

    const buildItems = () => {
      const items = [];
      for (const childClusterId of childClusterIds) {
        items.push({
          id: childClusterId,
          bounds: resolveClusterBounds(childClusterId),
          nodeIds: clusterNodeIdsById.get(childClusterId) ?? [],
        });
      }
      for (const nodeId of context.directNodeIdsByParent.get(resolveContainerKey(containerId)) ?? []) {
        items.push({
          id: nodeId,
          bounds: resolveNodeBounds(nodeId),
          nodeIds: [nodeId],
        });
      }
      return items;
    };

    for (let sweep = 0; sweep < 2; sweep += 1) {
      const items = buildItems();
      if (items.length < 2) return;

      const itemById = new Map(items.map((item) => [item.id, item]));
      const incomingNeighborEntriesByItemId = new Map(items.map((item) => [item.id, []]));
      const outgoingNeighborEntriesByItemId = new Map(items.map((item) => [item.id, []]));
      for (const edge of buildCollapsedContainerEdges(context, containerId)) {
        if (edge.layoutIgnore !== false) continue;
        if (!itemById.has(edge.from) || !itemById.has(edge.to)) continue;
        if (edge.from === edge.to) continue;
        const weight = Math.max(1, Number(edge.weight ?? 1));
        outgoingNeighborEntriesByItemId.get(edge.from)?.push({ id: edge.to, weight });
        incomingNeighborEntriesByItemId.get(edge.to)?.push({ id: edge.from, weight });
      }

      const resolveWeightedNeighborCenter = (entries) => {
        let totalWeight = 0;
        let weightedCenterTotal = 0;
        for (const entry of entries) {
          const neighbor = itemById.get(entry?.id);
          if (!neighbor) continue;
          const weight = Math.max(1, Number(entry?.weight ?? 1));
          weightedCenterTotal += resolveBoundsMinorCenter(neighbor.bounds, containerDirection) * weight;
          totalWeight += weight;
        }
        return totalWeight ? (weightedCenterTotal / totalWeight) : Number.NaN;
      };

      const targetCenterById = new Map();
      for (const item of items) {
        const currentCenter = resolveBoundsMinorCenter(item.bounds, containerDirection);
        const predecessorCenterAverage = resolveWeightedNeighborCenter(incomingNeighborEntriesByItemId.get(item.id) ?? []);
        const successorCenterAverage = resolveWeightedNeighborCenter(outgoingNeighborEntriesByItemId.get(item.id) ?? []);
        if (!Number.isFinite(predecessorCenterAverage) && !Number.isFinite(successorCenterAverage)) {
          targetCenterById.set(item.id, currentCenter);
          continue;
        }

        const preferPredecessorAnchor = containerId == null;
        let nextTargetCenter = currentCenter;
        if (Number.isFinite(predecessorCenterAverage) && Number.isFinite(successorCenterAverage)) {
          nextTargetCenter = preferPredecessorAnchor
            ? predecessorCenterAverage
            : predecessorCenterAverage * 0.78 + successorCenterAverage * 0.22;
        } else if (Number.isFinite(predecessorCenterAverage)) {
          nextTargetCenter = predecessorCenterAverage;
        } else if (Number.isFinite(successorCenterAverage)) {
          nextTargetCenter = successorCenterAverage;
        }
        targetCenterById.set(
          item.id,
          preferPredecessorAnchor
            ? (currentCenter * 0.2 + nextTargetCenter * 0.8)
            : (currentCenter * 0.1 + nextTargetCenter * 0.9)
        );
      }

      for (const component of buildMajorOverlapComponents(items, containerDirection)) {
        if (component.length < 2) continue;
        const componentTargetCenters = new Map(component.map((item) => [item.id, targetCenterById.get(item.id)]));
        const packedCenters = resolvePackedMinorCenters(component, containerDirection, componentTargetCenters);
        for (const item of component) {
          const currentCenter = resolveBoundsMinorCenter(item.bounds, containerDirection);
          const nextCenter = packedCenters.get(item.id) ?? currentCenter;
          shiftItemNodesAlongMinorAxis(item.nodeIds, containerDirection, nextCenter - currentCenter);
        }
      }
    }
  };

  separateContainer(null, rootDirection);
  return positions;
}

/**
 * Purpose: Compute flowchart positions while respecting Mermaid subgraph clusters and nested cluster directions.
 * @param {{ direction: "TB" | "TD" | "BT" | "LR" | "RL", nodes: Array<{ id: string, clusterPath?: Array<string> }>, edges: Array<{ from: string, to: string, layoutIgnore: boolean }>, clusters?: Array<{ id: string, parentId?: string | null, direction?: string | null, label?: string }> }} parsed Parsed Mermaid model.
 * @param {{ nodeW?: number, nodeD?: number, marginMajor?: number, marginMinor?: number, clusterPaddingX?: number, clusterPaddingZ?: number, clusterLabelBand?: number }} [config] Optional sizing configuration.
 * @returns {Map<string, { x: number, z: number }>} Node positions keyed by Mermaid node id.
 */
export function layoutFlowWithClusters(parsed, {
  nodeW = 1.8,
  nodeD = 1.1,
  marginMajor = 1.0,
  marginMinor = 1.0,
  clusterPaddingX = Math.max(1.4, nodeW * 0.62),
  clusterPaddingZ = Math.max(1.1, nodeD * 0.74),
  clusterLabelBand = Math.max(1.4, nodeD * 0.92),
} = {}) {
  const normalizedDirection = coerceDirection(parsed?.direction ?? "TB");
  const context = buildClusterLayoutContext(parsed);
  if (!context.clusterById.size) {
    return new Map();
  }

  const fallbackLayout = layoutFlow({
    direction: normalizedDirection === "LR" ? "LR" : "TB",
    nodes: Array.isArray(parsed?.nodes) ? parsed.nodes.map((node) => ({ id: node.id })) : [],
    edges: Array.isArray(parsed?.edges)
      ? parsed.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        layoutIgnore: edge.layoutIgnore,
      }))
      : [],
  }, {
    nodeW,
    nodeD,
    marginMajor,
    marginMinor,
  });

  const childResultsByClusterId = new Map();

  const layoutContainer = (containerId, inheritedDirection) => {
    const cluster = containerId == null ? null : context.clusterById.get(String(containerId));
    const containerDirection = cluster?.direction ? coerceDirection(cluster.direction, inheritedDirection) : coerceDirection(inheritedDirection);
    const directNodeIds = context.directNodeIdsByParent.get(resolveContainerKey(containerId)) ?? [];
    const childClusterIds = context.childClustersByParent.get(resolveContainerKey(containerId)) ?? [];
    const items = [];

    for (const childClusterId of childClusterIds) {
      const childCluster = context.clusterById.get(childClusterId);
      const childResult = layoutContainer(childClusterId, childCluster?.direction ?? containerDirection);
      childResultsByClusterId.set(childClusterId, childResult);
      items.push({
        id: childClusterId,
        kind: "cluster",
        width: childResult.size.width,
        height: childResult.size.height,
      });
    }

    for (const nodeId of directNodeIds) {
      items.push({ id: nodeId, kind: "node", width: nodeW, height: nodeD });
    }

    if (!items.length) {
      const emptyWidth = cluster
        ? approximateEmptyClusterWidth(cluster.label, nodeW, clusterPaddingX)
        : nodeW;
      const emptyHeight = cluster
        ? Math.max(nodeD + clusterPaddingZ * 2 + clusterLabelBand, nodeD * 2.1)
        : nodeD;
      const selfBounds = normalizeBounds({
        minX: -emptyWidth * 0.5,
        maxX: emptyWidth * 0.5,
        minZ: -emptyHeight * 0.5,
        maxZ: emptyHeight * 0.5,
      });
      const clusterBounds = new Map();
      if (cluster) clusterBounds.set(cluster.id, cloneBounds(selfBounds));
      return {
        nodePositions: new Map(),
        clusterBounds,
        selfBounds,
        size: { width: emptyWidth, height: emptyHeight },
      };
    }

    const itemPositions = layoutVariableItems(items, buildCollapsedContainerEdges(context, containerId), containerDirection, {
      baseMajorGap: marginMajor,
      baseMinorGap: marginMinor,
    });

    const nodePositions = new Map();
    const clusterBounds = new Map();
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const item of items) {
      const itemPosition = itemPositions.get(item.id) ?? { x: 0, z: 0 };
      if (item.kind === "node") {
        nodePositions.set(item.id, { x: itemPosition.x, z: itemPosition.z });
        minX = Math.min(minX, itemPosition.x - nodeW * 0.5);
        maxX = Math.max(maxX, itemPosition.x + nodeW * 0.5);
        minZ = Math.min(minZ, itemPosition.z - nodeD * 0.5);
        maxZ = Math.max(maxZ, itemPosition.z + nodeD * 0.5);
        continue;
      }

      const childResult = childResultsByClusterId.get(item.id);
      if (!childResult) continue;
      for (const [nodeId, position] of childResult.nodePositions.entries()) {
        nodePositions.set(nodeId, {
          x: position.x + itemPosition.x,
          z: position.z + itemPosition.z,
        });
      }
      for (const [clusterId, bounds] of childResult.clusterBounds.entries()) {
        clusterBounds.set(clusterId, offsetBounds(bounds, itemPosition));
      }
      const childBounds = offsetBounds(childResult.selfBounds, itemPosition);
      minX = Math.min(minX, childBounds.minX);
      maxX = Math.max(maxX, childBounds.maxX);
      minZ = Math.min(minZ, childBounds.minZ);
      maxZ = Math.max(maxZ, childBounds.maxZ);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
      minX = -nodeW * 0.5;
      maxX = nodeW * 0.5;
      minZ = -nodeD * 0.5;
      maxZ = nodeD * 0.5;
    }

    let selfBounds = normalizeBounds({ minX, maxX, minZ, maxZ });
    if (cluster) {
      selfBounds.minX -= clusterPaddingX;
      selfBounds.maxX += clusterPaddingX;
      selfBounds.minZ -= clusterPaddingZ + clusterLabelBand;
      selfBounds.maxZ += clusterPaddingZ;
    }

    const centerX = (selfBounds.minX + selfBounds.maxX) * 0.5;
    const centerZ = (selfBounds.minZ + selfBounds.maxZ) * 0.5;
    for (const position of nodePositions.values()) {
      position.x -= centerX;
      position.z -= centerZ;
    }
    for (const bounds of clusterBounds.values()) {
      shiftBounds(bounds, centerX, centerZ);
    }
    selfBounds = shiftBounds(selfBounds, centerX, centerZ);
    if (cluster) clusterBounds.set(cluster.id, cloneBounds(selfBounds));

    return {
      nodePositions,
      clusterBounds,
      selfBounds,
      size: {
        width: selfBounds.maxX - selfBounds.minX,
        height: selfBounds.maxZ - selfBounds.minZ,
      },
    };
  };

  const clusteredLayout = layoutContainer(null, normalizedDirection).nodePositions;
  const clusteredViolationCount = countLayoutRankViolations(clusteredLayout, context.edges, normalizedDirection);
  const fallbackViolationCount = countLayoutRankViolations(fallbackLayout, context.edges, normalizedDirection);
  const hybridFallbackLayout = mergeLayoutAxes(
    fallbackLayout,
    clusteredLayout,
    normalizedDirection,
    Array.isArray(parsed?.nodes) ? parsed.nodes.map((node) => node.id) : [],
  );
  const selectedLayout = clusteredViolationCount <= fallbackViolationCount
    ? clusteredLayout
    : hybridFallbackLayout;

  const majorPackedLayout = packConnectedItemsAlongMajorAxis(selectedLayout, context, normalizedDirection, {
    nodeW,
    nodeD,
    marginMajor,
    clusterPaddingX,
    clusterPaddingZ,
    clusterLabelBand,
  });

  return separateClusterSiblings(majorPackedLayout, context, normalizedDirection, {
    nodeW,
    nodeD,
    marginMinor,
    clusterPaddingX,
    clusterPaddingZ,
    clusterLabelBand,
  });
}
