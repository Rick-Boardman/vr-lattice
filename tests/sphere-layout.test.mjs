import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { projectPlanarGraphPositionsToSphere, resolveSphereLayoutRadius } from "../src/graph/card-graph-scene.js";

// Insight's demo flowchart on its flat (xy) board: two tall columns.
const insightDemo = {
  Start: [9.2, 6.3, 2.3], Capture: [9.2, 1, 3.2], Route: [9.2, -11.8, 2.5], Worker: [9.2, -17.1, 2.7],
  SignOff: [-9.2, 14.2, 2.6], Done: [-9.2, 8.9, 3.2],
};
const cardWidth = 6;

function project(spans) {
  const positions = new Map(Object.entries(insightDemo).map(([id, [x, y]]) => [id, new THREE.Vector3(x, y, 0)]));
  return {
    positions,
    sphere: projectPlanarGraphPositionsToSphere({ THREE, positions, center: new THREE.Vector3(0, 0, 0), radius: 16, flatPlane: "xy", forward: new THREE.Vector3(0, 0, -1), ...spans }),
  };
}

/** Angular box of a card seen from the centre, in radians. */
function angularBox(p, w, h) {
  const r = p.length();
  const yaw = Math.atan2(p.x, -p.z);
  const pitch = Math.asin(p.y / r);
  const halfW = w / 2 / (r * Math.cos(pitch));
  const halfH = h / 2 / r;
  return { y0: yaw - halfW, y1: yaw + halfW, p0: pitch - halfH, p1: pitch + halfH };
}

test("cards that are apart on the flat board stay apart around the viewer", () => {
  for (const pitchSpan of [Math.PI * 0.18, Math.PI * 0.34]) {
    const { sphere } = project({ yawSpan: Math.PI * 0.48, pitchSpan });
    const boxes = Object.entries(insightDemo).map(([id, [, , h]]) => [id, angularBox(sphere.get(id), cardWidth, h)]);
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const [ia, A] = boxes[a];
        const [ib, B] = boxes[b];
        const overlap = Math.min(A.y1, B.y1) > Math.max(A.y0, B.y0) && Math.min(A.p1, B.p1) > Math.max(A.p0, B.p0);
        assert.equal(overlap, false, `${ia} and ${ib} overlap at pitch span ${pitchSpan.toFixed(2)}`);
      }
    }
  }
});

test("the board keeps its proportions: equal flat distances are equal arcs", () => {
  const { sphere } = project({ yawSpan: Math.PI * 0.48, pitchSpan: Math.PI * 0.34 });
  const r = sphere.get("Start").length();
  const pitch = (id) => Math.asin(sphere.get(id).y / r);
  const yaw = (id) => Math.atan2(sphere.get(id).x, -sphere.get(id).z);
  const rise = (a, b) => (pitch(a) - pitch(b)) * r;
  assert.ok(Math.abs(rise("Start", "Capture") - 5.3) < 1e-6, `vertical arc ${rise("Start", "Capture")}`);
  assert.ok(Math.abs(rise("SignOff", "Done") - 5.3) < 1e-6, `vertical arc ${rise("SignOff", "Done")}`);
  // Along a row the arc is the flat width at that row's own circle.
  const rowArc = (id) => Math.abs(yaw(id)) * r * Math.cos(pitch(id));
  for (const id of ["Start", "Worker", "SignOff"]) assert.ok(Math.abs(rowArc(id) - 9.2) < 1e-6, `${id} row arc ${rowArc(id)}`);
});

test("a small graph sits at the requested radius; a large one moves out to fit the spans", () => {
  const small = { minHorizontal: -4, maxHorizontal: 4, minVertical: -2, maxVertical: 2 };
  assert.equal(resolveSphereLayoutRadius({ bounds: small, radius: 16, yawSpan: Math.PI * 0.48, pitchSpan: Math.PI * 0.34 }), 16);
  const tall = { minHorizontal: -9.2, maxHorizontal: 9.2, minVertical: -17.1, maxVertical: 14.2 };
  const r = resolveSphereLayoutRadius({ bounds: tall, radius: 16, yawSpan: Math.PI * 0.48, pitchSpan: Math.PI * 0.34 });
  assert.ok(r > 16 && Math.abs(31.3 / r - Math.PI * 0.34) < 1e-6, `tall graph radius ${r}`);
  const { sphere } = project({ yawSpan: Math.PI * 0.48, pitchSpan: Math.PI * 0.34 });
  for (const p of sphere.values()) assert.ok(Math.abs(p.length() - r) < 1e-6, "every card at the layout radius");
});

test("the graph is centred in front of the viewer and above stays above", () => {
  const { sphere } = project({ yawSpan: Math.PI * 0.48, pitchSpan: Math.PI * 0.34 });
  assert.ok(sphere.get("SignOff").y > sphere.get("Worker").y, "the flat board's top is the sphere's top");
  assert.ok(sphere.get("Start").x > 0 && sphere.get("SignOff").x < 0, "right column right, left column left");
  for (const p of sphere.values()) assert.ok(p.z < 0, "in front");
});

test("a board lying on the ground keeps its near edge at the bottom", () => {
  const positions = new Map([["far", new THREE.Vector3(0, 0, -5)], ["near", new THREE.Vector3(0, 0, 5)]]);
  const sphere = projectPlanarGraphPositionsToSphere({ THREE, positions, center: new THREE.Vector3(), radius: 16, flatPlane: "xz", forward: new THREE.Vector3(0, 0, -1), yawSpan: Math.PI * 0.48, pitchSpan: Math.PI * 0.34 });
  assert.ok(sphere.get("far").y > sphere.get("near").y);
});

test("the sphere basis is the viewer's own right, up and forward", async () => {
  const { createCardGraphScene } = await import("../src/graph/card-graph-scene.js");
  assert.equal(typeof createCardGraphScene, "function");
  const positions = new Map([["left", new THREE.Vector3(-5, 0, 0)], ["right", new THREE.Vector3(5, 0, 0)]]);
  for (const forward of [new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0)]) {
    const sphere = projectPlanarGraphPositionsToSphere({ THREE, positions, center: new THREE.Vector3(), radius: 16, flatPlane: "xy", forward, yawSpan: Math.PI * 0.48, pitchSpan: Math.PI * 0.34 });
    // Seen facing `forward` with +y up, the board's right card is on the viewer's right.
    const viewerRight = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
    assert.ok(sphere.get("right").dot(viewerRight) > sphere.get("left").dot(viewerRight), `facing ${forward.toArray()}`);
  }
});

test("sphere-view checks count overlaps and orientation from angular boxes", async () => {
  const { cardOverlaps, orientationAgreement } = await import("../testing/sphere-view.mjs");
  const boxes = {
    a: { y0: -10, y1: -4, p0: 2, p1: 6, yaw: -7, pitch: 4 },
    b: { y0: 4, y1: 10, p0: 2, p1: 6, yaw: 7, pitch: 4 },
    c: { y0: 6, y1: 12, p0: 4, p1: 8, yaw: 9, pitch: 6 },
  };
  assert.deepEqual(cardOverlaps(boxes), ["b/c 4.0x2.0deg"]);
  const flat = [{ id: "a", x: 100, y: 300 }, { id: "b", x: 500, y: 300 }, { id: "c", x: 600, y: 200 }];
  assert.deepEqual(orientationAgreement(flat, boxes), { leftRight: { kept: 3, flipped: 0 }, upDown: { kept: 2, flipped: 0 } });
});

test("the scene reports the viewer's right in its sphere basis", async () => {
  const { createCardGraphScene } = await import("../src/graph/card-graph-scene.js");
  const scene = new THREE.Scene();
  const controller = createCardGraphScene({ THREE, parent: scene, graph: { nodes: [], edges: [] }, positions: new Map(), sphere: { forward: new THREE.Vector3(0, 0, -1) } });
  const basis = controller.getSphereBasis();
  assert.ok(basis.right.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-6, `right ${basis.right.toArray()}`);
  controller.dispose();
});
