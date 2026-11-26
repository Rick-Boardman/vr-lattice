// SPDX-License-Identifier: Apache-2.0
/**
 * Browser-test checks for a Lattice card graph seen in a headset: where each card sits around the viewer, whether any
 * two cards overlap from there, and whether the headset keeps the desktop's left/right and up/down. Node side, for
 * Playwright; `runtime` is a page expression yielding the app's `{ scene, renderer, camera }`. Cards are the meshes
 * carrying `userData.id`.
 */

/**
 * Each card's angular box from the viewer (the headset camera while presenting, else the desktop camera), in degrees:
 * `{ [id]: { yaw, pitch, y0, y1, p0, p1 } }`, yaw growing to the viewer's right and pitch upwards.
 */
export function viewerCardBoxes(page, runtime) {
  return page.evaluate(async (expr) => {
    const { scene, renderer, camera } = (0, eval)(expr);
    const THREE = await import("three");
    const eye = renderer.xr?.isPresenting ? renderer.xr.getCamera() : camera;
    eye.updateMatrixWorld(true);
    const toEye = eye.matrixWorld.clone().invert();
    const deg = 180 / Math.PI;
    const boxes = {};
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (!o.isMesh || !o.visible || o.userData?.id == null || !o.geometry) return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      const angles = [];
      for (const x of [bb.min.x, bb.max.x]) {
        for (const y of [bb.min.y, bb.max.y]) {
          const p = o.localToWorld(new THREE.Vector3(x, y, (bb.min.z + bb.max.z) / 2)).applyMatrix4(toEye);
          angles.push([Math.atan2(p.x, -p.z) * deg, Math.atan2(p.y, Math.hypot(p.x, p.z)) * deg]);
        }
      }
      const id = String(o.userData.id);
      const next = { y0: Math.min(...angles.map((a) => a[0])), y1: Math.max(...angles.map((a) => a[0])), p0: Math.min(...angles.map((a) => a[1])), p1: Math.max(...angles.map((a) => a[1])) };
      const prev = boxes[id];
      boxes[id] = prev ? { y0: Math.min(prev.y0, next.y0), y1: Math.max(prev.y1, next.y1), p0: Math.min(prev.p0, next.p0), p1: Math.max(prev.p1, next.p1) } : next;
    });
    for (const box of Object.values(boxes)) {
      box.yaw = (box.y0 + box.y1) / 2;
      box.pitch = (box.p0 + box.p1) / 2;
    }
    return boxes;
  }, runtime);
}

/** Pairs of cards whose boxes overlap by more than `toleranceDeg` on both axes: `["a/b 3.1x1.2deg", ...]`. */
export function cardOverlaps(boxes, { toleranceDeg = 0.25 } = {}) {
  const ids = Object.keys(boxes);
  const out = [];
  for (let a = 0; a < ids.length; a++) {
    for (let b = a + 1; b < ids.length; b++) {
      const A = boxes[ids[a]];
      const B = boxes[ids[b]];
      const ox = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
      const oy = Math.min(A.p1, B.p1) - Math.max(A.p0, B.p0);
      if (ox > toleranceDeg && oy > toleranceDeg) out.push(`${ids[a]}/${ids[b]} ${ox.toFixed(1)}x${oy.toFixed(1)}deg`);
    }
  }
  return out;
}

/**
 * How many card pairs keep the desktop's order in the headset. `flatPoints` are desktop client points
 * `[{ id, x, y }]` (y down the screen); a pair counts when the cards are at least `minPx` apart on that axis.
 * Returns `{ leftRight: { kept, flipped }, upDown: { kept, flipped } }`.
 */
export function orientationAgreement(flatPoints, boxes, { minPx = 20 } = {}) {
  const result = { leftRight: { kept: 0, flipped: 0 }, upDown: { kept: 0, flipped: 0 } };
  const points = flatPoints.filter((p) => boxes[p.id] && Number.isFinite(p.x) && Number.isFinite(p.y));
  for (const a of points) {
    for (const b of points) {
      if (a.x < b.x - minPx) result.leftRight[boxes[a.id].yaw < boxes[b.id].yaw ? "kept" : "flipped"] += 1;
      if (a.y < b.y - minPx) result.upDown[boxes[a.id].pitch > boxes[b.id].pitch ? "kept" : "flipped"] += 1;
    }
  }
  return result;
}
