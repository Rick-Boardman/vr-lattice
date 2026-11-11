import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { startAsyncBootLoop } from "../src/graph/boot.js";

test("async boot uses Three Timer frame deltas without deprecation warnings", async (t) => {
  t.mock.method(performance, "now", () => 1000);
  const warnings = t.mock.method(console, "warn", () => {});
  let frame;
  let builds = 0;
  let finishBuild;
  const building = new Promise(resolve => { finishBuild = resolve; });
  const scene = {}, camera = {};
  const rendered = [], hudDeltas = [], navigationDeltas = [], frameDeltas = [], fps = [];
  startAsyncBootLoop({
    THREE,
    renderer: {
      setAnimationLoop(callback) { frame = callback; },
      render(...args) { rendered.push(args); },
    },
    scene, camera,
    hudSystem: { update(dt) { hudDeltas.push(dt); } },
    navigation: { update(dt) { navigationDeltas.push(dt); } },
    build() { builds += 1; return building; },
    onFrame({ dt }) { frameDeltas.push(dt); },
    onFps(value) { fps.push(value); },
  });
  assert.equal(builds, 0);
  frame(1000);
  await Promise.resolve();
  assert.equal(builds, 1);
  frame(1250);
  frame(1500);
  assert.equal(rendered.length, 3, "frames render while the async build is pending");
  finishBuild();
  await building;
  frame(1750);
  frame(2000);
  assert.equal(builds, 1);
  assert.deepEqual(frameDeltas, [0, 0.25, 0.25, 0.25, 0.25]);
  assert.deepEqual(hudDeltas, frameDeltas);
  assert.deepEqual(navigationDeltas, frameDeltas);
  assert.deepEqual(rendered, Array.from({ length: 5 }, () => [scene, camera]));
  assert.deepEqual(fps, [6, 4]);
  assert.equal(warnings.mock.callCount(), 0);
});

test("async boot supports animation callbacks without timestamps", (t) => {
  let now = 1000;
  t.mock.method(performance, "now", () => now);
  let frame;
  const deltas = [];
  startAsyncBootLoop({
    THREE,
    renderer: {
      setAnimationLoop(callback) { frame = callback; },
      render() {},
    },
    scene: {}, camera: {}, build() {},
    onFrame({ dt }) { deltas.push(dt); },
  });
  frame();
  now = 1020;
  frame();
  assert.deepEqual(deltas, [0, 0.02]);
});
