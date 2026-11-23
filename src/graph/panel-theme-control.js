// SPDX-License-Identifier: Apache-2.0

const WINDOW_KEY = "lattice-panel-appearance";
const installed = new WeakMap();

function isMode(value) {
  return value === "light" || value === "dark";
}

/** Resolve a host override, stored preference, or system mode without writing state. */
export function resolveGraphPanelTheme({ storageKey = "lattice:panel-theme", initialMode, platform = globalThis } = {}) {
  if (isMode(initialMode)) return initialMode;
  let saved;
  try { saved = platform.localStorage?.getItem(storageKey); } catch { /* private embed */ }
  if (isMode(saved)) return saved;
  return platform.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
}

/**
 * Add a Halo-native, desktop and XR accessible appearance selector to a graph scene.
 * An explicit host mode takes precedence on startup. Otherwise restore the user's
 * choice or follow their system appearance until they choose Light or Dark.
 */
export function installGraphPanelThemeControl(ctx, {
  storageKey = "lattice:panel-theme",
  initialMode,
  windowKey = WINDOW_KEY,
  x = 12,
  y = 72,
  platform = globalThis,
} = {}) {
  const hud = ctx?.hudSystem;
  if (typeof ctx?.setPanelTheme !== "function" ||
      typeof hud?.createWindow !== "function" ||
      typeof hud?.setWindowLines !== "function") return null;
  if (installed.has(ctx)) return installed.get(ctx);

  let saved;
  try { saved = platform.localStorage?.getItem(storageKey); } catch { /* private embed */ }
  const system = platform.matchMedia?.("(prefers-color-scheme: light)");
  let explicit = isMode(initialMode) || isMode(saved);
  let current = isMode(initialMode) ? initialMode : isMode(saved) ? saved : system?.matches ? "light" : "dark";
  let disposed = false;

  hud.createWindow(windowKey, {
    title: "APPEARANCE",
    x, y, w: 236, h: 112,
    closeable: false,
    resizable: false,
    scrollable: false,
  });

  function render() {
    hud.setWindowLines(windowKey, ["light", "dark"].map(mode => {
      const label = mode === "light" ? "Light" : "Dark";
      return {
        text: label,
        actionButtonText: current === mode ? "Active" : "Use",
        actionButtonWidthPx: 80,
        actionButtonTextColor: 0xf4f8ff,
        actionButtonBgColor: current === mode ? 0x3c5269 : 0x245e96,
        actionButtonBgOpacity: 1,
        actionButtonHoverText: `Use ${label.toLowerCase()} panels`,
        actionButtonOnClick: () => setTheme(mode, { persist: true }),
      };
    }));
  }

  function setTheme(mode, { persist = false } = {}) {
    if (disposed || !isMode(mode)) return false;
    if (persist) {
      explicit = true;
      try { platform.localStorage?.setItem(storageKey, mode); } catch { /* private embed */ }
    }
    current = mode;
    ctx.setPanelTheme(mode);
    render();
    return true;
  }

  function onSystemChange(event) {
    if (!explicit) setTheme(event.matches ? "light" : "dark");
  }
  system?.addEventListener?.("change", onSystemChange);
  const control = {
    get mode() { return current; },
    setTheme,
    dispose() {
      if (disposed) return;
      disposed = true;
      system?.removeEventListener?.("change", onSystemChange);
      hud.destroyWindow?.(windowKey);
      installed.delete(ctx);
    },
  };
  installed.set(ctx, control);
  setTheme(current);
  return control;
}
