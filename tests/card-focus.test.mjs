import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

// A canvas that draws nothing: enough for the card scene to build its meshes outside a browser.
const ctx = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === "measureText" ? () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
    : k === "createLinearGradient" || k === "createRadialGradient" ? () => ({ addColorStop() {} }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});

test("a focused card comes toward the sphere's center along its own direction and stays there", async (t) => {
  const had = "document" in globalThis, saved = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) };
  t.after(() => { if (had) globalThis.document = saved; else delete globalThis.document; });
  const { createCardGraphScene } = await import("../src/graph/card-graph-scene.js");
  const scene = new THREE.Scene();
  const center = new THREE.Vector3(0, 1.6, 0);
  const controller = createCardGraphScene({
    THREE, parent: scene,
    graph: { nodes: [{ id: "a", title: "A" }, { id: "b", title: "B" }], edges: [{ id: "ab", from: "a", to: "b", fromId: "a", toId: "b" }] },
    positions: new Map([["a", new THREE.Vector3(-6, 0, 0)], ["b", new THREE.Vector3(6, 0, 0)]]),
    sphere: { center, radius: 16, forward: new THREE.Vector3(0, 0, -1) },
  });
  controller.setLayoutMode("sphere");
  const card = controller.getNodeMeshById("a").parent;
  let root = card; while (root && !String(root.name).startsWith("card-node:")) root = root.parent;
  const onSphere = root.position.clone();
  const radius = onSphere.distanceTo(center);
  assert.ok(radius > 10, `card on the sphere ${radius}`);

  controller.setNodeFocus("a", { distance: 3.2, scale: 0.3 });
  assert.ok(Math.abs(root.position.distanceTo(center) - 3.2) < 1e-6);
  const was = onSphere.clone().sub(center).normalize(), now = root.position.clone().sub(center).normalize();
  assert.ok(was.dot(now) > 0.999999, "same direction from the viewer");
  assert.equal(root.scale.x, 0.3);
  assert.deepEqual(controller.getNodeFocus("a"), { distance: 3.2, scale: 0.3 });
  const body = controller.getNodeMeshById("a");
  assert.equal(body.material.depthWrite, true, "a focused card writes depth so panels behind it stay hidden");
  controller.setSelectedIds(["a"]);
  assert.equal(body.material.depthWrite, true, "selected too");

  // A drag moves it around the sphere and it keeps its distance; an update does not put it back.
  controller.translateFlatPositions(["a"], new THREE.Vector3(1, 0, 0));
  controller.update();
  assert.ok(Math.abs(root.position.distanceTo(center) - 3.2) < 1e-6);

  // The flat layout ignores it; the sphere layout brings it back.
  controller.setLayoutMode("flat");
  assert.equal(root.scale.x, 1);
  assert.ok(root.position.distanceTo(controller.getNodeFlatPosition("a")) < 1e-6, "back on the flat board");
  controller.setLayoutMode("sphere");
  assert.ok(Math.abs(root.position.distanceTo(center) - 3.2) < 1e-6);

  controller.setSelectedIds([]);
  controller.setNodeFocus("a", null);
  assert.ok(Math.abs(root.position.distanceTo(center) - radius) < 0.5);
  assert.equal(root.scale.x, 1);
  assert.equal(controller.getNodeFocus("a"), null);

  assert.throws(() => controller.setNodeFocus("missing", { distance: 3 }), /no card/);
  assert.throws(() => controller.setNodeFocus("a", { distance: 0 }), /positive distance/);
  controller.dispose();
});
