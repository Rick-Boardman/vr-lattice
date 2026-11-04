// SPDX-License-Identifier: Apache-2.0
// Shared derived metrics for graph scenes.
// Goal: compute common stats without baking in per-scene rules.

import { toCanonicalGraph } from "./canonical.js";

function inc(map, key, delta = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + delta);
}

/**
 * Compute canonical graph counts and degree summaries for shared graph HUDs and scene logic.
 * Purpose: derive reusable node, edge, kind, bucket, and degree metrics from a legacy or canonical graph document.
 * @param {*} graph Graph-like input that may contain legacy or canonical node and edge records.
 * @param {object} [options] Optional derivation settings.
 * @param {((kind: string, node: any) => string | null | undefined) | null} [options.mapKindToBucket=null] Optional mapper that groups node kinds into scene-specific count buckets.
 * @returns {{ nodeCount: number, edgeCount: number, kindCounts: Map<string, number>, bucketCounts: Map<string, number>, degree: Map<string, number> }} Summary maps and totals derived from the canonicalized graph.
 * Side effects: none; pure derivation helper.
 */
export function deriveGraphStats(graph, { mapKindToBucket = null } = {}) {
  const g = toCanonicalGraph(graph);

  const kindCounts = new Map();
  const bucketCounts = new Map();
  const degree = new Map();

  for (const n of g.nodes) {
    inc(kindCounts, n.kind, 1);
    if (typeof mapKindToBucket === "function") {
      const b = mapKindToBucket(n.kind, n);
      if (b) inc(bucketCounts, String(b), 1);
    }
    if (!degree.has(n.id)) degree.set(n.id, 0);
  }

  for (const e of g.edges) {
    // Undirected degree count (each endpoint increments)
    inc(degree, e.from, 1);
    inc(degree, e.to, 1);
  }

  return {
    nodeCount: g.nodes.length,
    edgeCount: g.edges.length,
    kindCounts,
    bucketCounts,
    degree,
  };
}

function pushEdge(map, id, edge) {
  if (!id) return;
  let arr = map.get(id);
  if (!arr) {
    arr = [];
    map.set(id, arr);
  }
  arr.push(edge);
}

/**
 * Build adjacency indexes and neighbor summaries from a canonicalized graph document.
 * Purpose: precompute shared edge and neighbor lookups so graph HUDs and interaction layers can query connectivity without rescanning the full edge list.
 * @param {*} graph Graph-like input that may contain legacy or canonical node and edge records.
 * @returns {{ rawNodeById: Map<string, any>, outEdgesById: Map<string, Array<any>>, inEdgesById: Map<string, Array<any>>, neighborsById: Map<string, Map<string, { weight: number, kindCounts: Map<string, number>, outCount: number, inCount: number }>> }} Adjacency bundle containing raw node lookup, inbound and outbound edge maps, and aggregated neighbor summaries.
 * Side effects: none; pure derivation helper.
 */
export function deriveAdjacency(graph) {
  const g = toCanonicalGraph(graph);

  const rawNodeById = new Map();
  for (const n of g.nodes) rawNodeById.set(n.id, n._raw);

  const outEdgesById = new Map();
  const inEdgesById = new Map();
  const neighborsById = new Map();

  const ensureNeighborEntry = (a, b) => {
    let m = neighborsById.get(a);
    if (!m) {
      m = new Map();
      neighborsById.set(a, m);
    }
    let entry = m.get(b);
    if (!entry) {
      entry = { weight: 0, kindCounts: new Map(), outCount: 0, inCount: 0 };
      m.set(b, entry);
    }
    return entry;
  };

  for (const e of g.edges) {
    pushEdge(outEdgesById, e.from, e);
    pushEdge(inEdgesById, e.to, e);

    // Summarize neighbor relationship for both endpoints.
    const c = Number.isFinite(e.count) ? e.count : 1;
    const w = Number.isFinite(e.weight) ? e.weight : c;

    {
      const entry = ensureNeighborEntry(e.from, e.to);
      entry.weight += w;
      entry.outCount += c;
      entry.kindCounts.set(e.kind, (entry.kindCounts.get(e.kind) || 0) + c);
    }
    {
      const entry = ensureNeighborEntry(e.to, e.from);
      entry.weight += w;
      entry.inCount += c;
      entry.kindCounts.set(e.kind, (entry.kindCounts.get(e.kind) || 0) + c);
    }
  }

  return { rawNodeById, outEdgesById, inEdgesById, neighborsById };
}

/**
 * Get the highest-weight or highest-count neighbor summaries for a node.
 * Purpose: provide a stable ranked list of adjacent nodes for shared graph HUD panels.
 * @param {*} derivedAdjacency Adjacency bundle returned by deriveAdjacency(...).
 * @param {string} nodeId Canonical node identifier whose neighbors should be ranked.
 * @param {object} [options] Ranking options.
 * @param {"weight" | "count"} [options.by="weight"] Ranking mode that sorts by accumulated edge weight or by total edge count.
 * @param {number} [options.limit=6] Maximum number of ranked neighbor summaries to return.
 * @returns {Array<{ otherId: string, weight: number, kindCounts: Map<string, number> | undefined, outCount: number, inCount: number }>} Ranked neighbor summary objects for the requested node.
 * Side effects: none; pure derivation helper.
 */
export function getTopConnections(derivedAdjacency, nodeId, { by = "weight", limit = 6 } = {}) {
  const neighbors = derivedAdjacency?.neighborsById?.get(nodeId);
  if (!neighbors) return [];

  const items = [];
  for (const [otherId, info] of neighbors) {
    const total = (info?.outCount || 0) + (info?.inCount || 0);
    items.push({ otherId, info, total });
  }

  if (by === "count") {
    items.sort((a, b) => (b.total || 0) - (a.total || 0));
  } else {
    items.sort((a, b) => (b.info?.weight || 0) - (a.info?.weight || 0));
  }

  return items.slice(0, Math.max(0, limit)).map((x) => ({
    otherId: x.otherId,
    weight: x.info?.weight || 0,
    kindCounts: x.info?.kindCounts,
    outCount: x.info?.outCount || 0,
    inCount: x.info?.inCount || 0,
  }));
}

/**
 * Convert a Map of string→number counts into a plain object.
 * @param {Map<string, number>} map Count map (e.g. edge-kind tallies).
 * @returns {Record<string, number>} Plain object with the same key/value pairs.
 */
export function mapCountsToObject(map) {
  /** @type {Record<string, number>} */
  const obj = {};
  for (const [k, v] of map) obj[k] = v;
  return obj;
}

/**
 * Assign each node to a group id based on a layout-grouping mode.
 * Supported modes: "nodeField", "applicationEnvInfer"; default puts all nodes in "GROUP".
 * @param {{ nodes?: any[], edges?: any[] }} graph
 * @param {string} mode
 * @param {{ field?: string, fallback?: string }} [opts]
 * @returns {Map<string, string>}
 */
export function makeGroupByIdForLayoutMode(graph, mode, opts = {}) {
  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];

  if (mode === "nodeField") {
    const field = String(opts?.field || "organization");
    const fallback = String(opts?.fallback || "SHARED");
    const groupById = new Map();
    for (const n of nodes) {
      const v = n?.[field];
      groupById.set(n.id, v != null && String(v).trim() ? String(v) : fallback);
    }
    return groupById;
  }

  // Built-in application grouping (env + resource inference), formerly per-scene code.
  // This is generic algorithmic behavior selected by config.
  if (mode === "applicationEnvInfer") {
    const envByAppId = new Map();
    for (const n of nodes) {
      if (n?.type === "application" && n.environment) envByAppId.set(n.id, n.environment);
    }

    const inferEdgeTypes = new Set(["APP_USES_SERVER", "APP_USES_FILESHARE"]);
    const resourceEnvCounts = new Map();
    for (const e of edges) {
      const t = e?.type;
      if (!inferEdgeTypes.has(t)) continue;
      const env = envByAppId.get(e.fromId);
      if (!env) continue;
      if (!resourceEnvCounts.has(e.toId)) resourceEnvCounts.set(e.toId, new Map());
      const m = resourceEnvCounts.get(e.toId);
      m.set(env, (m.get(env) || 0) + 1);
    }

    const groupById = new Map();
    for (const n of nodes) {
      if (n?.environment) {
        groupById.set(n.id, n.environment);
        continue;
      }
      const counts = resourceEnvCounts.get(n.id);
      if (!counts || counts.size === 0) {
        groupById.set(n.id, "SHARED");
        continue;
      }
      const envs = Array.from(counts.keys());
      groupById.set(n.id, envs.length >= 2 ? "SHARED" : envs[0]);
    }
    return groupById;
  }

  // Default: single group.
  const groupById = new Map();
  for (const n of nodes) groupById.set(n.id, "GROUP");
  return groupById;
}
