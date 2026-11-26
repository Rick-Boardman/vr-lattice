import test from "node:test";
import assert from "node:assert/strict";
import { applyStandardGraphHudLayout, relayoutStandardGraphHud } from "../src/graph/hud-layout.js";

function hud(W, H = 900) {
  const win = (x, y, w, h) => ({ x, y, w, h, minW: 320, minH: 40 });
  const windows = { xr: { x: 0, y: -2000, w: 240, h: 64 }, selection: win(16, 16, 520, 360), chat: win(16, 16, 420, 270), debug: win(16, 16, 420, 300), hotbar: win(16, 828, 398, 56) };
  const cleared = [];
  return { windows, cleared, hudSystem: { hud: { layoutW: W, layoutH: H, ui: { windows, data: {} } }, getPreferredHotbarWindowSize: () => ({ w: 398, h: 56, minW: 300, minH: 56 }), setWindowLines: key => cleared.push(key) } };
}
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + (b.collapsed ? 28 : b.h) && b.y < a.y + (a.collapsed ? 28 : a.h);

test("on a phone the graph HUD bars stack inside the viewer without overlapping", () => {
  const { windows, hudSystem } = hud(430);
  applyStandardGraphHudLayout(hudSystem);
  const bars = [windows.chat, windows.debug, windows.selection];
  for (const bar of bars) assert.ok(bar.x >= 16 && bar.x + bar.w <= 414, `inside the 430px viewer: ${bar.x}+${bar.w}`);
  for (let i = 0; i < bars.length; i++) for (let j = i + 1; j < bars.length; j++) assert.ok(!overlaps(bars[i], bars[j]), `bars ${i} and ${j} do not overlap`);
  assert.ok(windows.selection.y + windows.selection.h <= windows.hotbar.y, "TARGET opens above the hotbar");
});

test("a relayout after a resize keeps the log and what the person opened", () => {
  const { windows, hudSystem, cleared } = hud(1400);
  applyStandardGraphHudLayout(hudSystem);
  assert.deepEqual(cleared, ["chat"], "the first layout starts the log blank");
  windows.selection.collapsed = false;
  hudSystem.hud.layoutW = 430;
  assert.equal(relayoutStandardGraphHud(hudSystem), true);
  assert.deepEqual(cleared, ["chat"], "the log is not cleared again");
  assert.equal(windows.selection.collapsed, false, "TARGET stays open");
  assert.ok(windows.selection.x + windows.selection.w <= 414);
  assert.equal(hudSystem.hud.ui._layoutByHalo, false, "the layout is the graph scene's, not Halo's default");
});

test("a window the person dragged is left where they put it", () => {
  const { windows, hudSystem } = hud(1400);
  applyStandardGraphHudLayout(hudSystem);
  Object.assign(windows.debug, { x: 600, y: 400, userPlaced: true });
  hudSystem.hud.layoutW = 1200;
  assert.equal(relayoutStandardGraphHud(hudSystem), false);
  assert.deepEqual([windows.debug.x, windows.debug.y], [600, 400]);
});
