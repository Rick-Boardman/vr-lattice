import assert from "node:assert/strict";
import test from "node:test";
import { resolveNodeSurfaceReach as reach } from "../src/graph/node-surface.js";

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} is not ${expected}`);

test("a card is left through its nearest side", () => {
  near(reach("card", 3, 1, 1, 0), 3);
  near(reach("card", 3, 1, 0, -1), 1);
  const u = Math.SQRT1_2;
  near(reach("card", 3, 1, u, u), 1 / u);
});

test("a pill is an ellipse", () => {
  near(reach("pill", 4, 2, -1, 0), 4);
  near(reach("pill", 4, 2, 0, 1), 2);
  const u = Math.SQRT1_2;
  const r = reach("pill", 4, 2, u, u);
  near((r * u / 4) ** 2 + (r * u / 2) ** 2, 1);
});

test("a diamond is met on its slanted sides", () => {
  near(reach("diamond", 2, 2, 1, 0), 2);
  const u = Math.SQRT1_2;
  near(reach("diamond", 2, 2, u, u), 2 * u);
});

test("a hexagon has flat sides and a point at the top", () => {
  const side = 2 * Math.cos(Math.PI / 6);
  near(reach("hexagon", 2, 2, 1, 0), side);
  near(reach("hexagon", 2, 2, 0, 1), 2);
});
