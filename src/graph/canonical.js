// SPDX-License-Identifier: Apache-2.0
// Canonical graph adapter utilities.
// Purpose: allow shared helpers to work across legacy graph JSON shapes.

function isObj(x) {
  return !!x && typeof x === "object";
}

/**
 * Convert a graph-like object into a canonical in-memory shape.
 * Supports both the planned canonical contract ({nodes:[{id,kind,label}], edges:[{from,to,kind}]})
 * and the current legacy runtime graphs ({nodes:[{id,type,displayName}], edges:[{fromId,toId,type}]}).
 * Purpose: Normalize legacy and canonical graph JSON documents into the shared in-memory graph shape consumed by runtime graph helpers.
 * @param {*} graph Graph-like input that may contain legacy or canonical node and edge arrays.
 * @returns {{ schemaVersion: any, nodes: Array<{ id: string, kind: string, label: string, weight?: number, group?: string, aspects?: Array<any>, data?: object, _raw: any }>, edges: Array<{ from: string, to: string, kind: string, weight?: number, count?: number, aspects?: Array<any>, data?: object, _raw: any }>, meta?: object, _raw: any }} Canonicalized graph document with normalized node and edge records.
 * Side effects: none; pure normalization helper.
 */
export function toCanonicalGraph(graph) {
  const g = isObj(graph) ? graph : null;
  const nodesIn = Array.isArray(g?.nodes) ? g.nodes : [];
  const edgesIn = Array.isArray(g?.edges) ? g.edges : [];

  const nodes = nodesIn
    .map((n) => (isObj(n) ? n : null))
    .filter(Boolean)
    .map((n) => {
      const id = String(n.id ?? "").trim();
      const kind = String(n.kind ?? n.type ?? "").trim();
      const label = String(n.label ?? n.displayName ?? n.name ?? n.id ?? "").trim();
      return {
        id,
        kind,
        label,
        weight: n.weight != null ? Number(n.weight) : undefined,
        group: n.group != null ? String(n.group) : undefined,
        aspects: Array.isArray(n.aspects) ? n.aspects.slice() : undefined,
        data: isObj(n.data) ? n.data : undefined,
        _raw: n,
      };
    })
    .filter((n) => n.id && n.kind);

  const edges = edgesIn
    .map((e) => (isObj(e) ? e : null))
    .filter(Boolean)
    .map((e) => {
      const from = String(e.from ?? e.fromId ?? "").trim();
      const to = String(e.to ?? e.toId ?? "").trim();
      const kind = String(e.kind ?? e.type ?? "").trim();
      return {
        from,
        to,
        kind,
        weight: e.weight != null ? Number(e.weight) : undefined,
        count: e.count != null ? Number(e.count) : undefined,
        aspects: Array.isArray(e.aspects) ? e.aspects.slice() : undefined,
        data: isObj(e.data) ? e.data : undefined,
        _raw: e,
      };
    })
    .filter((e) => e.from && e.to && e.kind);

  return {
    schemaVersion: g?.schemaVersion,
    nodes,
    edges,
    meta: isObj(g?.meta) ? g.meta : undefined,
    _raw: g,
  };
}
