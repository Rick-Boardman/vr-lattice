// SPDX-License-Identifier: Apache-2.0

export const networkGroupKey = id => `group:${id}`;
const endpoints = edge => [String(edge.fromId ?? edge.from ?? ""), String(edge.toId ?? edge.to ?? "")];

/** Presentation-only maps: refuse ambiguous or cyclic parent assignments. */
export function createNetworkViewModel(graph, groupByNode = new Map(), options = {}) {
  const ids = new Set((graph.nodes ?? []).map(node => String(node.id)));
  const edges = (graph.edges ?? []).filter(edge => {
    const [a, b] = endpoints(edge);
    return ids.has(a) && ids.has(b);
  });
  const groups = new Map();
  for (const id of ids) {
    const group = groupByNode.get(id);
    if (group == null || group === "") continue;
    const key = String(group);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(id);
  }
  const types = new Set(options.hierarchy?.dependentEdgeTypes ?? []);
  const candidates = new Map();
  for (const edge of edges) {
    if (!types.has(edge.type ?? edge.kind)) continue;
    const [parent, child] = endpoints(edge);
    if (parent === child) continue;
    if (!candidates.has(child)) candidates.set(child, new Set());
    candidates.get(child).add(parent);
  }
  const proposed = new Map([...candidates].filter(([, set]) => set.size === 1).map(([id, set]) => [id, [...set][0]]));
  // Only collapse leaf dependents. Multi-tier or cyclic records stay tangible.
  const declaredParents = new Set([...candidates.values()].flatMap(set => [...set]));
  const parents = new Map([...proposed].filter(([child, parent]) => !declaredParents.has(child) && child !== parent));
  const children = new Map();
  for (const [child, parent] of parents) {
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(child);
  }
  return { ids, edges, groups, groupByNode, parents, children, options };
}

export function deriveNetworkView(model, { all = false, groupId = null, nodeId = null,
  focused = false, expandedHosts = new Set() } = {}) {
  const owner = id => {
    const parent = model.parents.get(id);
    const expanded = parent != null && expandedHosts.has(parent);
    return all || parent == null ||
      (model.options.hierarchy?.collapsedByDefault === false ? !expanded : expanded) ? id : parent;
  };
  const nodeIds = new Set([...model.ids].filter(id => owner(id) === id));
  const selected = new Set(groupId != null ? model.groups.get(groupId) : nodeId ? [nodeId, ...(model.children.get(nodeId) ?? [])] : []);
  const visibleKeys = new Set([...selected].map(owner));
  const overview = !all && selected.size === 0 && model.options.summarizeOverview === true && model.groups.size > 1;
  const raw = [], aggregated = new Map();
  for (const edge of model.edges) {
    const [a, b] = endpoints(edge);
    if (!all && selected.size && !selected.has(a) && !selected.has(b)) continue;
    let from = owner(a), to = owner(b);
    if (focused) { visibleKeys.add(from); visibleKeys.add(to); }
    if (from === to && a !== b) continue;
    if (overview) {
      const ga = model.groupByNode.get(from), gb = model.groupByNode.get(to);
      if (ga != null && gb != null && String(ga) === String(gb)) continue;
      from = ga == null ? from : networkGroupKey(String(ga));
      to = gb == null ? to : networkGroupKey(String(gb));
    }
    if (from === a && to === b && !overview) { raw.push(edge); continue; }
    // One line per pair; its count is the number of real relationships behind it.
    const [left, right] = [from, to].sort();
    const key = JSON.stringify([left, right]);
    const row = aggregated.get(key) ?? { fromId: left, toId: right, count: 0 };
    row.count++;
    aggregated.set(key, row);
  }
  if (focused && selected.size) {
    for (const id of nodeIds) if (!visibleKeys.has(id)) nodeIds.delete(id);
  }
  return { raw, aggregated: [...aggregated.values()], nodeIds, overview };
}

/** Distance that puts a bounding sphere inside the narrower padded viewport axis. */
export function networkFitDistance(radius, verticalFovDeg, aspect, viewportFraction = 0.76) {
  const tan = Math.tan((Number(verticalFovDeg) || 60) * Math.PI / 360);
  const usable = Math.max(0.1, Math.min(1, viewportFraction));
  const halfAngle = Math.atan(tan * Math.max(0.05, Math.min(1, Number(aspect) || 1)) * usable);
  return Math.max(0, radius) / Math.max(0.01, Math.sin(halfAngle));
}
