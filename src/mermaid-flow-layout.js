// SPDX-License-Identifier: Apache-2.0
/**
 * @module mermaid-flow-layout
 *
 * Pure layout algorithm for Mermaid flowcharts.  Computes node positions using
 * Kahn-ish topological layering, barycenter ordering within layers, and a
 * side-band for non-flow nodes linked only by bidirectional / non-arrow edges.
 */

/**
 * Fraction of the widest layer's minor-axis span used as the base offset
 * for the side-band of non-flow nodes.
 * @type {number}
 */
const SIDE_BAND_LAYER_FRACTION = 0.65;

/**
 * Extra spacing multiplier applied on top of the layer fraction to push the
 * side-band clear of the main flow columns.
 * @type {number}
 */
const SIDE_BAND_GAP_MULTIPLE = 1.75;

/**
 * Minor-axis spacing multiplier applied within the side-band so its nodes
 * sit slightly tighter than the main flow columns.
 * @type {number}
 */
const SIDE_BAND_MINOR_SPACING = 0.95;

/**
 * Purpose: Compute absolute (x, z) positions for each node in a parsed Mermaid flowchart using topological layering and barycenter heuristic ordering.
 * @param {{ direction: "TB" | "LR", nodes: Array<{ id: string }>, edges: Array<{ from: string, to: string, layoutIgnore: boolean }> }} parsed Parsed flowchart model from `parseMermaidFlowchart`.
 * @param {object} [config] Optional layout configuration.
 * @param {number} [config.nodeW=1.8] Node width (X extent for TB, major step for LR).
 * @param {number} [config.nodeD=1.1] Node depth (Z extent for TB, minor step for LR).
 * @param {number} [config.marginMajor=1.0] Extra spacing between layers along the major axis.
 * @param {number} [config.marginMinor=1.0] Extra spacing between nodes within a layer along the minor axis.
 * @returns {Map<string, { x: number, z: number }>} Map from node id to its computed position.
 * Side effects: none; pure layout computation.
 */
export function layoutFlow(
  parsed,
  {
    nodeW = 1.8,
    nodeD = 1.1,
    marginMajor = 1.0,
    marginMinor = 1.0,
  } = {}
) {
  const { direction, nodes, edges } = parsed;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const out = new Map(nodes.map((n) => [n.id, []]));
  const preds = new Map(nodes.map((n) => [n.id, []]));
  const layoutIn = new Map(nodes.map((n) => [n.id, 0]));
  const layoutOut = new Map(nodes.map((n) => [n.id, 0]));
  const sideNeighbors = new Map(nodes.map((n) => [n.id, new Set()]));

  for (const e of edges) {
    if (!e || !byId.has(e.from) || !byId.has(e.to)) continue;

    if (e.layoutIgnore) {
      // Track non-flow adjacency so we can place isolated nodes (e.g. buckets, services)
      // near the layer they conceptually belong to.
      try {
        sideNeighbors.get(e.from)?.add(e.to);
        sideNeighbors.get(e.to)?.add(e.from);
      } catch {
        // no-op
      }
      continue;
    }

    out.get(e.from).push(e.to);
    preds.get(e.to).push(e.from);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    layoutOut.set(e.from, (layoutOut.get(e.from) ?? 0) + 1);
    layoutIn.set(e.to, (layoutIn.get(e.to) ?? 0) + 1);
  }

  const queue = [];
  for (const [id, d] of indeg.entries()) {
    if (!d) queue.push(id);
  }

  const layer = new Map();
  for (const id of queue) layer.set(id, 0);

  // Kahn-ish layering. Cycles will remain unlayered.
  const q = queue.slice();
  while (q.length) {
    const id = q.shift();
    const l = layer.get(id) ?? 0;
    for (const to of out.get(id) ?? []) {
      const next = Math.max(layer.get(to) ?? 0, l + 1);
      layer.set(to, next);
      indeg.set(to, (indeg.get(to) ?? 0) - 1);
      if ((indeg.get(to) ?? 0) <= 0) q.push(to);
    }
  }

  // Any unlayered nodes (cycles) -> layer 0.
  for (const n of nodes) {
    if (!layer.has(n.id)) layer.set(n.id, 0);
  }

  const maxLayer = Math.max(0, ...Array.from(layer.values()));
  const columns = Array.from({ length: maxLayer + 1 }, () => []);
  for (const n of nodes) {
    columns[layer.get(n.id) ?? 0].push(n.id);
  }

  // Nodes that are not part of the main flow graph (no layout edges in/out)
  // should not be placed in the main chain. We'll pull them into a side band
  // anchored to the average layer of their non-flow neighbors.
  const sideBandByLayer = new Map();
  const isSideNode = (id) => ((layoutIn.get(id) ?? 0) + (layoutOut.get(id) ?? 0)) === 0 && (sideNeighbors.get(id)?.size ?? 0) > 0;

  for (const id of Array.from(byId.keys())) {
    if (!isSideNode(id)) continue;

    const neigh = Array.from(sideNeighbors.get(id) ?? []);
    let acc = 0;
    let cnt = 0;
    for (const nId of neigh) {
      if (!byId.has(nId)) continue;
      // Prefer anchoring to nodes that are actually in the flow.
      if (!isSideNode(nId) || neigh.length === 1) {
        acc += layer.get(nId) ?? 0;
        cnt++;
      }
    }
    const anchor = cnt ? Math.round(acc / cnt) : 0;

    // Remove from main columns.
    const curL = layer.get(id) ?? 0;
    const col = columns[curL];
    if (Array.isArray(col)) {
      const idx = col.indexOf(id);
      if (idx >= 0) col.splice(idx, 1);
    }

    if (!sideBandByLayer.has(anchor)) sideBandByLayer.set(anchor, []);
    sideBandByLayer.get(anchor).push(id);
  }

  // Start stable ordering
  for (const col of columns) col.sort();

  // Improve ordering within each layer by sorting nodes by the barycenter
  // of their predecessors in the previous layer.
  const orderIndex = new Map();
  const rebuildOrderIndex = () => {
    orderIndex.clear();
    for (let l = 0; l < columns.length; l++) {
      const col = columns[l];
      for (let i = 0; i < col.length; i++) orderIndex.set(col[i], i);
    }
  };
  rebuildOrderIndex();
  for (let sweep = 0; sweep < 2; sweep++) {
    for (let l = 1; l < columns.length; l++) {
      const col = columns[l];
      col.sort((a, b) => {
        const pa = preds.get(a) ?? [];
        const pb = preds.get(b) ?? [];
        const ba = pa.length
          ? pa.reduce((acc, id) => acc + (orderIndex.get(id) ?? 0), 0) / pa.length
          : Number.POSITIVE_INFINITY;
        const bb = pb.length
          ? pb.reduce((acc, id) => acc + (orderIndex.get(id) ?? 0), 0) / pb.length
          : Number.POSITIVE_INFINITY;
        if (ba !== bb) return ba - bb;
        return String(a).localeCompare(String(b));
      });
      rebuildOrderIndex();
    }
  }

  const pos = new Map();
  // Spacing is derived from the largest node footprint so nodes never overlap.
  // Major axis advances layers; minor axis spreads nodes within a layer.
  const gapMajor = (direction === "LR" ? nodeW : nodeD) + marginMajor;
  const gapMinor = (direction === "LR" ? nodeD : nodeW) + marginMinor;

  // Side band sits to the left of the widest layer.
  const maxLayerCount = Math.max(1, ...columns.map((c) => (Array.isArray(c) ? c.length : 0)));
  // Side band is shifted perpendicular by a fraction of the widest layer + an extra gap.
  const sideBandMajorOffset = (maxLayerCount * gapMinor) * SIDE_BAND_LAYER_FRACTION + gapMinor * SIDE_BAND_GAP_MULTIPLE;

  for (let l = 0; l < columns.length; l++) {
    const col = columns[l];
    const nCount = col.length;
    for (let i = 0; i < nCount; i++) {
      const id = col[i];
      const minor = (i - (nCount - 1) / 2) * gapMinor;
      const major = l * gapMajor;

      if (direction === "LR") {
        pos.set(id, { x: major, z: minor });
      } else {
        // TB
        // Increase layer index should move the flow forward (toward the viewer in our default framing).
        pos.set(id, { x: minor, z: major });
      }
    }

    // Place side-band nodes anchored to this layer.
    const side = sideBandByLayer.get(l);
    if (Array.isArray(side) && side.length) {
      side.sort();
      for (let i = 0; i < side.length; i++) {
        const id = side[i];
        const minor = (i - (side.length - 1) / 2) * (gapMinor * SIDE_BAND_MINOR_SPACING);
        const major = l * gapMajor;

        if (direction === "LR") {
          // For LR, side band goes "up" (negative Z) relative to main band.
          pos.set(id, { x: major, z: minor - sideBandMajorOffset });
        } else {
          // For TB, side band goes to the left (negative X) relative to main band.
          pos.set(id, { x: minor - sideBandMajorOffset, z: major });
        }
      }
    }
  }

  return pos;
}
