// SPDX-License-Identifier: Apache-2.0
// Shared force layout utilities for network scenes.
// Goal: stable, allocation-light, XR-safe one-shot relaxation (not per-frame).

import { clamp, clampIndexedPointToSphereBoundary } from "@rb/halo/src/scalar-math.js";

/**
 * Relax a shared graph layout with one-shot spring, repulsion, collision, and centering forces.
 * Purpose: stabilize reusable network scene node positions in place without running a per-frame physics simulation.
 * @param {object} [options={}] Relaxation settings.
 * @param {Map<string, { x?: number, y?: number, z?: number }>} options.positions Mutable node-position map keyed by node id.
 * @param {Array<string>} options.nodeIds Ordered node ids that define the solver index space.
 * @param {Array<[number, number, number]>} [options.springs] Spring triples of `[fromIndex, toIndex, restLength]` in the `nodeIds` index space.
 * @param {{ x?: number, y?: number, z?: number }} [options.center={ x: 0, y: 0, z: 0 }] Center point that attracts nodes back toward the cluster anchor.
 * @param {number | null} [options.boundR=null] Optional spherical bound radius around `center`.
 * @param {number} [options.steps=160] Number of solver iterations to run.
 * @param {number} [options.dt=0.02] Integration time step applied to each force update.
 * @param {number} [options.damping=0.86] Velocity damping factor applied once per iteration.
 * @param {number} [options.kSpring=0.6] Spring stiffness multiplier.
 * @param {number} [options.kCenter=0.03] Centering-force multiplier.
 * @param {number} [options.kRepel=130] Inverse-square repulsion multiplier.
 * @param {number} [options.repelCutoff=70] Maximum distance at which pairwise repulsion is evaluated.
 * @param {Map<string, number> | null} [options.radiusById=null] Optional per-node collision radius lookup keyed by node id.
 * @param {number} [options.collisionPad=0] Extra padding added to each collision radius when `radiusById` is provided.
 * @param {number} [options.emergencyDist=3.2] Minimum distance enforced when nodes nearly overlap.
 * @param {number} [options.emergencyPush=240] Extra push force used for emergency separation.
 * @returns {Map<string, { x: number, y: number, z: number }>} The same `positions` map instance after in-place relaxation.
 * Side effects: mutates the provided `positions` map in place and allocates temporary typed arrays for solver state.
 */
export function relaxSpringRepelLayout({
  positions,
  nodeIds,
  springs,
  center = { x: 0, y: 0, z: 0 },
  boundR = null,
  steps = 160,
  dt = 0.02,
  damping = 0.86,
  kSpring = 0.6,
  kCenter = 0.03,
  kRepel = 130,
  repelCutoff = 70,
  radiusById = null,
  collisionPad = 0,
  emergencyDist = 3.2,
  emergencyPush = 240,
} = {}) {
  if (!(positions instanceof Map)) throw new Error("relaxSpringRepelLayout: positions Map required");
  if (!Array.isArray(nodeIds) || nodeIds.length === 0) return positions;

  const n = nodeIds.length;
  if (n <= 1) return positions;

  const idToIdx = new Map();
  for (let i = 0; i < n; i++) idToIdx.set(nodeIds[i], i);

  const px = new Float32Array(n);
  const py = new Float32Array(n);
  const pz = new Float32Array(n);
  const vx = new Float32Array(n);
  const vy = new Float32Array(n);
  const vz = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const p = positions.get(nodeIds[i]);
    px[i] = p?.x ?? 0;
    py[i] = p?.y ?? 0;
    pz[i] = p?.z ?? 0;
  }

  const hasRadii = radiusById instanceof Map;

  const cutoff2 = repelCutoff * repelCutoff;

  for (let step = 0; step < steps; step++) {
    // Springs
    if (Array.isArray(springs)) {
      for (let si = 0; si < springs.length; si++) {
        const s = springs[si];
        const ia = s[0];
        const ib = s[1];
        const rest = s[2];
        if (ia == null || ib == null) continue;

        const dx = px[ib] - px[ia];
        const dy = py[ib] - py[ia];
        const dz = pz[ib] - pz[ia];
        const d2 = dx * dx + dy * dy + dz * dz + 1e-6;
        const d = Math.sqrt(d2);
        // Hooke-style spring: F = (distance - restLength) * kSpring along the
        // normalized edge direction so linked nodes converge toward their target span.
        const f = (d - rest) * kSpring;
        const nx = dx / d;
        const ny = dy / d;
        const nz = dz / d;
        vx[ia] += nx * f * dt;
        vy[ia] += ny * f * dt;
        vz[ia] += nz * f * dt;
        vx[ib] -= nx * f * dt;
        vy[ib] -= ny * f * dt;
        vz[ib] -= nz * f * dt;
      }
    }

    // Repulsion + collision separation
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = px[j] - px[i];
        const dy = py[j] - py[i];
        const dz = pz[j] - pz[i];
        const d2 = dx * dx + dy * dy + dz * dz + 1e-6;
        if (d2 > cutoff2) continue;

        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const nz = dz / d;

        // Radius-based non-overlap push.
        if (hasRadii) {
          const ri = (radiusById.get(nodeIds[i]) ?? 0) + collisionPad;
          const rj = (radiusById.get(nodeIds[j]) ?? 0) + collisionPad;
          // Collision floor: minDist = max(emergencyDist, ri + rj) keeps circular
          // node footprints from intersecting while preserving the shared Y-up layout.
          const minDist = Math.max(emergencyDist, ri + rj);
          if (d < minDist) {
            const push = emergencyPush * (1 + (minDist - d) / Math.max(1e-6, minDist));
            vx[i] -= nx * push * dt;
            vy[i] -= ny * push * dt;
            vz[i] -= nz * push * dt;
            vx[j] += nx * push * dt;
            vy[j] += ny * push * dt;
            vz[j] += nz * push * dt;
            continue;
          }
        } else {
          // Emergency separation for near-overlaps.
          if (d < emergencyDist) {
            const push = emergencyPush;
            vx[i] -= nx * push * dt;
            vy[i] -= ny * push * dt;
            vz[i] -= nz * push * dt;
            vx[j] += nx * push * dt;
            vy[j] += ny * push * dt;
            vz[j] += nz * push * dt;
            continue;
          }
        }

        // Inverse-square repulsion (Application Network style).
        // F = kRepel / d^2 counteracts spring collapse while still fading quickly
        // enough that distant nodes do not dominate the local cluster shape.
        const push = kRepel / d2;
        vx[i] -= nx * push * dt;
        vy[i] -= ny * push * dt;
        vz[i] -= nz * push * dt;
        vx[j] += nx * push * dt;
        vy[j] += ny * push * dt;
        vz[j] += nz * push * dt;
      }
    }

    // Center gravity + integrate + bounds
    for (let i = 0; i < n; i++) {
      const cx = center.x - px[i];
      const cy = center.y - py[i];
      const cz = center.z - pz[i];
      // Center pull uses F = (center - position) * kCenter so the cluster stays
      // anchored near its assigned centroid instead of drifting through world space.
      vx[i] += cx * kCenter * dt;
      vy[i] += cy * kCenter * dt;
      vz[i] += cz * kCenter * dt;

      vx[i] *= damping;
      vy[i] *= damping;
      vz[i] *= damping;

      px[i] += vx[i];
      py[i] += vy[i];
      pz[i] += vz[i];

      clampIndexedPointToSphereBoundary({
        index: i,
        px,
        py,
        pz,
        vx,
        vy,
        vz,
        center,
        radius: boundR,
      });
    }
  }

  for (let i = 0; i < n; i++) {
    positions.set(nodeIds[i], { x: px[i], y: py[i], z: pz[i] });
  }

  return positions;
}

/**
 * Build index-space spring triples from graph edges and a default rest-length policy.
 * Purpose: convert shared edge data into the compact `[fromIndex, toIndex, restLength]` tuples consumed by the force-layout solver.
 * @param {object} [options={}] Spring-list inputs.
 * @param {Array<string>} [options.nodeIds] Ordered node ids that define the solver index space.
 * @param {Array<{ a?: string, b?: string, rest?: number }>} [options.edges] Edge records whose endpoints should be resolved into spring indices.
 * @param {number} [options.restLength=18] Fallback rest length used when an edge does not provide a finite `rest` value.
 * @returns {Array<[number, number, number]>} Spring tuples in solver index space.
 * Side effects: none; allocates and returns a new spring list.
 */
export function buildSpringList({ nodeIds, edges, restLength = 18 } = {}) {
  const idToIdx = new Map();
  for (let i = 0; i < nodeIds.length; i++) idToIdx.set(nodeIds[i], i);
  const springs = [];
  for (const e of edges || []) {
    const a = idToIdx.get(e.a);
    const b = idToIdx.get(e.b);
    if (a == null || b == null) continue;
    springs.push([a, b, Number.isFinite(e.rest) ? e.rest : restLength]);
  }
  return springs;
}
