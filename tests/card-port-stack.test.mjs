import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

// A canvas that draws nothing: enough for the card scene to build its meshes outside a browser.
const ctx = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === "measureText" ? () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
    : k === "createLinearGradient" || k === "createRadialGradient" ? () => ({ addColorStop() {} }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});

test("a raised card's port dots sort with the HUD's transparent pass, above its render order", async (t) => {
  const had = "document" in globalThis, saved = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) };
  t.after(() => { if (had) globalThis.document = saved; else delete globalThis.document; });
  const { createCardGraphScene } = await import("../src/graph/card-graph-scene.js");
  const scene = new THREE.Scene();
  const controller = createCardGraphScene({
    THREE, parent: scene,
    graph: { nodes: [{ id: "a", title: "A", inputPorts: [{ key: "in" }], outputPorts: [{ key: "out" }] }], edges: [] },
    positions: new Map([["a", new THREE.Vector3()]]),
  });
  const ports = [];
  scene.traverse((o) => { if (o.userData?.graphHit?.kind === "port") ports.push(o); });
  assert.equal(ports.length, 2);
  // three renders all opaque meshes before transparent ones; the HUD's panels are transparent.
  for (const port of ports) assert.equal(port.material.transparent, true);
  for (const port of ports) assert.equal(port.material.opacity, 1);
  controller.setRaisedNode("a", 10001, { groupOrder: 10000 });
  for (const port of ports) {
    assert.ok(port.renderOrder > 10001, `port render order ${port.renderOrder}`);
    assert.equal(port.material.depthTest, false);
  }
  controller.setRaisedNode(null, null);
  for (const port of ports) assert.equal(port.renderOrder, 3);
  controller.dispose();
});
