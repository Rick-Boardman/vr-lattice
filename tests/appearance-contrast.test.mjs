import assert from "node:assert/strict";
import test from "node:test";
import { graphContrastColor, graphContrastRatio } from "../src/graph/appearance-contrast.js";
import { graphPanelTheme } from "../src/graph/panel-theme.js";

test("blue, green and gold graph edges remain distinct at accessible composited contrast", () => {
  const colors = [0x8aa4c6, 0x72c889, 0xe2bd57];
  for (const mode of ["light", "dark"]) {
    const world = graphPanelTheme(mode).background;
    const resolved = colors.map(color => graphContrastColor(color, world, 3.8, 0.92));
    assert.equal(new Set(resolved).size, colors.length);
    for (const color of resolved) assert(graphContrastRatio(color, world, 0.92) >= 3.8);
  }
});

test("pills retain a tinted fill and strong text contrast; opaque white markers darken for Light", () => {
  const label = 0xf7fbff;
  const fill = graphContrastColor(0x72c889, label, 7, 1, "darker");
  assert.notEqual(fill, 0);
  assert(graphContrastRatio(label, fill) >= 7);
  const bg = graphPanelTheme("light").background;
  const port = graphContrastColor(0xffffff, bg, 4, 1, "darker");
  assert.notEqual(port, 0xffffff);
  assert(graphContrastRatio(port, bg) >= 4);
  assert.equal(graphContrastColor(0xffffff, 0x192636, 4, 1, "lighter"), 0xffffff);
});
