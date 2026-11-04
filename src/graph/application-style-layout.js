// SPDX-License-Identifier: Apache-2.0
// Shared clustered layout pipeline (Application-Network style).
// Goal: keep macro structure (group centers + per-group relaxation) consistent across scenes.

import { clamp, clampIndexedPointToSphereBoundary, lerp } from "@rb/halo/src/scalar-math.js";
import { createLcgRng } from "@rb/halo/src/prng.js";
import { hashStringToU32 } from "@rb/halo/src/string-hash.js";

// ────── Layout solver policy constants ──────
// All tuning values for the clustered graph layout in one place.
// See force-layout.js for the simpler non-clustered solver defaults.

// Envelope sphere: outer groups sit on a sphere whose radius grows with count.
const ENV_SPHERE_BASE_RADIUS = 34;
const ENV_SPHERE_PER_GROUP_DELTA = 4;
const ENV_SPHERE_GROUP_THRESHOLD = 3;

// Bias blending: outer group centers are lerped toward a random bias direction.
const OUTER_GROUP_BIAS_BLEND_MIN = 0.25;
const OUTER_GROUP_BIAS_BLEND_RANGE = 0.35;
const OUTER_GROUP_RADIUS_JITTER_BASE = 0.88;
const OUTER_GROUP_RADIUS_JITTER_RANGE = 0.26;

// Center-group sub-center splitting.
const CENTER_SPLIT_MIN_DOT = 0.35;
const CENTER_SPLIT_TRIES = 900;
const CENTER_SPLIT_RADIUS = 8;

// Group-scale parameters: shared groups grow more slowly and cap lower.
const GROUP_SCALE_K = 30;
const GROUP_SCALE_MAX = 1.55;
const GROUP_SCALE_K_SHARED = 38;
const GROUP_SCALE_MAX_SHARED = 1.45;

// Cloud init: randomized 3D sphere seeding.
const CLOUD_INIT_SPREAD = 1.32;
const CLOUD_INIT_DEFAULT_BASE_R = 40;
const CLOUD_INIT_RADIUS_MIN_FRAC = 0.55;
const CLOUD_INIT_RADIUS_RANGE_FRAC = 0.65;
const CLOUD_INIT_RADIUS_POW = 0.7;

const DEFAULT_SPRING_REST_LENGTH = 18;

// Group boundary radii.
const BOUND_R_SHARED = 88;
const BOUND_R_OUTER = 72;
const DENSITY_EXPANSION_FACTOR = 0.22;

// Iteration budgets: small graphs get more symmetry tuning; Oculus gets fewer.
const STEPS_OCULUS = 48;
const STEPS_SMALL = 520;
const STEPS_MEDIUM = 260;
const STEPS_LARGE = 160;
const SMALL_NODE_THRESHOLD = 60;
const MEDIUM_NODE_THRESHOLD = 140;

const SOLVER_DT = 0.02;
const SOLVER_DAMPING = 0.86;

// Spring stiffness.
const K_SPRING_BASE = 0.6;
const DEGREE_SCALE_REF = 6;

// Center pull.
const K_CENTER_SHARED = 0.02;
const K_CENTER_OUTER = 0.03;
const K_CENTER_DENSITY_SCALE = 0.72;
const K_CENTER_DENSITY_MIN = 0.22;

// Repulsion.
const K_REPEL_BASE = 130;
const K_REPEL_DENSITY_SCALE = 0.35;
const REPEL_CUTOFF = 70;
const EMERGENCY_DIST = 3.2;
const EMERGENCY_PUSH = 240;

// Oculus performance budget for neighbor-scan windows.
const OCULUS_BUDGET_NUMERATOR = 4200;
const OCULUS_NEIGHBOR_MIN = 12;
const OCULUS_NEIGHBOR_MAX = 28;

function clamp01(v) {
  return clamp(v, 0, 1);
}

function randomUnitVec(THREE, rng) {
  const u = rng();
  const v = rng();
  // Uniform sphere sampling: theta sweeps the full azimuth and phi = acos(2v - 1)
  // corrects for pole compression, so the sampled direction stays isotropic.
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  return new THREE.Vector3(
    Math.cos(theta) * Math.sin(phi),
    Math.sin(theta) * Math.sin(phi),
    Math.cos(phi)
  );
}

function pickSeparatedDirections(THREE, rng, count, { minDot = 0.18, tries = 600 } = {}) {
  const dirs = [];
  for (let i = 0; i < tries && dirs.length < count; i++) {
    const d = randomUnitVec(THREE, rng);
    let ok = true;
    for (const existing of dirs) {
      // dot(a, b) = cos(theta), so rejecting values above minDot enforces a
      // minimum angular separation before group centers can share a direction.
      if (d.dot(existing) > minDot) {
        ok = false;
        break;
      }
    }
    if (ok) dirs.push(d);
  }
  while (dirs.length < count) dirs.push(randomUnitVec(THREE, rng));
  return dirs;
}

function groupScaleFromCount(count, { k = 30, max = 1.6 } = {}) {
  const s = 1 + Math.sqrt(Math.max(0, count)) / k;
  return Math.min(max, s);
}

function initCloud(THREE, rng, positions, ids, center, baseR, spread = 1, yBias = 0) {
  // 3D cloud init (Application style): randomized spherical directions and radius.
  // This keeps cliques naturally volumetric (sphere-like) while allowing cycles to
  // settle into planar rings through relaxation (no special casing).
  for (const id of ids) {
    const d = randomUnitVec(THREE, rng);
    const rr = baseR * (CLOUD_INIT_RADIUS_MIN_FRAC + CLOUD_INIT_RADIUS_RANGE_FRAC * Math.pow(rng(), CLOUD_INIT_RADIUS_POW)) * spread;
    positions.set(
      id,
      new THREE.Vector3(
        center.x + d.x * rr,
        center.y + d.y * rr + yBias,
        center.z + d.z * rr
      )
    );
  }
}

/**
 * Compute clustered world-space positions for the shared application-network graph layout.
 * Purpose: seed and relax grouped node clouds into stable 3D positions that shared graph scenes can render without app-local layout code.
 * @param {object} args Layout inputs.
 * @param {any} args.THREE Three.js namespace used to construct and clone Vector3 values.
 * @param {Array<{ id: string, type?: string, name?: string, metadata?: any }>} args.nodes Graph nodes to position.
 * @param {Array<{ fromId: string, toId: string, type?: string, weight?: number }>} args.edges Graph edges used for spring and grouping relationships.
 * @param {Map<string, string>} args.groupById Group name lookup keyed by node id.
 * @param {number} [args.seed=1] Deterministic seed for the layout RNG.
 * @param {boolean} [args.isOculusBrowser=false] Whether to use the reduced-iteration Oculus-friendly layout budget.
 * @param {string | null} [args.centerGroupName=null] Optional group name that stays anchored near the origin.
 * @param {number} [args.splitCenterGroupCount=0] Number of deterministic sub-centers used when splitting the anchored center group.
 * @param {((groupName: string, ids: Array<string>) => number) | null} [args.boundRForGroup=null] Optional radius policy for each group's relaxation bounds.
 * @param {((edge: any, aNode: any, bNode: any) => number) | null} [args.restLengthForEdge=null] Optional spring rest-length policy for each edge.
 * @param {((edge: any) => boolean) | null} [args.includeEdgeInPhysics=null] Optional predicate that decides which edges participate in the relaxation solver.
 * @param {((node: any) => string) | null} [args.typeOfNode=null] Optional node-type resolver used for grouped cloud seeding.
 * @param {Record<string, number> | null} [args.initRadiusByType=null] Optional per-type initial cloud radius table.
 * @param {((positions: Map<string, any>, ctx: { THREE: any, rng: Function, nodeById: Map<string, any> }) => void) | null} [args.placeUnpositioned=null] Optional hook that can place nodes left unseeded by the default grouping pass.
 * @param {number} [args.minNodeSpacing=3.6] Minimum node-to-node spacing enforced by the projection solver during relaxation.
 * @param {number} [args.spacingSolverIters=1] Number of spacing-solver passes per relaxation step before values are clamped to the supported range.
 * @returns {Map<string, any>} Map of node id to world-space THREE.Vector3 position.
 * Side effects: none; allocates vectors and mutates only local layout state before returning the final positions map.
 */
export function layoutClusteredGraphApplicationStyle({
  THREE,
  nodes,
  edges,
  groupById,
  seed = 1,
  isOculusBrowser = false,
  centerGroupName = null,
  splitCenterGroupCount = 0,
  boundRForGroup = null,
  restLengthForEdge = null,
  includeEdgeInPhysics = null,
  typeOfNode = null,
  initRadiusByType = null,
  placeUnpositioned = null,
  // Hard spacing constraint (universal): if nodes get closer than this, they are projected apart.
  // This is not shape-specific; it improves readability across dense and sparse graphs.
  minNodeSpacing = 3.6,
  spacingSolverIters = 1,
} = {}) {
  if (!THREE) throw new Error("layoutClusteredGraphApplicationStyle: missing THREE");
  const rng = createLcgRng((seed ^ 0x9e3779b9) >>> 0);
  const positions = new Map();

  const nodeById = new Map();
  for (const n of nodes || []) nodeById.set(n.id, n);

  const typeFn =
    typeof typeOfNode === "function" ? typeOfNode : (n) => (n && n.type != null ? String(n.type) : "node");

  // Build groups with per-type buckets.
  const groups = new Map();
  for (const n of nodes || []) {
    const gname = groupById?.get(n.id) || "GROUP";
    if (!groups.has(gname)) groups.set(gname, { ids: [], byType: new Map() });
    const g = groups.get(gname);
    g.ids.push(n.id);
    const t = typeFn(n);
    if (!g.byType.has(t)) g.byType.set(t, []);
    g.byType.get(t).push(n.id);
  }

  const groupNames = Array.from(groups.keys());
  groupNames.sort((a, b) => {
    if (centerGroupName && a === centerGroupName) return -1;
    if (centerGroupName && b === centerGroupName) return 1;
    return String(a).localeCompare(String(b));
  });

  const centers = new Map();
  if (centerGroupName && groups.has(centerGroupName)) centers.set(centerGroupName, new THREE.Vector3(0, 0, 0));

  // Place non-center groups on a biased sphere (Application style).
  const outerGroups = groupNames.filter((n) => !centerGroupName || n !== centerGroupName);
  if (outerGroups.length) {
    const envSphereR = ENV_SPHERE_BASE_RADIUS + Math.max(0, outerGroups.length - ENV_SPHERE_GROUP_THRESHOLD) * ENV_SPHERE_PER_GROUP_DELTA;
    const envDirs = pickSeparatedDirections(THREE, rng, outerGroups.length, { minDot: 0.18 });
    const bias = randomUnitVec(THREE, rng);
    for (let i = 0; i < outerGroups.length; i++) {
      const gname = outerGroups[i];
      const d0 = envDirs[i];
      const t = OUTER_GROUP_BIAS_BLEND_MIN + rng() * OUTER_GROUP_BIAS_BLEND_RANGE;
      const d = new THREE.Vector3(
        lerp(d0.x, bias.x, t),
        lerp(d0.y, bias.y, t),
        lerp(d0.z, bias.z, t)
      ).normalize();
      const rr = envSphereR * (OUTER_GROUP_RADIUS_JITTER_BASE + rng() * OUTER_GROUP_RADIUS_JITTER_RANGE);
      centers.set(gname, new THREE.Vector3(d.x * rr, d.y * rr, d.z * rr));
    }
  }

  // Split the center group into multiple sub-centers (Application SHARED style).
  const centerSubCenters = [];
  if (centerGroupName && splitCenterGroupCount > 0) {
    const sharedDirs = pickSeparatedDirections(THREE, rng, splitCenterGroupCount, { minDot: CENTER_SPLIT_MIN_DOT, tries: CENTER_SPLIT_TRIES });
    for (const d of sharedDirs) centerSubCenters.push(new THREE.Vector3(d.x * CENTER_SPLIT_RADIUS, d.y * CENTER_SPLIT_RADIUS, d.z * CENTER_SPLIT_RADIUS));
  }

  const centerForId = (groupName, id) => {
    if (centerGroupName && groupName === centerGroupName && centerSubCenters.length) {
      const idx = hashStringToU32(String(id)) % centerSubCenters.length;
      return centerSubCenters[idx];
    }
    return centers.get(groupName) || new THREE.Vector3(0, 0, 0);
  };

  const initR = typeof initRadiusByType === "object" && initRadiusByType ? initRadiusByType : {};

  for (const gname of groupNames) {
    const g = groups.get(gname);
    if (!g) continue;
    const shared = centerGroupName && gname === centerGroupName;
    const gScale = groupScaleFromCount(g.ids.length || 0, {
      k: shared ? GROUP_SCALE_K_SHARED : GROUP_SCALE_K,
      max: shared ? GROUP_SCALE_MAX_SHARED : GROUP_SCALE_MAX,
    });

    const spread = CLOUD_INIT_SPREAD;

    for (const [t, ids] of g.byType.entries()) {
      const base = Number(initR[t]);
      const baseR = Number.isFinite(base) ? base * gScale : CLOUD_INIT_DEFAULT_BASE_R * gScale;
      for (const id of ids) initCloud(THREE, rng, positions, [id], centerForId(gname, id), baseR, spread, 0);
    }
  }

  // Optional hook: place nodes not already positioned (e.g. Application databases near servers).
  if (typeof placeUnpositioned === "function") {
    placeUnpositioned(positions, { THREE, rng, nodeById });
  }

  // Per-group relaxation pass (springs + mild repulsion), matching Application implementation.
  for (const gname of groupNames) {
    const g = groups.get(gname);
    if (!g) continue;

    const ids = g.ids;
    const n = ids.length;
    if (n <= 1) continue;

    const idToIdx = new Map();
    for (let i = 0; i < n; i++) idToIdx.set(ids[i], i);

    const px = new Float32Array(n);
    const py = new Float32Array(n);
    const pz = new Float32Array(n);
    const vx = new Float32Array(n);
    const vy = new Float32Array(n);
    const vz = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const p = positions.get(ids[i]);
      px[i] = p?.x ?? 0;
      py[i] = p?.y ?? 0;
      pz[i] = p?.z ?? 0;
    }

    const springs = [];
    for (const e of edges || []) {
      if (typeof includeEdgeInPhysics === "function" && !includeEdgeInPhysics(e)) continue;
      const a = idToIdx.get(e.fromId);
      const b = idToIdx.get(e.toId);
      if (a == null || b == null) continue;
      const na = nodeById.get(e.fromId);
      const nb = nodeById.get(e.toId);
      const rest = typeof restLengthForEdge === "function" ? restLengthForEdge(e, na, nb) : DEFAULT_SPRING_REST_LENGTH;
      springs.push([a, b, rest]);
    }

    // Density/degree-derived scaling (universal):
    // - Dense graphs have many springs and can over-collapse into a flattened blob.
    // - Reduce spring strength and center-pull as density rises so repulsion can
    //   distribute nodes more isotropically (cliques become sphere-like).
    const maxPairs = (n * (n - 1)) / 2;
    const density = maxPairs > 0 ? clamp01(springs.length / maxPairs) : 0;
    const meanDegree = n > 0 ? (springs.length * 2) / n : 0;

    const center = centers.get(gname) || new THREE.Vector3(0, 0, 0);
    const shared = centerGroupName && gname === centerGroupName;
    const gScale = groupScaleFromCount(n, {
      k: shared ? GROUP_SCALE_K_SHARED : GROUP_SCALE_K,
      max: shared ? GROUP_SCALE_MAX_SHARED : GROUP_SCALE_MAX,
    });

    const baseBoundR =
      typeof boundRForGroup === "function"
        ? Number(boundRForGroup(gname, ids))
        : (shared ? BOUND_R_SHARED : BOUND_R_OUTER) * gScale;
    // Give dense graphs a bit more room to expand.
    const boundR = baseBoundR * (1 + DENSITY_EXPANSION_FACTOR * density);

    // More iterations for small graphs improves symmetry (e.g. cycles -> cleaner rings).
    const steps = isOculusBrowser ? STEPS_OCULUS : n <= SMALL_NODE_THRESHOLD ? STEPS_SMALL : n <= MEDIUM_NODE_THRESHOLD ? STEPS_MEDIUM : STEPS_LARGE;
    const dt = SOLVER_DT;
    const damping = SOLVER_DAMPING;
    const kSpringBase = K_SPRING_BASE;
    // Keep sparse graphs snappy, tame dense graphs.
    const springScale = Math.sqrt(DEGREE_SCALE_REF / Math.max(DEGREE_SCALE_REF, meanDegree || 0));
    const kSpring = kSpringBase * springScale;

    const kCenterBase = (shared ? K_CENTER_SHARED : K_CENTER_OUTER) / gScale;
    const kCenter = kCenterBase * clamp(1 - K_CENTER_DENSITY_SCALE * density, K_CENTER_DENSITY_MIN, 1);

    // Slightly stronger repulsion for dense graphs to counter spring count.
    const kRepel = K_REPEL_BASE * (1 + K_REPEL_DENSITY_SCALE * density);
    const repelCutoff = REPEL_CUTOFF;
    const emergencyDist = EMERGENCY_DIST;

    const minSpacing = Number.isFinite(minNodeSpacing) ? Math.max(0, minNodeSpacing) : 0;
    const solveIters = Number.isFinite(spacingSolverIters)
      ? clamp(Math.floor(spacingSolverIters), 0, 4)
      : 1;

    const repelNeighborSpan =
      isOculusBrowser && n > MEDIUM_NODE_THRESHOLD ? clamp(Math.floor(OCULUS_BUDGET_NUMERATOR / n), OCULUS_NEIGHBOR_MIN, OCULUS_NEIGHBOR_MAX) : n;

    for (let step = 0; step < steps; step++) {
      for (let si = 0; si < springs.length; si++) {
        const ia = springs[si][0];
        const ib = springs[si][1];
        const rest = springs[si][2];
        const dx = px[ib] - px[ia];
        const dy = py[ib] - py[ia];
        const dz = pz[ib] - pz[ia];
        const d2 = dx * dx + dy * dy + dz * dz + 1e-6;
        const d = Math.sqrt(d2);
        // Hooke-style spring force: F = (distance - restLength) * k, applied along
        // the normalized edge direction so linked nodes converge toward their target span.
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

      for (let i = 0; i < n; i++) {
        const jMax = Math.min(n, i + 1 + repelNeighborSpan);
        for (let j = i + 1; j < jMax; j++) {
          const dx = px[j] - px[i];
          const dy = py[j] - py[i];
          const dz = pz[j] - pz[i];
          const d2 = dx * dx + dy * dy + dz * dz + 1e-6;
          const d = Math.sqrt(d2);
          if (d > repelCutoff) continue;

          if (d < emergencyDist) {
            const push = EMERGENCY_PUSH;
            const nx = dx / d;
            const ny = dy / d;
            const nz = dz / d;
            vx[i] -= nx * push * dt;
            vy[i] -= ny * push * dt;
            vz[i] -= nz * push * dt;
            vx[j] += nx * push * dt;
            vy[j] += ny * push * dt;
            vz[j] += nz * push * dt;
            continue;
          }

          // Inverse-square repulsion: F = k / d^2 keeps near-overlapping nodes from
          // collapsing together while still allowing distant clusters to relax.
          const push = kRepel / d2;
          const nx = dx / d;
          const ny = dy / d;
          const nz = dz / d;
          vx[i] -= nx * push * dt;
          vy[i] -= ny * push * dt;
          vz[i] -= nz * push * dt;
          vx[j] += nx * push * dt;
          vy[j] += ny * push * dt;
          vz[j] += nz * push * dt;
        }
      }

      for (let i = 0; i < n; i++) {
        const cx = center.x - px[i];
        const cy = center.y - py[i];
        const cz = center.z - pz[i];
        // Center pull uses F = (center - position) * kCenter so each group stays
        // bounded around its assigned anchor instead of drifting through the scene.
        vx[i] += cx * kCenter * dt;
        vy[i] += cy * kCenter * dt;
        vz[i] += cz * kCenter * dt;

        vx[i] *= damping;
        vy[i] *= damping;
        vz[i] *= damping;

        px[i] += vx[i];
        py[i] += vy[i];
        pz[i] += vz[i];
      }

      // Hard minimum spacing projection (position-based):
      // Enforces a true minimum distance (unlike inverse-square repulsion which can be outweighed).
      if (minSpacing > 0 && solveIters > 0) {
        const min2 = minSpacing * minSpacing;
        for (let iter = 0; iter < solveIters; iter++) {
          for (let i = 0; i < n; i++) {
            const jMax = Math.min(n, i + 1 + repelNeighborSpan);
            for (let j = i + 1; j < jMax; j++) {
              const dx = px[j] - px[i];
              const dy = py[j] - py[i];
              const dz = pz[j] - pz[i];
              const d2 = dx * dx + dy * dy + dz * dz + 1e-9;
              if (d2 >= min2) continue;
              const d = Math.sqrt(d2);
              const overlap = minSpacing - d;
              const invD = 1 / d;
              const nx = dx * invD;
              const ny = dy * invD;
              const nz = dz * invD;
              const push = overlap * 0.5;
              px[i] -= nx * push;
              py[i] -= ny * push;
              pz[i] -= nz * push;
              px[j] += nx * push;
              py[j] += ny * push;
              pz[j] += nz * push;
            }
          }
        }
      }

      // Bound after projection so the constraint solver can still expand dense regions.
      for (let i = 0; i < n; i++) {
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
      positions.set(ids[i], new THREE.Vector3(px[i], py[i], pz[i]));
    }
  }

  return positions;
}
