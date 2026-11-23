// SPDX-License-Identifier: Apache-2.0
// Shared picking helpers for graph scenes.
// Goal: de-duplicate desktop + XR selection/hover wiring without changing UX.

function getGraphHit(entry) {
  return entry?.object?.userData?.graphHit ?? null;
}

function isControlGraphHit(graphHit) {
  return graphHit?.kind === "action-handle" || graphHit?.kind === "port";
}

function getEntryRenderOrder(entry) {
  const renderOrder = Number(entry?.object?.renderOrder);
  return Number.isFinite(renderOrder) ? renderOrder : Number.NEGATIVE_INFINITY;
}

function pickTopmostNodeGraphHit(hits) {
  if (!Array.isArray(hits) || !hits.length) return null;

  let bestEntry = null;
  let bestRenderOrder = Number.NEGATIVE_INFINITY;
  for (const entry of hits) {
    const graphHit = getGraphHit(entry);
    if (graphHit?.kind !== "node") continue;

    const renderOrder = getEntryRenderOrder(entry);
    if (!bestEntry || renderOrder > bestRenderOrder) {
      bestEntry = entry;
      bestRenderOrder = renderOrder;
    }
  }

  return bestEntry ? getGraphHit(bestEntry) : null;
}

/**
 * Purpose: Resolve the nearest control hit (action handle or port) around a desktop client point so apps can prefer explicit control affordances over enclosing node surfaces.
 * @param {Array<object>} [hits=[]] Raycast hit records that may contain graphHit metadata on object.userData.graphHit.
 * @param {object} [options] Control-hit selection options.
 * @param {number} [options.clientX] Desktop client-space X coordinate.
 * @param {number} [options.clientY] Desktop client-space Y coordinate.
 * @param {(entry: object) => { x: number, y: number } | null} [options.projectHitEntryToClient] Callback that projects a hit entry into client space.
 * @param {number} [options.maxDistancePx=12] Maximum client-space distance allowed between the pointer and the projected control center.
 * @returns {object | null} The nearest control graphHit within the configured distance threshold, or null when no projected control is close enough.
 * Side effects: none.
 */
export function pickClosestControlGraphHitByClientPoint(
  hits,
  {
    clientX,
    clientY,
    projectHitEntryToClient,
    maxDistancePx = 12,
  } = {},
) {
  if (!Array.isArray(hits) || !hits.length) return null;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  if (typeof projectHitEntryToClient !== "function") return null;

  let bestGraphHit = null;
  let bestDistancePx = Number.POSITIVE_INFINITY;

  for (const entry of hits) {
    const graphHit = getGraphHit(entry);
    if (!isControlGraphHit(graphHit)) continue;

    const clientPoint = projectHitEntryToClient(entry);
    if (!clientPoint) continue;

    const distancePx = Math.hypot(clientX - clientPoint.x, clientY - clientPoint.y);
    if (distancePx < bestDistancePx) {
      bestDistancePx = distancePx;
      bestGraphHit = graphHit;
    }
  }

  return bestDistancePx <= Math.max(0, Number(maxDistancePx) || 0)
    ? bestGraphHit
    : null;
}

/**
 * Purpose: Resolve the preferred graph hit from a raycast result by prioritizing explicit controls over enclosing nodes while preserving edge fallback behavior.
 * @param {Array<object>} [hits=[]] Raycast hit records that may contain graphHit metadata on object.userData.graphHit.
 * @param {object} [options] Hit-priority options.
 * @param {number | null} [options.clientX=null] Desktop client-space X coordinate used to distinguish pointer-aware fallback ordering.
 * @param {number | null} [options.clientY=null] Desktop client-space Y coordinate used to distinguish pointer-aware fallback ordering.
 * @param {object | null} [options.closestControlHit=null] Closest explicit control hit already resolved by the caller.
 * @param {object | null} [options.closestEdgeHit=null] Closest edge hit already resolved by the caller.
 * @returns {object | null} The preferred graphHit record to use for selection/interaction, or null when no graphHit metadata exists.
 * Side effects: none.
 */
export function selectPreferredGraphHit(
  hits,
  {
    clientX = null,
    clientY = null,
    closestControlHit = null,
    closestEdgeHit = null,
  } = {},
) {
  const hasClientPoint = Number.isFinite(clientX) && Number.isFinite(clientY);
  const firstGraphHit = Array.isArray(hits) && hits.length
    ? getGraphHit(hits[0])
    : null;

  if (closestControlHit) {
    return closestControlHit;
  }

  if (isControlGraphHit(firstGraphHit)) {
    return firstGraphHit;
  }

  const nodeHit = pickTopmostNodeGraphHit(hits);
  if (nodeHit) {
    return nodeHit;
  }

  if (firstGraphHit?.kind === "edge") {
    return closestEdgeHit ?? firstGraphHit;
  }

  const priorities = hasClientPoint
    ? ["node"]
    : ["action-handle", "port", "node"];
  for (const kind of priorities) {
    const match = Array.isArray(hits)
      ? hits.find((entry) => getGraphHit(entry)?.kind === kind)
      : null;
    if (match) return getGraphHit(match);
  }

  if (closestEdgeHit) return closestEdgeHit;

  const edgeMatch = Array.isArray(hits)
    ? hits.find((entry) => getGraphHit(entry)?.kind === "edge")
    : null;
  if (edgeMatch) return getGraphHit(edgeMatch);

  return firstGraphHit;
}

function isVisibleEditHit(entry) {
  for (let object = entry?.object; object; object = object.parent) {
    if (object.visible === false) return false;
  }
  return Boolean(entry?.object);
}

/**
 * Resolve a direct text-edit gesture, separate from ordinary graph selection.
 * Include edit-only label surfaces in the edit raycast and supply the ordinary
 * preferred hit (if already computed) so ports and handles keep precedence.
 * A card's body remains a hit region even when its text is currently empty.
 */
export function resolveGraphSceneEditTarget(hits = [], preferredGraphHit = undefined) {
  if (!Array.isArray(hits)) return null;
  const visible = hits.filter(isVisibleEditHit);
  const preferred = preferredGraphHit ?? selectPreferredGraphHit(visible);
  if (isControlGraphHit(preferred)) return null;
  if (preferred?.kind === "node") {
    const entry = visible.find(hit => getGraphHit(hit) === preferred);
    const region = entry?.object?.userData?.graphEditRegion;
    if (!region) return null;
    const isBody = region.shape === "card" && Number.isFinite(region.bodyThreshold)
      && Number.isFinite(entry.uv?.y) && entry.uv.y < region.bodyThreshold;
    return { kind: "node", id: preferred.id, node: preferred.node, field: isBody ? "body" : "title" };
  }
  for (const entry of visible) {
    const target = entry.object.userData?.graphEditTarget;
    if (target?.kind === "edge" || target?.kind === "label") return target;
  }
  return null;
}
