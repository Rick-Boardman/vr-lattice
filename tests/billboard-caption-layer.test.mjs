// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { createBillboardTextLabel, makeLabelSpriteFactory } from "../src/graph/graph-mesh-builders.js";

class TestText extends THREE.Object3D {
  sync() {}
  dispose() {}
}

test("billboard captions retain fractional priority above selected edge strokes", () => {
  const caption = createBillboardTextLabel({ THREE, Text: TestText, text: "test" });
  try {
    caption.setRenderOrder(0.6);
    const { backgroundMesh, textMesh } = caption.userData;
    assert.equal(caption.renderOrder, 0.6);
    assert.equal(backgroundMesh.renderOrder, 0.6);
    assert.ok(backgroundMesh.renderOrder > 0.55);
    assert.equal(textMesh.renderOrder, 0.62);
    assert.equal(textMesh.userData.graphTroikaRenderOrder, 0.62);
    caption.setRenderOrder(0.8);
    assert.ok(textMesh.renderOrder > backgroundMesh.renderOrder);
  } finally {
    caption.dispose();
  }
});

test("opt-in universal network label is larger, bolder and overlays strokes", () => {
  const make = (legible) => makeLabelSpriteFactory({THREE, Text: TestText, legible})({text: "Named network node"});
  const legacy = make(false);
  const native = make(true);
  try {
    assert.ok(native.userData.textMesh.fontSize > legacy.userData.textMesh.fontSize);
    assert.equal(native.userData.textMesh.fontWeight, "bold");
    assert.ok(native.userData.backgroundMesh.renderOrder > 1);
    assert.ok(native.userData.textMesh.renderOrder > native.userData.backgroundMesh.renderOrder);
    assert.equal(legacy.userData.backgroundMesh.renderOrder, 0);
  } finally {
    native.dispose();
    legacy.dispose();
  }
});

test("native network label has a true inset outline, not a plate covering its fill", () => {
  const label = makeLabelSpriteFactory({ THREE, Text: TestText, legible: true })({ text: "Node" });
  try {
    const { backgroundMesh, borderMesh, textMesh } = label.userData;
    label.updateMatrixWorld(true);
    const rayAt = (x, y) => new THREE.Raycaster(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1));
    assert.ok(rayAt(0.1, 0.1).intersectObject(backgroundMesh).length);
    assert.equal(rayAt(0.1, 0.1).intersectObject(borderMesh).length, 0);
    assert.ok(rayAt(0.1, 0.96).intersectObject(borderMesh).length);
    assert.equal(rayAt(3.99, 0.99).intersectObject(backgroundMesh).length, 0);
    assert.ok(backgroundMesh.renderOrder < borderMesh.renderOrder && borderMesh.renderOrder < textMesh.renderOrder);
  } finally {
    label.dispose();
  }
});
