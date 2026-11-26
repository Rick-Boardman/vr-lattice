// SPDX-License-Identifier: Apache-2.0
// Shared HUD window layout helpers for graph scenes.

import {
  HUD_LAYOUT_DEFAULT_HEIGHT_PX,
  HUD_LAYOUT_DEFAULT_WIDTH_PX,
  HUD_WINDOW_EDGE_MARGIN_PX,
  HUD_WINDOW_HIDDEN_Y_PX,
  HUD_WINDOW_TITLE_HEIGHT_PX,
  HUD_WINDOW_VR_RIGHT_X_PX,
} from "@rb/halo/src/hud-layout-policy.js";
import { clamp } from "@rb/halo/src/scalar-math.js";

/**
 * Purpose: Hide a named HUD window in a graph scene, preferring full destruction over offscreen placement to avoid VR wrap-around artifacts.
 * @param {object | null | undefined} hudSystem Shared HUD system returned by createHudSystem or createSceneHudBootstrap.
 * @param {string} key Window key to hide.
 * @returns {void}
 * Side effects: may destroy the named window through the HUD system or mutate its collapsed/x/y state when only direct window access is available.
 */
export function hideHudWindow(hudSystem, key) {
  // Prefer hard-removal to avoid VR wrap-around visibility.
  if (hudSystem?.destroyWindow) {
    hudSystem.destroyWindow(key);
    return;
  }

  // Fallback: move offscreen and collapse.
  const w = hudSystem?.hud?.ui?.windows?.[key];
  if (!w) return;
  w.collapsed = true;
  w.x = -10000;
  w.y = -10000;
}

/**
 * Create the standard graph scene windows (help, selection) if they don't exist.
 * Call this before applyStandardGraphHudLayout().
 * Purpose: Ensure the graph scene's standard HELP and TARGET windows exist and optionally seed help content.
 * @param {object | null | undefined} hudSystem Shared HUD system returned by createHudSystem or createSceneHudBootstrap.
 * @param {{ helpLines?: Array<unknown>, ensureHelpWindow?: boolean, ensureSelectionWindow?: boolean }} [options] Optional window-seeding options.
 * @returns {void}
 * Side effects: may create missing HUD windows, seed help-window lines, and reposition the help window into its hidden-offscreen starting state.
 */
export function ensureGraphHudWindows(hudSystem, options = {}) {
  if (!hudSystem?.createWindow) return;
  const ensureHelpWindow = options.ensureHelpWindow !== false;
  const ensureSelectionWindow = options.ensureSelectionWindow !== false;

  // HELP window (top-left, shows controls)
  if (ensureHelpWindow && !hudSystem.hud?.ui?.windows?.help) {
    const w = hudSystem.createWindow("help", {
      title: "HELP",
      x: HUD_WINDOW_EDGE_MARGIN_PX,
      y: HUD_WINDOW_EDGE_MARGIN_PX,
      w: 330,
      h: 210,
      scrollable: true,
      scrollMode: "top",
      maxLines: 120,
    });

    // Start NOT visible by default (consistent with runtime default help).
    // Important for VR: hidden windows must be treated as hidden, not merely
    // moved far off-screen (spherical mapping can wrap coordinates).
    if (w) {
      w._helpHiddenX = w.x;
      w._helpHiddenY = w.y;
      w._helpHiddenCollapsed = false;
      w.x = HUD_WINDOW_VR_RIGHT_X_PX;
      w.y = HUD_WINDOW_HIDDEN_Y_PX;
    }
  }

  // SELECTION window (shows selected node details, stays visible until closed)
  if (ensureSelectionWindow && !hudSystem.hud?.ui?.windows?.selection) {
    hudSystem.createWindow("selection", {
      title: "TARGET",
      x: HUD_WINDOW_EDGE_MARGIN_PX,
      y: HUD_WINDOW_EDGE_MARGIN_PX,
      w: 520,
      h: 360,
      scrollable: true,
      scrollMode: "top",
      maxLines: 320,
    });
  }

  // Set default help content if provided
  if (options.helpLines && Array.isArray(options.helpLines)) {
    try {
      hudSystem.setWindowLines("help", options.helpLines, { scrollMode: "top" });
    } catch {
      // no-op
    }
  }
}

/**
 * Purpose: Apply the canonical desktop HUD layout for graph scenes, including system log, help, selection, and hotbar placement.
 * @param {object | null | undefined} hudSystem Shared HUD system returned by createHudSystem or createSceneHudBootstrap.
 * @returns {void}
 * Side effects: mutates graph-scene HUD window titles, positions, sizes, collapsed states, layout-initialization flags, and clears the system-log window contents.
 */
export function applyStandardGraphHudLayout(hudSystem, { relayout = false } = {}) {
  // Desktop layout:
  // - DEBUG + SYSTEM LOG in a left column
  // - VR + TARGET + hotbar in a right column
  // - HELP stays hidden until requested
  if (!hudSystem?.hud?.ui) return;
  // The first layout starts every bar collapsed; a relayout after a resize keeps what the person opened or closed.
  const collapse = win => { if (!relayout) win.collapsed = true; };
  const heightOf = win => (win.collapsed ? HUD_WINDOW_TITLE_HEIGHT_PX : Math.round(Number(win.h) || 0));

  const W = hudSystem?.hud?.layoutW ?? HUD_LAYOUT_DEFAULT_WIDTH_PX;
  const H = hudSystem?.hud?.layoutH ?? HUD_LAYOUT_DEFAULT_HEIGHT_PX;
  const edge = HUD_WINDOW_EDGE_MARGIN_PX;
  const stackGap = edge;
  const titleH = HUD_WINDOW_TITLE_HEIGHT_PX;

  const sel = hudSystem?.hud?.ui?.windows?.selection;
  const xr = hudSystem?.hud?.ui?.windows?.xr;
  const xrWasHidden = Number(xr?.y) < -1000;

  const hotbar = hudSystem?.hud?.ui?.windows?.hotbar;
  if (hotbar) {
    const preferredHotbarSize = hudSystem?.getPreferredHotbarWindowSize?.() ?? null;
    const fallbackHotbarW = Math.max(Number(hotbar.w) || 0, 430);
    const fallbackHotbarH = Math.max(Number(hotbar.h) || 0, 92);
    const maxHotbarW = Math.max(240, Math.floor(W - edge * 2));
    const maxHotbarH = Math.max(40, Math.floor(H - edge * 2));
    const minHotbarW = Math.min(
      Number.isFinite(preferredHotbarSize?.minW) ? Math.round(preferredHotbarSize.minW) : fallbackHotbarW,
      maxHotbarW
    );
    const minHotbarH = Math.min(
      Number.isFinite(preferredHotbarSize?.minH) ? Math.round(preferredHotbarSize.minH) : fallbackHotbarH,
      maxHotbarH
    );

    hotbar.minW = minHotbarW;
    hotbar.minH = minHotbarH;
    hotbar.w = clamp(
      Math.round(preferredHotbarSize?.w ?? fallbackHotbarW),
      minHotbarW,
      maxHotbarW
    );
    hotbar.h = clamp(
      Math.round(preferredHotbarSize?.h ?? fallbackHotbarH),
      minHotbarH,
      maxHotbarH
    );
    hotbar.x = Math.max(edge, Math.floor(W - hotbar.w - edge));
    hotbar.y = Math.max(edge, Math.floor(H - hotbar.h - edge));
  }

  if (xr && !xrWasHidden) {
    xr.x = Math.max(edge, Math.floor(W - xr.w - edge));
    xr.y = edge;
  }

  const rightColumnWidth = Math.max(
    !xrWasHidden && Number.isFinite(xr?.w) ? Math.round(xr.w) : 0,
    Number.isFinite(sel?.w) ? Math.round(sel.w) : 0,
    Number.isFinite(hotbar?.w) ? Math.round(hotbar.w) : 0
  );
  const leftColumnMaxW = Math.max(0, Math.floor(W - rightColumnWidth - edge * 3));
  const useLeftColumn = leftColumnMaxW >= 320;

  const debug = hudSystem?.hud?.ui?.windows?.debug;
  const chat = hudSystem?.hud?.ui?.windows?.chat;
  if (!useLeftColumn) {
    // A phone or narrow viewer: no room for two columns. Enter VR keeps the top right; the collapsed SYSTEM LOG, DEBUG
    // and TARGET bars stack below it at the viewer's width, and TARGET opens into the space above the hotbar.
    const columnW = Math.max(160, Math.floor(W - edge * 2));
    let y = !xrWasHidden && xr ? Math.round(xr.y + xr.h + stackGap) : edge;
    for (const win of [chat, debug]) {
      if (!win) continue;
      if (win === chat) chat.title = "SYSTEM LOG";
      collapse(win);
      win.w = columnW;
      if (Number.isFinite(win.minW)) win.minW = Math.min(Math.round(win.minW), columnW);
      win.x = edge;
      win.y = y;
      y += heightOf(win) + Math.round(stackGap / 2);
    }
    if (sel) {
      const bottom = hotbar ? hotbar.y - stackGap : H - edge;
      const selectionH = Math.max(titleH * 4, Math.min(Math.round(sel.h), Math.floor(bottom - y)));
      collapse(sel);
      sel.w = Math.min(Math.round(sel.w), columnW);
      if (Number.isFinite(sel.minW)) sel.minW = Math.min(Math.round(sel.minW), columnW);
      sel.h = selectionH;
      if (Number.isFinite(sel.minH)) sel.minH = Math.min(Math.round(sel.minH), selectionH);
      sel.x = Math.max(edge, Math.floor(W - sel.w - edge));
      sel.y = y;
    }
    finishGraphHudLayout(hudSystem, { relayout });
    return;
  }
  if (debug) {
    const minDebugW = Math.max(320, Math.floor(Number(debug.minW) || 0));
    const maxDebugW = useLeftColumn
      ? Math.max(minDebugW, leftColumnMaxW)
      : Math.max(minDebugW, Math.floor(W * 0.42));
    collapse(debug);
    debug.w = clamp(debug.w, minDebugW, maxDebugW);
    debug.x = useLeftColumn ? edge : Math.max(edge, Math.floor(W - debug.w - edge));
    debug.y = useLeftColumn
      ? edge
      : Math.max(edge, Math.floor(H - debug.h - edge));
  }

  if (chat) {
    const maxChatW = useLeftColumn
      ? Math.max(320, leftColumnMaxW)
      : Math.max(320, Math.floor(W * 0.56));
    chat.title = "SYSTEM LOG";
    collapse(chat);
    chat.w = clamp(chat.w, 320, maxChatW);
    chat.x = useLeftColumn ? edge : Math.max(edge, Math.floor(W - chat.w - edge));
    chat.y = useLeftColumn
      ? Math.max(edge, Math.floor(H - chat.h - edge))
      : Math.max(edge, Math.floor(H - titleH - edge));
  }

  if (sel) {
    const topRibbonBottom = useLeftColumn
      ? edge
      : Math.max(
        chat ? chat.y + titleH : edge,
        debug ? debug.y + titleH : edge
      ) + stackGap;
    const rightColumnTop = !useLeftColumn
      ? topRibbonBottom
      : !xrWasHidden && xr
        ? xr.y + xr.h + stackGap
        : edge;
    const rightColumnBottom = hotbar ? hotbar.y - stackGap : H - edge;
    const maxSelectionH = Math.max(titleH * 4, Math.floor(rightColumnBottom - rightColumnTop));
    const nextSelectionH = Math.max(titleH * 4, Math.min(Math.round(sel.h), maxSelectionH));

    collapse(sel);
    sel.h = nextSelectionH;
    if (Number.isFinite(sel.minH)) sel.minH = Math.min(Math.round(sel.minH), nextSelectionH);
    sel.x = Math.max(edge, Math.floor(W - sel.w - edge));
    sel.y = clamp(
      Math.floor(rightColumnTop),
      edge,
      Math.max(edge, Math.floor(rightColumnBottom - sel.h))
    );
  }

  finishGraphHudLayout(hudSystem, { relayout });
}

/**
 * Lay the graph HUD out again after the viewer changed size, unless the person has moved one of its windows (Halo
 * marks a dragged window `userPlaced`). Keeps the log and each window's collapsed state.
 * @param {object | null | undefined} hudSystem Shared HUD system.
 * @returns {boolean} Whether the layout was applied.
 */
export function relayoutStandardGraphHud(hudSystem) {
  const windows = hudSystem?.hud?.ui?.windows;
  if (!windows || hudSystem?.renderer?.xr?.isPresenting) return false;
  if (["chat", "debug", "selection"].some(key => windows[key]?.userPlaced)) return false;
  applyStandardGraphHudLayout(hudSystem, { relayout: true });
  return true;
}

function finishGraphHudLayout(hudSystem, { relayout = false } = {}) {
  const edge = HUD_WINDOW_EDGE_MARGIN_PX;
  const help = hudSystem?.hud?.ui?.windows?.help;
  if (help) {
    // Do not un-hide help during layout; it must start not visible.
    if (!(Number(help.y) < -1000)) {
      help.x = edge;
      help.y = edge;
    }
  }

  // Prevent the HUD's default demo layout from re-positioning windows.
  hudSystem.hud.ui._layoutInitialized = true;
  // This layout is the graph scene's: Halo's WebXR support check then places Enter VR only (Halo 0.3.7).
  hudSystem.hud.ui._layoutByHalo = false;

  if (relayout) return;
  // System log should start blank (the runtime HUD seeds demo chat lines).
  try {
    hudSystem.setWindowLines("chat", [], { scrollMode: "top" });
  } catch {
    // no-op
  }
}

/**
 * Purpose: Hide the default demo HUD windows that graph scenes do not use.
 * @param {object | null | undefined} hudSystem Shared HUD system returned by createHudSystem or createSceneHudBootstrap.
 * @returns {void}
 * Side effects: hides or destroys the default skills, event, inventory, progress, buffs, and target windows through hideHudWindow().
 */
export function hideDefaultDemoWindows(hudSystem) {
  hideHudWindow(hudSystem, "skills");
  hideHudWindow(hudSystem, "event");
  hideHudWindow(hudSystem, "inventory");
  hideHudWindow(hudSystem, "progress");
  hideHudWindow(hudSystem, "buffs");
  hideHudWindow(hudSystem, "target");
}
