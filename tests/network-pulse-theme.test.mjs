import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { graphPanelTheme } from "../src/graph/panel-theme.js";
import { createNetworkPulseEffect } from "../src/network-pulse.js";

test("pulse heads use contrasting ink in Light and restrained additive glow in Dark", () => {
  const color = 0x66e5ff;
  const parent = new THREE.Group();
  const effect = createNetworkPulseEffect({ THREE, parent, color, maxPulses: 1 });
  const { material } = effect.group.children[0];
  try {
    const { lightMode, pulseInk, pulseCore, pulseOpacity } = material.uniforms;
    const dark = new THREE.Color(color);
    assert.equal(material.blending, THREE.AdditiveBlending);
    assert.ok(pulseInk.value.equals(dark));
    assert.equal(lightMode.value, false);
    effect.setTheme(graphPanelTheme("light")?.key);
    assert.equal(material.blending, THREE.NormalBlending);
    assert.equal(lightMode.value, true);
    assert.ok(pulseInk.value.getHSL({}).l < pulseCore.value.getHSL({}).l);
    assert.ok(Math.abs(pulseInk.value.getHSL({}).h - dark.getHSL({}).h) < 0.001);
    assert.equal(pulseOpacity.value, 0.9);
    assert.equal(material.depthTest, true);
    assert.equal(material.depthWrite, false);
    for (const theme of ["dark", null]) {
      effect.setTheme(graphPanelTheme("light")?.key);
      effect.setTheme(graphPanelTheme(theme)?.key);
      assert.equal(material.blending, THREE.AdditiveBlending);
      assert.ok(pulseInk.value.equals(dark));
    }
  } finally { effect.dispose(); }
  assert.equal(parent.children.length, 0);
});

test("reusable pulse instances advance away from either active endpoint, never populate filtered or unpulseable edges", () => {
  const THREEGroup = new THREE.Group();
  const effect = createNetworkPulseEffect({ THREE, parent: THREEGroup, maxPulses: 2 });
  const { geometry } = effect.group.children[0];
  const nodes = new Map([["A", { position: new THREE.Vector3(0, 0, 0) }],
    ["B", { position: new THREE.Vector3(10, 0, 0) }], ["C", { position: new THREE.Vector3(0, 10, 0) }]]);
  const line = (fromId, toId, pulseable) => ({ userData: { edge: { fromId, toId }, pulseable } });
  const ab = line("A", "B", true);
  const ac = line("A", "C", false);
  const attribute = (key) => geometry.getAttribute(key);
  try {
    effect.rebuild([ac, ab]);
    effect.setActiveNode("A", 2);
    effect.update(2.25, nodes, [ac, ab], { speed: 1 });
    assert.equal(geometry.instanceCount, 2);
    assert.equal(attribute("pulseOrigin").getX(0), 2.5);
    assert.equal(attribute("pulseOrigin").getY(0), 0);
    assert.equal(attribute("pulseVector").getX(0), 10);
    assert.equal(attribute("pulseSize").getY(0), 0.25);
    effect.update(2.50, nodes, [ac, ab], { speed: 1 });
    assert.equal(attribute("pulseOrigin").getX(0), 5);
    effect.setActiveNode("B", 3);
    effect.update(3.25, nodes, [ac, ab], { speed: 1 });
    assert.equal(attribute("pulseOrigin").getX(0), 7.5);
    assert.equal(attribute("pulseVector").getX(0), -10);
    effect.rebuild([]);
    effect.update(3.5, nodes, []);
    assert.equal(geometry.instanceCount, 0);
    assert.equal(effect.group.children[0].visible, false);
  } finally { effect.dispose(); }
});
