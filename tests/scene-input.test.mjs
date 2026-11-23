import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { collectGraphNodesInRect, createGraphMarqueeOverlay, raycastGraphTargets,
  readGraphControllerRay, resolveGraphRaySelection } from "../src/graph/scene-input.js";

test("host ray selection preserves target ordering, distance, and a detached point", () => {
  const graphHit = { id: "quote", kind: "node" };
  const p = new THREE.Vector3(1, 2, 3);
  const hits = [{ object: { userData: { graphHit } }, point: p, distance: 7 }];
  const sequence = [];
  const model = {
    actionHandleHitTargets: [1], portHitTargets: [2], nodeHitTargets: [3], edgeHitTargets: [4],
    root: { updateMatrixWorld(force) { sequence.push(force); } },
  };
  const raycast = { intersectObjects(list, recursive) {
    assert.equal(this.far, 42); assert.deepEqual(list, [1, 2, 3, 4]); assert.equal(recursive, false); return hits;
  } };
  assert.equal(raycastGraphTargets(model, raycast, () => sequence.push("ray"), { far: 42 }), hits);
  assert.deepEqual(sequence, [true, "ray"]);
  const result = resolveGraphRaySelection(hits, () => graphHit);
  assert.deepEqual(result, { id: "quote", graphHit, point: p, distance: 7 });
  assert.notEqual(result.point, p);
  assert.equal(resolveGraphRaySelection(hits, () => ({ kind: "edge" })), null);
});

test("scaled XR controller and inclusive projected marquee are independent of app mode", () => {
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(1, 2, 3), new THREE.Quaternion(),
    new THREE.Vector3(2, 3, 4));
  const origin = new THREE.Vector3(), direction = new THREE.Vector3();
  assert.equal(readGraphControllerRay({ matrixWorld: matrix }, origin, direction, new THREE.Matrix4()), true);
  assert.deepEqual(origin.toArray(), [1, 2, 3]);
  assert.deepEqual(direction.toArray(), [0, 0, -1]);
  assert.deepEqual(collectGraphNodesInRect({
    getNodeIds: () => ["left", "right", "missing"],
    getNodeMeshById: (id) => id === "missing" ? null : { getWorldPosition: p => p.set(id === "left" ? 0 : 11, 10, 0) },
  }, { left: 0, right: 10, top: 0, bottom: 10 }, new THREE.Vector3(), p => p), ["left"]);
  const camera = new THREE.PerspectiveCamera();
  const box = createGraphMarqueeOverlay(THREE, camera);
  box.show(new THREE.Vector3(0, 0, 1), new THREE.Vector3(3, 2, 1));
  assert.ok(box.line.visible);
  assert.equal(box.geometry.attributes.position.getX(2), 3);
  box.hide(); assert.equal(box.line.visible, false);
  box.dispose(); assert.equal(camera.children.length, 0);
});
