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
