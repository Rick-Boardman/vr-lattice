// SPDX-License-Identifier: Apache-2.0

export const networkGroupKey = id => `group:${id}`;
const backboneKey = id => `connectivity:${JSON.stringify(id)}`;
const endpoints = edge => [String(edge.fromId ?? edge.from ?? ""), String(edge.toId ?? edge.to ?? "")];
const stableCompare = (a,b) => a < b ? -1 : a > b ? 1 : 0;

function getBackboneKeys(ids, groupByNode, communityByNode) {
  const communityCount = new Set([...ids].map(id => communityByNode.get(id)).filter(id => id != null)).size;
  const source = communityCount > 1 ? communityByNode : groupByNode;
  const groupCount = new Set([...ids].map(id => source.get(id)).filter(id => id != null)).size;
  return new Map([...ids].map(id => {
    const group = source.get(id);
    return [id, groupCount > 1 && group != null ? backboneKey(["group", String(group)]) : backboneKey(["node", id])];
  }));
}

/** Keep a maximum-weight spanning forest plus a small number of strong neighboring paths. */
export function selectBackbonePaths(paths, extraPerGroup = 1) {
  const ranked = [...paths].sort((a,b) => b.weight-a.weight || b.count-a.count ||
    stableCompare(a.fromId,b.fromId) || stableCompare(a.toId,b.toId));
  const parent = new Map(), selected = new Set(), extras = new Map();
  function root(key) {
    let current = key;
    while (parent.has(current)) current = parent.get(current);
    if (current !== key) parent.set(key,current);
    return current;
  }
  for (const edge of ranked) {
    const a = root(edge.fromId), b = root(edge.toId);
    if (a === b) continue;
    parent.set(a,b);
    selected.add(edge);
  }
  const budget = Number.isFinite(Number(extraPerGroup)) ? Math.max(0, Math.min(2, Math.floor(Number(extraPerGroup)))) : 1;
  for (const edge of ranked) {
    if (selected.has(edge)) continue;
    const a = extras.get(edge.fromId) ?? 0, b = extras.get(edge.toId) ?? 0;
    if (a >= budget || b >= budget) continue;
    extras.set(edge.fromId, a+1);
    extras.set(edge.toId, b+1);
    selected.add(edge);
  }
  return ranked.filter(edge => selected.has(edge));
}

const linkWeight = edge => {
  const weight = Number(edge.weight ?? edge.count);
  return Number.isFinite(weight) && weight > 0 ? weight : 1;
};

/**
 * The backbone summarises links between communities; without links inside them a cluster reads as a heap of
 * spheres (a 16-person dumbbell showed one line). A small graph keeps every link inside its communities; a large
 * one keeps each person's strongest few, so the clusters show their structure without the full hairball.
 */
export function selectCommunityLinks(inside, totalLinks, { overviewDetailLinkLimit = 120, overviewLinksPerNode = 2 } = {}) {
  if (totalLinks <= overviewDetailLinkLimit) return [...inside];
  const perNode = Math.max(0, Math.floor(Number(overviewLinksPerNode) || 0));
  if (!perNode) return [];
  const ranked = [...inside].sort((a,b) => linkWeight(b)-linkWeight(a) ||
    stableCompare(endpoints(a).join(), endpoints(b).join()));
  const kept = new Set(), used = new Map();
  for (const edge of ranked) {
    const [a, b] = endpoints(edge);
    if ((used.get(a) ?? 0) >= perNode && (used.get(b) ?? 0) >= perNode) continue;
    used.set(a, (used.get(a) ?? 0) + 1);
    used.set(b, (used.get(b) ?? 0) + 1);
    kept.add(edge);
  }
  return inside.filter(edge => kept.has(edge));
}

/**
 * Smallest camera distance, looking along -`out` at `center`, at which every point projects inside `fill` of the
 * viewport (the usable horizontal `fraction` of it). Fits the actual extent instead of a bounding sphere, which left a
 * graph filling a twentieth of the view.
 */
export function networkFitDistanceForPoints(points, center, out, verticalFovDeg, aspect, { fill = 0.84, fraction = 1, minDistance = 8 } = {}) {
  const tan = Math.tan((Number(verticalFovDeg) || 60) * Math.PI / 360);
  const tanX = tan * Math.max(0.05, Number(aspect) || 1) * Math.max(0.1, Math.min(1, fraction));
  const len = Math.hypot(out.x, out.y, out.z) || 1;
  const o = { x: out.x / len, y: out.y / len, z: out.z / len };
  // right = up × out with up = +Y; up' = out × right
  let r = { x: o.z, y: 0, z: -o.x };
  const rl = Math.hypot(r.x, r.z) || 1; r = { x: r.x / rl, y: 0, z: r.z / rl };
  const u = { x: o.y * r.z - o.z * r.y, y: o.z * r.x - o.x * r.z, z: o.x * r.y - o.y * r.x };
  const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  const rel = points.map(p => ({ x: p.x - center.x, y: p.y - center.y, z: p.z - center.z }));
  let needed = minDistance;
  for (const p of rel) {
    // depth from a camera at distance d: d - p·out; must satisfy |p·right| <= fill·tanX·depth (and y likewise)
    const along = dot(p, o);
    needed = Math.max(needed, along + Math.abs(dot(p, r)) / (fill * tanX) + 0.5, along + Math.abs(dot(p, u)) / (fill * tan) + 0.5);
  }
  return needed;
}

/** Presentation-only maps: refuse ambiguous or cyclic parent assignments. */
export function createNetworkViewModel(graph, groupByNode = new Map(), options = {}, communityByNode = new Map()) {
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
  const backboneByNode = getBackboneKeys(ids, groupByNode, communityByNode);
  return { ids, edges, groups, groupByNode, backboneByNode, parents, children, options };
}

export function deriveNetworkView(model, { all = false, groupId = null, nodeId = null,
  focused = false, expandedHosts = new Set(), overviewLinks = model.options.overviewLinks } = {}) {
  const owner = id => {
    const parent = model.parents.get(id);
    const expanded = parent != null && expandedHosts.has(parent);
    return all || parent == null ||
      (model.options.hierarchy?.collapsedByDefault === false ? !expanded : expanded) ? id : parent;
  };
  const nodeIds = new Set([...model.ids].filter(id => owner(id) === id));
  const selected = new Set(groupId != null ? model.groups.get(groupId) : nodeId ? [nodeId, ...(model.children.get(nodeId) ?? [])] : []);
  const visibleKeys = new Set([...selected].map(owner));
  const groupFocus = !all && focused && groupId != null && selected.size > 0;
  const backbone = !all && selected.size === 0 && overviewLinks === "backbone";
  const overview = backbone || (!all && selected.size === 0 &&
    model.options.summarizeOverview === true && model.groups.size > 1);
  const raw = [], aggregated = new Map(), inside = [];
  for (const edge of model.edges) {
    const [a, b] = endpoints(edge);
    if (!all && selected.size && !selected.has(a) && !selected.has(b)) continue;
    // Focusing a group is a scoped view, not the group's entire first-degree
    // neighborhood. A single well-connected org could otherwise fill the board.
    if (groupFocus && (!selected.has(a) || !selected.has(b))) continue;
    const ownerFrom = owner(a), ownerTo = owner(b);
    let from = ownerFrom, to = ownerTo;
    if (focused) { visibleKeys.add(from); visibleKeys.add(to); }
    if (from === to && a !== b) continue;
    if (backbone) {
      from = model.backboneByNode.get(from); to = model.backboneByNode.get(to);
      if (from === to) {
        // A link inside one community: candidate for the community's own structure (below).
        if (ownerFrom === a && ownerTo === b && a !== b) inside.push(edge);
        continue;
      }
    } else if (overview) {
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
    if (backbone) {
      const authoredWeight = Number(edge.weight ?? edge.count);
      const weight = Number.isFinite(authoredWeight) && authoredWeight > 0 ? authoredWeight : 1;
      row.weight = (row.weight ?? 0) + weight;
      const [start, finish] = left === from ? [ownerFrom, ownerTo] : [ownerTo, ownerFrom];
      if (weight > (row.anchorWeight ?? -1) || (weight === row.anchorWeight &&
          stableCompare(JSON.stringify([start, finish]), JSON.stringify([row.anchorFromId, row.anchorToId])) < 0)) {
        row.anchorWeight = weight;
        row.anchorFromId = start;
        row.anchorToId = finish;
      }
    }
    aggregated.set(key, row);
  }
  if (focused && selected.size) {
    for (const id of nodeIds) if (!visibleKeys.has(id)) nodeIds.delete(id);
  }
  if (backbone) raw.push(...selectCommunityLinks(inside, model.edges.length, model.options));
  const paths = [...aggregated.values()];
  return { raw, aggregated: backbone ? selectBackbonePaths(paths, model.options.backboneExtrasPerGroup) : paths,
    nodeIds, overview, backbone, overviewPathCount: overview ? paths.length : 0 };
}

/** Distance that puts a bounding sphere inside the narrower padded viewport axis. */
export function networkFitDistance(radius, verticalFovDeg, aspect, viewportFraction = 0.76) {
  const tan = Math.tan((Number(verticalFovDeg) || 60) * Math.PI / 360);
  const usable = Math.max(0.1, Math.min(1, viewportFraction));
  const halfAngle = Math.atan(tan * Math.max(0.05, Math.min(1, Number(aspect) || 1)) * usable);
  return Math.max(0, radius) / Math.max(0.01, Math.sin(halfAngle));
}
