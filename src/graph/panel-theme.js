// SPDX-License-Identifier: Apache-2.0

const common = { panelBgOpacity: 1, titleBarOpacity: 1, contentBgOpacity: 1,
  borderOpacity: 1, borderInset: 0, controlStyle: "quiet" };

export const GRAPH_PANEL_THEMES = Object.freeze({
  light: Object.freeze({ ...common, key: "light", panelBgColor: 0xc5d1df,
    titleBarColor: 0xf3f6fb, contentBgColor: 0x293a50, titleTextColor: 0x1b304a,
    borderColor: 0x8499b2, accentColor: 0x245b98, background: 0xe7edf5,
    labelColor: 0x17283c, labelBackgroundColor: 0xf4f7fc }),
  dark: Object.freeze({ ...common, key: "dark", panelBgColor: 0x111a26,
    titleBarColor: 0x1c2b3e, contentBgColor: 0x182536, titleTextColor: 0xe9f1fb,
    borderColor: 0x546c88, accentColor: 0x8dc4ff, background: 0x0a1320,
    labelColor: 0xe8f2ff, labelBackgroundColor: 0x101a29 }),
});

const fields = ["panelBgColor", "panelBgOpacity", "titleBarColor", "titleBarOpacity",
  "contentBgColor", "contentBgOpacity", "borderColor", "borderOpacity", "borderInset", "titleTextColor"];
const installed = new WeakMap();

export function graphPanelTheme(mode) {
  return mode === "light" || mode === "dark" ? GRAPH_PANEL_THEMES[mode] : null;
}

/**
 * Apply Lattice's native HUD palette to an existing Halo system. Preserve geometry,
 * list state, explicit window colors and app textures. New windows inherit the mode.
 * Halo 0.3 emits bright body text (including literal app colors), so Light uses a
 * pale frame/title and a high-contrast slate content well, not a white text surface.
 */
export function installGraphPanelTheme(hudSystem, initialMode) {
  const existing = installed.get(hudSystem);
  if (existing) {
    if (initialMode != null) existing.setTheme(initialMode);
    return existing;
  }
  const ui = hudSystem.hud.ui;
  const base = ui.theme ?? {};
  const create = hudSystem.createWindow;
  const values = new WeakMap();
  const explicitFields = new WeakMap();
  const listeners = new Set();
  let current = null;
  const setWindowTheme = (key, win, theme, explicit = null) => {
    const objs = hudSystem.hud.objects?.windows?.[key];
    if (!win || win.panelTheme === false || objs?.nineSlice?.length || objs?._hudSkinTextures) return;
    let painted = values.get(win);
    if (!painted) values.set(win, painted = {});
    for (const field of fields) {
      const prior = painted[field];
      const hasPrior = Object.hasOwn(painted, field);
      if (explicitFields.get(win)?.has(field) || (hasPrior && win[field] !== prior)) continue;
      if (!explicit && !hasPrior && base[field] != null && win[field] != null && win[field] !== base[field]) continue;
      win[field] = painted[field] = theme[field];
    }
    // Halo 0.3 stores the glyphs in bright textures; tint those meshes, not the hit targets.
    if (!win._hudSkinKey && win.titleBarColor === painted.titleBarColor) {
      for (const key of ["minBtn", "closeBtn", "actionBtn"]) {
        objs?.[key]?.material?.color?.setHex(theme.key === "light" ? 0x30465e : 0xffffff);
      }
    }
    if (objs?.contentBg?.material && win.contentBgColor != null) {
      objs.contentBg.material.color?.setHex(win.contentBgColor);
      objs.contentBg.material.opacity = win.contentBgOpacity;
    }
  };
  const wrappedCreate = function (key, options = {}) {
    const win = create.call(this, key, options);
    if (!win) return win;
    if (options.panelTheme === false) win.panelTheme = false;
    explicitFields.set(win, new Set(fields.filter((field) => options[field] != null)));
    if (current) setWindowTheme(key, win, current, options);
    return win;
  };
  const controller = {
    get mode() { return current?.key ?? null; },
    setTheme(mode) {
      const theme = graphPanelTheme(mode);
      if (!theme) throw new RangeError("Expected a Lattice panel theme: light or dark");
      if (theme === current) return theme;
      for (const [key, win] of Object.entries(ui.windows ?? {})) {
        if (win) setWindowTheme(key, win, theme);
      }
      current = theme;
      ui.theme = theme;
      for (const notify of listeners) notify(theme);
      return theme;
    },
    subscribe(notify) {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    dispose() {
      if (hudSystem.createWindow === wrappedCreate) hudSystem.createWindow = create;
      listeners.clear();
      installed.delete(hudSystem);
    },
  };
  hudSystem.createWindow = wrappedCreate;
  installed.set(hudSystem, controller);
  if (initialMode != null) controller.setTheme(initialMode);
  return controller;
}
