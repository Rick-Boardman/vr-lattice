import assert from "node:assert/strict";
import test from "node:test";
import { BUSINESS_BOARD_SCENE_ACCESSORS, BUSINESS_HOTBAR_SLOT_COLORS, resolveBusinessHotbarStatusColor } from "../src/graph/business-board.js";
import { BUSINESS_ICON_PATHS, createBusinessIconTextures } from "../src/graph/business-icons.js";

test("a board has no connector points and one kind of edge", () => {
  assert.deepEqual(BUSINESS_BOARD_SCENE_ACCESSORS.getInputPorts({ inputPorts: [{ key: "a" }] }), []);
  assert.deepEqual(BUSINESS_BOARD_SCENE_ACCESSORS.getOutputPorts({ outputPorts: [{ key: "a" }] }), []);
  assert.equal(BUSINESS_BOARD_SCENE_ACCESSORS.getEdgeClass({ fromPort: "a", toPort: "b" }), "action");
});

test("every toolbar group shares the neutral colours; only Stop differs", () => {
  const { primary, execution, utility, rotation, mode, danger } = BUSINESS_HOTBAR_SLOT_COLORS;
  for (const group of [execution, utility, rotation, mode]) assert.equal(group, primary);
  assert.notEqual(danger.activeBgColor, primary.activeBgColor);
  assert.equal(danger.bgColor, primary.bgColor);
});

test("the status badge follows the document state", () => {
  assert.notEqual(resolveBusinessHotbarStatusColor({ running: true }), resolveBusinessHotbarStatusColor({ dirty: true }));
  assert.notEqual(resolveBusinessHotbarStatusColor({ dirty: true }), resolveBusinessHotbarStatusColor());
});

test("every icon is at least one path and every path starts with a move", () => {
  for (const [name, paths] of Object.entries(BUSINESS_ICON_PATHS)) {
    assert.ok(paths.length > 0, name);
    for (const path of paths) assert.match(path, /^M[-\d.]/, name);
  }
});

test("outside a browser the icon textures are empty, not an error", () => {
  const textures = createBusinessIconTextures({ CanvasTexture: class {} });
  assert.equal(textures.run, null);
});
