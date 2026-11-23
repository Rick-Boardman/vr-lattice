// SPDX-License-Identifier: Apache-2.0

const controlChrome = (normal, hover, disabled, thumbHover) => Object.freeze({
  normal: Object.freeze(normal), hover: Object.freeze(hover), disabled: Object.freeze(disabled), thumbHover,
});
const lightChrome = controlChrome(
  { fill: 0xebf3fb, border: 0x52708b, ink: 0x1b3650 },
  { fill: 0xffffff, border: 0x315981, ink: 0x123659 },
  { fill: 0xdce5ef, border: 0x879bb0, ink: 0x657c94 },
  0x284f78,
);
const darkChrome = controlChrome(
  { fill: 0x233a52, border: 0x9ab2ce, ink: 0xeff7ff },
  { fill: 0x3e5c7c, border: 0xc3ddf7, ink: 0xffffff },
  { fill: 0x2a3e54, border: 0x5d7793, ink: 0x839db9 },
  0xc3dbf5,
);
const lightContent = Object.freeze({ surface: 0xf8fafc, text: 0x22354a, row: 0xf1f5f9, selectedRow: 0xd7e7f8,
  field: 0xffffff, fieldText: 0x0b2137, fieldBorder: 0x5e748a, focus: 0x1d5790,
  selection: 0xc0dcfa, selectionOpacity: 0.72, selectionText: 0x0b2137, caret: 0x0b2137,
  disabledField: 0xe8edf3, disabledText: 0x455c74, controlChrome: lightChrome, headerDivider: 0x607892, headerControl: 0x1c334c, headerControlHover: 0x08233f, hotbarTitle: 0x091d30, hotbarFill: 0x31475d, hotbarActive: 0x245e96, accent: 0x245e96, accentText: 0xffffff, track: 0xdbe5ef, thumb: 0x506d89 });
const darkContent = Object.freeze({ surface: 0x182536, text: 0xe9f0f9, row: 0x1c2a3d, selectedRow: 0x294b74,
  field: 0x23384d, fieldText: 0xf1f6fc, fieldBorder: 0x8aa3bd, focus: 0xa8d4ff,
  selection: 0x375b85, selectionOpacity: 0.76, selectionText: 0xffffff, caret: 0xffffff,
  disabledField: 0x26384a, disabledText: 0x9bb0c6, controlChrome: darkChrome, headerDivider: 0x849db8, headerControl: 0xc9ddf3, headerControlHover: 0xffffff, hotbarFill: 0x293e54, hotbarActive: 0x245e96, accent: 0x2a5e93, accentText: 0xffffff, track: 0x354b64, thumb: 0x9cb7d2 });

const common = { panelBgOpacity: 1, titleBarOpacity: 1, contentBgOpacity: 1,
  borderOpacity: 1, borderInset: 0, controlStyle: "quiet" };

export const GRAPH_PANEL_THEMES = Object.freeze({
  light: Object.freeze({ ...common, key: "light", panelBgColor: 0xc5d1df,
    titleBarColor: 0xc7d8ea, contentBgColor: 0xf8fafc, contentTokens: lightContent, titleTextColor: 0x1b304a,
    borderColor: 0x8499b2, accentColor: 0x245b98, background: 0xe7edf5,
    labelColor: 0x17283c, labelBackgroundColor: 0xf4f7fc, labelBorderColor: 0x59738f }),
  dark: Object.freeze({ ...common, key: "dark", panelBgColor: 0x111a26,
    titleBarColor: 0x344b65, contentBgColor: 0x182536, contentTokens: darkContent, titleTextColor: 0xe9f1fb,
    borderColor: 0x546c88, accentColor: 0x8dc4ff, background: 0x0a1320,
    labelColor: 0xe8f2ff, labelBackgroundColor: 0x101a29, labelBorderColor: 0x829bb7 }),
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
 * Older Halo builds keep a slate Light content fallback because their body text
 * and field palettes cannot be restyled safely.
 */
export function installGraphPanelTheme(hudSystem, initialMode) {
  const existing = installed.get(hudSystem);
  if (existing) {
    if (initialMode != null) existing.setTheme(initialMode);
    return existing;
  }
  const ui = hudSystem.hud.ui;
  const supportsContentTokens = typeof hudSystem.setWindowAppearanceTokens === "function";
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
      win[field] = painted[field] = field === "contentBgColor" && theme.key === "light" && !supportsContentTokens
        ? 0x293a50 : theme[field];
    }
    if (supportsContentTokens) {
      const ownsContent = win.contentBgColor === painted.contentBgColor;
      hudSystem.setWindowAppearanceTokens(key, ownsContent ? theme.contentTokens : null);
    }
    // Halo 0.3 stores the glyphs in bright textures; tint those meshes, not the hit targets.
    if (!win._hudSkinKey && win.titleBarColor === painted.titleBarColor) {
      for (const key of ["minBtn", "closeBtn", "actionBtn"]) {
        objs?.[key]?.material?.color?.setHex(theme.key === "light" ? 0x22364c : 0xffffff);
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
