import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { resolveGraphSceneEditTarget, selectPreferredGraphHit } from "../src/graph/picking.js";

const node = { id: "task" };
const graphHit = { kind: "node", id: "task", node };
const card = { userData: { graphHit, graphEditRegion: { shape: "card", bodyThreshold: 0.72 } } };

test("direct edit uses the rendered card header, even with empty body or changed scene orientation", () => {
  assert.deepEqual(resolveGraphSceneEditTarget([{ object: card, uv: { y: 0.9 } }]),
    { kind: "node", id: "task", node, field: "title" });
  assert.deepEqual(resolveGraphSceneEditTarget([{ object: card, uv: { y: 0.32 } }]),
    { kind: "node", id: "task", node, field: "body" });
  const shape = { userData: { graphHit, graphEditRegion: { shape: "diamond", bodyThreshold: null } } };
  assert.equal(resolveGraphSceneEditTarget([{ object: shape, uv: { y: 0.3 } }]).field, "title");
});

test("ordinary selection, controls, topmost card and hidden edit surfaces keep their precedence", () => {
  const edge = { fromId: "task", toId: "next", label: "Approved" };
  const labelTarget = { kind: "edge", edge, field: "label" };
  const caption = { object: { userData: { graphEditTarget: labelTarget } } };
  const port = { kind: "port", id: "task" };
  assert.equal(selectPreferredGraphHit([caption]), null);
  assert.equal(resolveGraphSceneEditTarget([caption]), labelTarget);
  assert.equal(resolveGraphSceneEditTarget([caption, { object: card, uv: { y: 0.1 } }], port), null);
  assert.equal(resolveGraphSceneEditTarget([caption, { object: card, uv: { y: 0.1 } }]).field, "body");
  assert.equal(resolveGraphSceneEditTarget([{ object: { ...caption.object, parent: { visible: false } } }]), null);
});

test("a rotated or curved-world card still resolves the same physical header and body", () => {
  const group = new THREE.Group();
  group.rotation.set(0.3, 0.8, -0.25);
  group.position.set(4, -5, 2);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(8, 4));
  plane.userData = card.userData;
  group.add(plane);
  group.updateMatrixWorld(true);
  for (const [y, field] of [[1.5, "title"], [-0.8, "body"]]) {
    const source = plane.localToWorld(new THREE.Vector3(0, y, 8));
    const point = plane.localToWorld(new THREE.Vector3(0, y, 0));
    const ray = new THREE.Raycaster(source, point.sub(source).normalize());
    assert.equal(resolveGraphSceneEditTarget(ray.intersectObject(plane)).field, field);
  }
});
