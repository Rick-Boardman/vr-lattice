// SPDX-License-Identifier: Apache-2.0
// Shared HUD formatting helpers for graph scenes.
// Keep these pure and UI-framework-agnostic: they should only build line arrays.

import {
  HUD_TEXT_DEFAULT_COLOR,
  HUD_TEXT_EMPHASIS_COLOR,
  HUD_TEXT_INFO_COLOR,
} from "@rb/halo/src/hud-text-style.js";

function round1(n) {
  const x = Number(n) || 0;
  return Math.round(x * 10) / 10;
}

function safeTypesObject(types) {
  if (!types || typeof types !== "object") return {};
  return types;
}

/**
 * Format a "top connections" section.
 *
 * Inputs:
 * - items: [{ otherId, weight, count?, types? }]
 * - resolveName(otherId) -> display name
 *
 * Options:
 * - title: section header (default "top connections:")
 * - limit: max items shown (default 6)
 * - maxLineChars: hard cap for line length (default 76)
 * - showCount: whether to include ", n:X" (default false)
 * Purpose: Build shared HUD line records for a ranked "top connections" section without depending on a specific HUD implementation.
 * @param {Array<{ otherId?: string, weight?: number, count?: number, types?: Record<string, number> }>} items Ranked connection summaries.
 * @param {(otherId: string | undefined) => string | null | undefined} resolveName Callback that resolves node ids into display names.
 * @param {object} [options] Formatting options.
 * @param {string} [options.title="top connections:"] Section title line.
 * @param {number} [options.limit=6] Maximum number of connection lines to emit.
 * @param {number} [options.maxLineChars=76] Maximum output line length.
 * @param {boolean} [options.showCount=false] Whether the emitted line should include the raw connection count.
 * @returns {Array<{ text: string, color: number }>} Colored HUD line records for the section.
 * Side effects: none; pure formatting helper.
 */
export function formatTopConnectionsLines(items, resolveName, {
  title = "top connections:",
  limit = 6,
  maxLineChars = 76,
  showCount = false,
} = {}) {
  const lines = [];
  lines.push({ text: "", color: HUD_TEXT_DEFAULT_COLOR });
  lines.push({ text: title, color: HUD_TEXT_EMPHASIS_COLOR });

  const list = Array.isArray(items) ? items : [];
  for (const n of list.slice(0, Math.max(0, limit))) {
    const otherId = n?.otherId;
    const name = (typeof resolveName === "function" ? resolveName(otherId) : null) || String(otherId);
    const w = round1(n?.weight);

    const t = safeTypesObject(n?.types);
    const typeBits = Object.keys(t)
      .sort()
      .map((k) => `${k}:${t[k]}`)
      .join(",");
    const suffixTypes = typeBits ? `  [${typeBits}]` : "";

    const countPart = showCount ? `, n:${Number(n?.count || 0) || 0}` : "";
    const text = `-> ${name} (w:${w}${countPart})${suffixTypes}`;
    lines.push({ text: text.slice(0, maxLineChars), color: HUD_TEXT_DEFAULT_COLOR });
  }

  return lines;
}

/**
 * Format directed edge lists (outgoing + incoming) with the same
 * line shapes used by the existing scenes.
 *
 * outgoingItems: [{ kind, to, label }]
 * incomingItems: [{ kind, from, label }]
 * Purpose: Build shared HUD line records for outgoing and incoming edge summaries.
 * @param {Array<{ kind?: string, to?: string, label?: string }>} outgoingItems Outgoing edge summaries.
 * @param {Array<{ kind?: string, from?: string, label?: string }>} incomingItems Incoming edge summaries.
 * @param {object} [options] Formatting options.
 * @param {number} [options.maxOut=8] Maximum number of outgoing edges to include before truncation.
 * @param {number} [options.maxIn=6] Maximum number of incoming edges to include before truncation.
 * @param {number} [options.maxLineChars=76] Maximum output line length.
 * @param {number} [options.moreColor=HUD_TEXT_INFO_COLOR] Color applied to truncation-summary lines.
 * @param {number} [options.lineColor=HUD_TEXT_DEFAULT_COLOR] Color applied to edge lines.
 * @returns {Array<{ text: string, color: number }>} Colored HUD line records for the directed edge summary.
 * Side effects: none; pure formatting helper.
 */
export function formatDirectedEdgeLists(
  outgoingItems,
  incomingItems,
  {
    maxOut = 8,
    maxIn = 6,
    maxLineChars = 76,
    moreColor = HUD_TEXT_INFO_COLOR,
    lineColor = HUD_TEXT_DEFAULT_COLOR,
  } = {}
) {
  const lines = [];

  const out = Array.isArray(outgoingItems) ? outgoingItems : [];
  for (const e of out.slice(0, Math.max(0, maxOut))) {
    const kind = String(e?.kind ?? "");
    const label = String(e?.label ?? e?.to ?? "");
    lines.push({ text: `-> ${kind}: ${label}`.slice(0, maxLineChars), color: lineColor });
  }
  if (out.length > maxOut) {
    lines.push({ text: `... +${out.length - maxOut} more`, color: moreColor });
  }

  const inc = Array.isArray(incomingItems) ? incomingItems : [];
  for (const e of inc.slice(0, Math.max(0, maxIn))) {
    const kind = String(e?.kind ?? "");
    const label = String(e?.label ?? e?.from ?? "");
    lines.push({ text: `<- ${kind}: ${label}`.slice(0, maxLineChars), color: lineColor });
  }
  if (inc.length > maxIn) {
    lines.push({ text: `... +${inc.length - maxIn} more`, color: moreColor });
  }

  return lines;
}

/**
 * Application Network-specific: render an application's connectivity details.
 *
 * This preserves the existing UX/output while moving the logic into a shared module
 * so it can later be driven by config rather than per-scene code.
 * Purpose: Build the application-network-specific connectivity summary shown in the graph HUD for an application node.
 * @param {{ appId?: string, getOutEdges?: (id: string) => Array<unknown>, getInEdges?: (id: string) => Array<unknown>, resolveNodeById?: (id: string | undefined) => any }} dependencies Graph accessors used to resolve connected servers, databases, file shares, and edge counts.
 * @param {object} [options] Formatting options.
 * @param {number} [options.maxServers=6] Maximum number of server lines to include before truncation.
 * @param {number} [options.maxDbs=4] Maximum number of database labels to include per server line.
 * @param {number} [options.maxShares=6] Maximum number of file-share lines to include before truncation.
 * @param {number} [options.maxLineChars=76] Maximum output line length.
 * @returns {Array<{ text: string, color: number }>} Colored HUD line records describing the application's connectivity.
 * Side effects: none; pure formatting helper.
 */
export function formatAppNetworkApplicationConnectivity(
  {
    appId,
    getOutEdges,
    getInEdges,
    resolveNodeById,
  },
  {
    maxServers = 6,
    maxDbs = 4,
    maxShares = 6,
    maxLineChars = 76,
  } = {}
) {
  const lines = [];
  if (!appId) return lines;

  const outEdges = typeof getOutEdges === "function" ? getOutEdges(appId) : [];
  const inEdges = typeof getInEdges === "function" ? getInEdges(appId) : [];

  const appServers = outEdges.filter((e) => (e?._raw?.type || e?.kind) === "APP_USES_SERVER");
  const appShares = outEdges.filter((e) => (e?._raw?.type || e?.kind) === "APP_USES_FILESHARE");

  lines.push({ text: "", color: HUD_TEXT_DEFAULT_COLOR });
  lines.push({ text: `dbServers: ${appServers.length}`, color: HUD_TEXT_EMPHASIS_COLOR });

  for (const e of appServers.slice(0, maxServers)) {
    const serverId = e?.to;
    const serverNode = typeof resolveNodeById === "function" ? resolveNodeById(serverId) : null;
    const serverLabel = serverNode?.name || serverNode?.metadata?.server || serverId;
    lines.push({ text: `-> server: ${serverLabel}`.slice(0, maxLineChars), color: HUD_TEXT_DEFAULT_COLOR });

    const hostedDbIds = (typeof getOutEdges === "function" ? getOutEdges(serverId) : [])
      .filter((x) => (x?._raw?.type || x?.kind) === "SERVER_HOSTS_DATABASE")
      .map((x) => x?.to)
      .filter(Boolean);

    const dbLabels = hostedDbIds
      .map((id) => (typeof resolveNodeById === "function" ? resolveNodeById(id) : null))
      .filter(Boolean)
      .map((n) => n.name || n.id);

    if (dbLabels.length) {
      lines.push({
        text: `   dbs: ${dbLabels.slice(0, maxDbs).join(", ")}${dbLabels.length > maxDbs ? "…" : ""}`.slice(
          0,
          maxLineChars
        ),
        color: HUD_TEXT_INFO_COLOR,
      });
    }
  }

  if (appServers.length > maxServers) {
    lines.push({ text: `... +${appServers.length - maxServers} more servers`, color: HUD_TEXT_INFO_COLOR });
  }

  lines.push({ text: "", color: HUD_TEXT_DEFAULT_COLOR });
  lines.push({ text: `fileShares: ${appShares.length}`, color: HUD_TEXT_EMPHASIS_COLOR });

  for (const e of appShares.slice(0, maxShares)) {
    const fsId = e?.to;
    const fsNode = typeof resolveNodeById === "function" ? resolveNodeById(fsId) : null;
    const fsLabel = fsNode?.name || fsNode?.metadata?.path || fsId;
    lines.push({ text: `-> share: ${fsLabel}`.slice(0, maxLineChars), color: HUD_TEXT_DEFAULT_COLOR });
  }

  if (appShares.length > maxShares) {
    lines.push({ text: `... +${appShares.length - maxShares} more shares`, color: HUD_TEXT_INFO_COLOR });
  }

  lines.push({ text: "", color: HUD_TEXT_DEFAULT_COLOR });
  lines.push({ text: `out: ${outEdges.length}  in: ${inEdges.length}`, color: HUD_TEXT_EMPHASIS_COLOR });

  return lines;
}

const GRAPH_FILESHARE_PATH_COLOR = 0x7cd992;

/**
 * Build HUD detail lines for a selected/hovered node, driven by a mode string.
 * @param {string} mode  "application" | "default" etc.
 * @param {{ node: any, graph: any, derived: any }} ctx
 * @returns {Array<{ text: string, color: number }>}
 */
export function buildDetailsLinesFromMode(mode, { node, graph, derived }) {
  const lines = [];
  if (!node) return [{ text: "(none)", color: HUD_TEXT_DEFAULT_COLOR }];

  const getNodeRaw = (id) => {
    if (!id) return null;
    return derived?.rawNodeById?.get(id) || graph.nodes.find((n) => n.id === id) || null;
  };
  const getOutEdges = (id) => derived?.outEdgesById?.get(id) || [];
  const getInEdges = (id) => derived?.inEdgesById?.get(id) || [];

  const name = node.displayName || node.name || node.id;
  lines.push({ text: name, color: HUD_TEXT_DEFAULT_COLOR });
  lines.push({ text: `type: ${node.type || "node"}`, color: HUD_TEXT_INFO_COLOR });

  if (mode === "application") {
    if (node.organization) lines.push({ text: `org: ${node.organization}`, color: HUD_TEXT_INFO_COLOR });
    if (node.environment) lines.push({ text: `env: ${node.environment}`, color: HUD_TEXT_INFO_COLOR });
    if (node.dbType) lines.push({ text: `dbType: ${node.dbType}`, color: HUD_TEXT_EMPHASIS_COLOR });

    const serverName = node.server || node.metadata?.server;
    if (serverName) lines.push({ text: `server: ${serverName}`, color: HUD_TEXT_INFO_COLOR });
    const share = node.metadata?.share;
    if (share && node.type === "fileshare") lines.push({ text: `share: ${share}`, color: HUD_TEXT_INFO_COLOR });
    const path = node.metadata?.path;
    if (path && node.type === "fileshare") lines.push({ text: `path: ${path}`, color: GRAPH_FILESHARE_PATH_COLOR });

    if (node.type === "application") {
      lines.push(
        ...formatAppNetworkApplicationConnectivity(
          {
            appId: node.id,
            getOutEdges,
            getInEdges,
            resolveNodeById: getNodeRaw,
          },
          { maxServers: 6, maxDbs: 4, maxShares: 6, maxLineChars: 76 }
        )
      );
      return lines;
    }
  }

  const outgoing = getOutEdges(node.id);
  const incoming = getInEdges(node.id);
  lines.push({ text: `out: ${outgoing.length}  in: ${incoming.length}`, color: HUD_TEXT_EMPHASIS_COLOR });

  const outItems = outgoing.map((e) => {
    const toId = e.to;
    const t = getNodeRaw(toId);
    const label = t?.name || t?.displayName || t?.id || toId;
    return { kind: e.kind, to: toId, label };
  });
  const inItems = incoming.map((e) => {
    const fromId = e.from;
    const s = getNodeRaw(fromId);
    const label = s?.name || s?.displayName || s?.id || fromId;
    return { kind: e.kind, from: fromId, label };
  });

  lines.push(
    ...formatDirectedEdgeLists(outItems, inItems, {
      maxOut: 8,
      maxIn: 6,
      maxLineChars: 76,
      moreColor: HUD_TEXT_INFO_COLOR,
      lineColor: HUD_TEXT_DEFAULT_COLOR,
    })
  );
  return lines;
}
