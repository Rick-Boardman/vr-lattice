import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { graphPanelTheme } from "../src/graph/panel-theme.js";
import { createNetworkPulseEffect } from "../src/network-pulse.js";

test("light pulses use ink; dark pulses retain the existing additive glow", () => {
  const color = 0x66e5ff;
  const parent = new THREE.Group();
  const effect = createNetworkPulseEffect({ THREE, parent, color, maxPulses: 1 });
  try {
    const { material } = effect.group.children[0];
    const dark = material.color.clone();
    assert.equal(material.blending, THREE.AdditiveBlending);
    assert.equal(material.opacity, 0.9);
    effect.setTheme(graphPanelTheme("light")?.key);
    assert.equal(material.blending, THREE.NormalBlending);
    assert.ok(material.color.equals(dark.clone().multiplyScalar(0.18)));
    assert.equal(material.opacity, 0.9);
    for (const theme of ["dark", null]) {
      effect.setTheme(graphPanelTheme("light")?.key);
      effect.setTheme(graphPanelTheme(theme)?.key);
      assert.equal(material.blending, THREE.AdditiveBlending);
      assert.ok(material.color.equals(dark));
    }
  } finally { effect.dispose(); }
});
