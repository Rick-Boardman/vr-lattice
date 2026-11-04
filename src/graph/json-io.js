// SPDX-License-Identifier: Apache-2.0
// Shared JSON IO helpers for runtime graph scenes.
// Purpose: consistent fetch+timeout+errors across scenes (Quest-safe).

function formatError(e) {
  try {
    if (!e) return String(e);
    if (typeof e === "string") return e;
    if (typeof e === "object" && e.message) return String(e.message);
    return String(e);
  } catch {
    return "(unknown error)";
  }
}

/**
 * Purpose: Export the canonical timeout budget for shared graph JSON fetches.
 * Return value: the default graph JSON fetch timeout in milliseconds.
 * Side effects: none; constant export.
 */
export const DEFAULT_GRAPH_JSON_TIMEOUT_MS = 15000;
const GRAPH_JSON_ERROR_PREVIEW_LIMIT = 6;

/**
 * @param {{ timeoutMs?: number, signal?: AbortSignal | null }} [options]
 */
function createTimedAbortController({
  timeoutMs = DEFAULT_GRAPH_JSON_TIMEOUT_MS,
  signal = null,
} = {}) {
  const controller = new AbortController();
  const timeout = Math.max(0, Number(timeoutMs) || 0);
  const timerId = setTimeout(() => controller.abort(), timeout);

  let cleanupExternal = null;
  if (signal && typeof signal === "object") {
    const onAbort = () => {
      try {
        controller.abort();
      } catch {
        // no-op
      }
    };
    try {
      signal.addEventListener?.("abort", onAbort, { once: true });
      cleanupExternal = () => signal.removeEventListener?.("abort", onAbort);
    } catch {
      // no-op
    }
  }

  return {
    controller,
    timeout,
    dispose() {
      clearTimeout(timerId);
      try {
        cleanupExternal?.();
      } catch {
        // no-op
      }
    },
  };
}

/**
 * @param {{
 *   url?: string,
 *   timeoutMs?: number,
 *   cache?: RequestCache,
 *   signal?: AbortSignal | null,
 *   resourceLabel?: string,
 *   wrapNetworkError?: boolean,
 * }} [options]
 */
async function fetchResponseWithTimeout({
  url,
  timeoutMs = DEFAULT_GRAPH_JSON_TIMEOUT_MS,
  cache = "no-store",
  signal = null,
  resourceLabel = "JSON",
  wrapNetworkError = true,
} = {}) {
  if (!url) throw new Error("fetchResponseWithTimeout: missing url");
  if (typeof globalThis.fetch !== "function") {
    throw new Error(`fetch unavailable (cannot load ${resourceLabel})`);
  }

  const timeoutController = createTimedAbortController({ timeoutMs, signal });

  let res;
  try {
    res = await fetch(url, { cache, signal: timeoutController.controller.signal });
  } catch (e) {
    if (e && typeof e === "object" && e.name === "AbortError") {
      throw new Error(`Timed out loading ${resourceLabel} '${url}' after ${timeoutController.timeout}ms`);
    }
    if (wrapNetworkError) {
      throw new Error(`Failed to fetch '${url}': ${formatError(e)}`);
    }
    throw e;
  } finally {
    timeoutController.dispose();
  }

  if (!res?.ok) {
    throw new Error(`Failed to load ${resourceLabel} '${url}' (HTTP ${res?.status ?? "?"})`);
  }

  return res;
}

/**
 * Purpose: Fetch a JSON document with the shared timeout and error-wrapping policy used by runtime graph scenes.
 * @param {object} [options] JSON fetch options.
 * @param {string} [options.url] URL to fetch.
 * @param {number} [options.timeoutMs=DEFAULT_GRAPH_JSON_TIMEOUT_MS] Timeout budget in milliseconds.
 * @param {RequestCache} [options.cache="no-store"] Request cache mode forwarded to `fetch`.
 * @param {AbortSignal | null} [options.signal=null] Optional external abort signal chained into the timeout controller.
 * @returns {Promise<unknown>} Parsed JSON payload.
 * Side effects: performs a network request and allocates a timeout-backed abort controller. Throws when the URL is missing, the fetch fails, the request times out, or the response body is not valid JSON.
 */
export async function fetchJsonWithTimeout({
  url,
  timeoutMs = DEFAULT_GRAPH_JSON_TIMEOUT_MS,
  cache = "no-store",
  signal = null,
} = {}) {
  if (!url) throw new Error("fetchJsonWithTimeout: missing url");
  const res = await fetchResponseWithTimeout({
    url,
    timeoutMs,
    cache,
    signal,
    resourceLabel: "JSON",
    wrapNetworkError: true,
  });

  try {
    return await res.json();
  } catch (e) {
    throw new Error(`Invalid JSON from '${url}': ${formatError(e)}`);
  }
}

/**
 * Purpose: Validate that an arbitrary value conforms to the shared runtime graph JSON document contract.
 * @param {unknown} graph Candidate graph document.
 * @param {object} [options] Validation options.
 * @param {number | null} [options.schemaVersion=null] Optional schema version that the graph must match.
 * @returns {{ ok: boolean, errors: string[] }} Validation result containing a success flag and any accumulated validation errors.
 * Side effects: none; pure validation helper.
 */
export function validateGraphJsonDocument(graph, { schemaVersion = null } = {}) {
  const errors = [];
  const g = /** @type {any} */ (graph && typeof graph === "object" ? graph : null);
  if (!g) errors.push("graph must be an object");

  if (schemaVersion !== null && g?.schemaVersion !== schemaVersion) {
    errors.push(`schemaVersion must be ${schemaVersion}`);
  }

  if (!Array.isArray(g?.nodes)) errors.push("nodes must be an array");
  if (!Array.isArray(g?.edges)) errors.push("edges must be an array");

  const nodeIds = new Set();
  for (const node of g?.nodes || []) {
    if (!node || typeof node !== "object") {
      errors.push("node must be an object");
      continue;
    }
    if (typeof node.id !== "string" || !node.id.trim()) errors.push("node.id must be a non-empty string");
    if (typeof node.type !== "string" || !node.type.trim()) errors.push("node.type must be a non-empty string");
    if (typeof node.displayName !== "string") errors.push("node.displayName must be a string");
    if (typeof node.id === "string" && node.id.trim()) nodeIds.add(node.id);
  }

  for (const edge of g?.edges || []) {
    if (!edge || typeof edge !== "object") {
      errors.push("edge must be an object");
      continue;
    }
    if (typeof edge.fromId !== "string" || !edge.fromId.trim()) errors.push("edge.fromId must be a non-empty string");
    if (typeof edge.toId !== "string" || !edge.toId.trim()) errors.push("edge.toId must be a non-empty string");
    if (typeof edge.type !== "string" || !edge.type.trim()) errors.push("edge.type must be a non-empty string");
    if (typeof edge.fromId === "string" && edge.fromId && !nodeIds.has(edge.fromId)) {
      errors.push(`edge.fromId '${edge.fromId}' not found in nodes`);
    }
    if (typeof edge.toId === "string" && edge.toId && !nodeIds.has(edge.toId)) {
      errors.push(`edge.toId '${edge.toId}' not found in nodes`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Purpose: Fetch a graph JSON document, validate it against the shared graph contract, and return the parsed document when validation succeeds.
 * @param {object} [options] Graph-load options.
 * @param {string} [options.url] URL to fetch.
 * @param {number} [options.timeoutMs=DEFAULT_GRAPH_JSON_TIMEOUT_MS] Timeout budget in milliseconds.
 * @param {RequestCache} [options.cache="no-store"] Request cache mode forwarded to `fetch`.
 * @param {AbortSignal | null} [options.signal=null] Optional external abort signal chained into the timeout controller.
 * @param {number | null} [options.schemaVersion=null] Optional schema version that the loaded graph must match.
 * @param {string} [options.resourceLabel="graph"] Resource label used in wrapped fetch errors.
 * @param {string} [options.invalidGraphLabel="Invalid graph JSON"] Prefix used when validation fails.
 * @returns {Promise<unknown>} Parsed graph JSON document after validation succeeds.
 * Side effects: performs a network request and validation pass. Throws when the URL is missing, the fetch fails, the response JSON is invalid, or the graph schema check fails.
 */
export async function loadValidatedGraphJson({
  url,
  timeoutMs = DEFAULT_GRAPH_JSON_TIMEOUT_MS,
  cache = "no-store",
  signal = null,
  schemaVersion = null,
  resourceLabel = "graph",
  invalidGraphLabel = "Invalid graph JSON",
} = {}) {
  if (!url) throw new Error("loadValidatedGraphJson: missing url");

  const res = await fetchResponseWithTimeout({
    url,
    timeoutMs,
    cache,
    signal,
    resourceLabel,
    wrapNetworkError: false,
  });

  const json = await res.json();
  const validation = validateGraphJsonDocument(json, { schemaVersion });
  if (!validation.ok) {
    throw new Error(`${invalidGraphLabel}: ${validation.errors.slice(0, GRAPH_JSON_ERROR_PREVIEW_LIMIT).join("; ")}`);
  }
  return json;
}
