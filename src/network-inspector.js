// SPDX-License-Identifier: Apache-2.0
// Shared HUD helper for "network" scenes (Application Network, People Network, etc.)
// Creates standard HELP / DETAILS / TARGET windows (runtime windows) and provides
// small helpers to update hover + selection content.

// ── Default window-layout policy (pixel positions, sizes, scroll limits) ──
// These values define the initial HUD inspector placement on a standard
// 1280 × 720 viewport.  Callers may override via the options object.
const DETAILS_WINDOW = {
  title: "DETAILS",  x: 16,  y: 310, w: 620, h: 340,
  scrollable: true, scrollMode: "top", maxLines: 240,
};
const SELECTION_WINDOW = {
  title: "TARGET",   x: 360, y: 110, w: 640, h: 500,
  scrollable: true, scrollMode: "top", maxLines: 360,
};
const HELP_WINDOW = {
  title: "HELP",     x: 16,  y: 88,  w: 330, h: 210,
  scrollable: true, scrollMode: "top", maxLines: 180,
};

/**
 * Purpose: Create the standard HUD inspector windows used by shared graph and network scenes and return convenience setters for their content.
 * @param {object} hudSystem HUD system instance that owns runtime windows and line-setting helpers.
 * @param {object} [options={}] Optional window and content overrides.
 * @param {boolean} [options.hideChat=true] Whether the default chat window should be removed or cleared when the inspector is created.
 * @param {Array<unknown>} [options.helpLines=[]] Initial help lines rendered into the help window.
 * @param {object | null} [options.detailsWindow=null] Optional window config overrides for the DETAILS window.
 * @param {object | null} [options.selectionWindow=null] Optional window config overrides for the TARGET/selection window.
 * @param {object | null} [options.helpWindow=null] Optional window config overrides for the HELP window.
 * @returns {{ setHelp: (lines: unknown) => void, setHoverLines: (lines: unknown) => void, setSelectionLines: (lines: unknown) => void }} Helper methods for updating inspector help, hover, and selection content.
 * Side effects: may destroy or clear the chat window, may create runtime windows on the HUD system, and writes initial help lines into the HUD state.
 */
export function createNetworkInspectorHud(
  hudSystem,
  {
    hideChat = true,
    helpLines = [],
    detailsWindow = null,
    selectionWindow = null,
    helpWindow = null,
  } = {}
) {
  if (!hudSystem) throw new Error("createNetworkInspectorHud: hudSystem required");

  if (hideChat) {
    try {
      if (typeof hudSystem.destroyWindow === "function") hudSystem.destroyWindow("chat");
      else hudSystem.setWindowLines?.("chat", [], { scrollMode: "top" });
    } catch {
      // no-op
    }
  }

  const hasCreate = typeof hudSystem.createWindow === "function";

  if (hasCreate) {
    hudSystem.createWindow("details", { ...DETAILS_WINDOW, ...(detailsWindow || {}) });
    hudSystem.createWindow("selection", { ...SELECTION_WINDOW, ...(selectionWindow || {}) });
    hudSystem.createWindow("help", { ...HELP_WINDOW, ...(helpWindow || {}) });
  }

  function setHelp(lines) {
    try {
      hudSystem.setWindowLines("help", Array.isArray(lines) ? lines : [lines], { scrollMode: "top" });
    } catch {
      // no-op
    }
  }

  function setHoverLines(lines) {
    try {
      hudSystem.setWindowLines("details", Array.isArray(lines) ? lines : [lines], { scrollMode: "top" });
    } catch {
      // no-op
    }
  }

  function setSelectionLines(lines) {
    const selectionKey = hudSystem.hud?.ui?.windows?.selection ? "selection" : "target";
    try {
      hudSystem.setWindowLines(selectionKey, Array.isArray(lines) ? lines : [lines], { scrollMode: "top" });
    } catch {
      // no-op
    }
  }

  setHelp(helpLines);

  return {
    setHelp,
    setHoverLines,
    setSelectionLines,
  };
}
