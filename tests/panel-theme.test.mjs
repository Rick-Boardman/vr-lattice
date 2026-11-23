import assert from "node:assert/strict";
import test from "node:test";
import { GRAPH_PANEL_THEMES, graphPanelTheme, installGraphPanelTheme } from "../src/graph/panel-theme.js";

test("opt-in modes update existing chrome and keep window state, custom values and skins", () => {
  const base = { key: "professional", titleBarColor: 0x222222, panelBgColor: 0x222222 };
  const ordinary = { ...base, x: 20, y: 40, w: 200, h: 120, scrollTop: 7, collapsed: true };
  const custom = { ...base, titleBarColor: 0xff9988 };
  const textured = { ...base };
  const ui = { theme: base, windows: { ordinary, custom, textured }, order: ["custom", "ordinary", "textured"] };
  const hud = { hud: { ui, objects: { windows: { textured: { nineSlice: [{}] } } } },
    createWindow(key, options) { return ui.windows[key] = { ...base, ...options }; } };
  const originalCreate = hud.createWindow;
  const controller = installGraphPanelTheme(hud);
  assert.equal(controller.mode, null);
  assert.equal(ui.theme, base);
  const heard = [];
  controller.subscribe(({key}) => heard.push(key));
  controller.setTheme("light");
  const late = hud.createWindow("late", { titleTextColor: 0x123456 });
  const untouched = hud.createWindow("untouched", { panelTheme: false });
  controller.setTheme("dark");
  assert.deepEqual(heard, ["light", "dark"]);
  assert.deepEqual([ordinary.x, ordinary.y, ordinary.w, ordinary.h, ordinary.scrollTop, ordinary.collapsed],
    [20, 40, 200, 120, 7, true]);
  assert.deepEqual(ui.order, ["custom", "ordinary", "textured"]);
  assert.equal(ordinary.titleBarColor, GRAPH_PANEL_THEMES.dark.titleBarColor);
  assert.equal(late.titleTextColor, 0x123456);
  assert.equal(custom.titleBarColor, 0xff9988);
  assert.equal(textured.titleBarColor, base.titleBarColor);
  assert.equal(untouched.titleBarColor, base.titleBarColor);
  assert.equal(graphPanelTheme("professional"), null);
  controller.dispose();
  assert.equal(hud.createWindow, originalCreate);
});

test("Lattice negotiates full light bodies only with compatible Halo and respects custom content", () => {
  const build = (supportsAppearance) => {
    const ui = {theme:{},windows:{}};
    const hud = {hud:{ui},createWindow(key, options){ return ui.windows[key] = {...options}; }};
    if (supportsAppearance) hud.setWindowAppearanceTokens = (key, tokens) => { ui.windows[key].tokens = tokens; };
    return hud;
  };
  const halo = build(true), legacy = build(false);
  const modernThemes = installGraphPanelTheme(halo,"light");
  installGraphPanelTheme(legacy,"light");
  const modern = halo.createWindow("normal");
  const custom = halo.createWindow("custom",{contentBgColor:0xffeeee});
  assert.equal(modern.contentBgColor,0xf8fafc);
  assert.equal(modern.tokens.text,0x22354a);
  assert.equal(custom.contentBgColor,0xffeeee);
  assert.equal(custom.tokens,null);
  assert.equal(legacy.createWindow("normal").contentBgColor,0x293a50);
  modernThemes.setTheme("dark");
  assert.equal(modern.tokens.text,0xe9f0f9);
});

test("native chrome separates active controls, track and thumb from adjacent surfaces", () => {
  const luminance = rgb => {
    const linear = x => (x /= 255) <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    return 0.2126 * linear((rgb >> 16) & 255) + 0.7152 * linear((rgb >> 8) & 255) + 0.0722 * linear(rgb & 255);
  };
  const ratio = (a,b) => {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x,y) + 0.05) / (Math.min(x,y) + 0.05);
  };
  for (const theme of Object.values(GRAPH_PANEL_THEMES)) {
    const t = theme.contentTokens, c = t.controlChrome;
    assert(ratio(c.normal.ink,c.normal.fill) >= 4.5);
    assert(ratio(c.normal.border,theme.titleBarColor) >= 3);
    assert(ratio(c.hover.ink,c.hover.fill) >= 4.5);
    assert(ratio(t.thumb,t.track) >= 3);
    assert.notEqual(c.normal.ink,c.disabled.ink);
  }
});
