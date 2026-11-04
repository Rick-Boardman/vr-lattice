// SPDX-License-Identifier: Apache-2.0
// View-layer helpers for graph scenes: hotbar visuals, world-to-HUD projection, and initial camera placement.

import {
  HUD_LAYOUT_DEFAULT_HEIGHT_PX,
  HUD_LAYOUT_DEFAULT_WIDTH_PX,
} from "@rb/halo/src/hud-layout-policy.js";
import {
  HUD_SURFACE_ACCENT_COLOR,
  HUD_SURFACE_CONTENT_BG_COLOR,
  HUD_SURFACE_PANEL_BG_COLOR,
} from "@rb/halo/src/hud-surface-style.js";
import {
  HUD_PRIMARY_HIGHLIGHT_COLOR,
} from "@rb/halo/src/hud-highlight-style.js";
import { makeGroupByIdForLayoutMode } from "./derived.js";
import { createLcgRng } from "@rb/halo/src/prng.js";

export function defaultHotbarVisuals(hudSystem, states) {
  const slots = hudSystem?.hud?.objects?.hotbarSlots;
  if (!slots || slots.length < 4) return;

  const onOutline = HUD_PRIMARY_HIGHLIGHT_COLOR;
  const offOutline = HUD_SURFACE_ACCENT_COLOR;
  const onBg = HUD_SURFACE_PANEL_BG_COLOR;
  const offBg = HUD_SURFACE_CONTENT_BG_COLOR;

  for (let i = 0; i < 4; i++) {
    const { bg, outline } = slots[i] || {};
    if (!bg?.material || !outline?.material) continue;
    const on = !!states[i];
    outline.material.color.setHex(on ? onOutline : offOutline);
    bg.material.color.setHex(on ? onBg : offBg);
    bg.material.opacity = on ? 0.95 : 0.85;
  }
}

export function projectWorldToHud({ THREE, camera, hudSystem, worldPos, margin = 16 } = {}) {
  const v = worldPos.clone();
  v.project(camera);

  // If the point is far off-screen (or behind the camera), don't try to clamp it.
  // Clamping causes hover panels to "stick" to corners and flicker during look/mouse movement.
  const ok =
    Number.isFinite(v.x) &&
    Number.isFinite(v.y) &&
    Number.isFinite(v.z) &&
    Math.abs(v.x) <= 1.2 &&
    Math.abs(v.y) <= 1.2 &&
    v.z >= -1.0 &&
    v.z <= 1.1;

  const W = hudSystem?.hud?.layoutW ?? HUD_LAYOUT_DEFAULT_WIDTH_PX;
  const H = hudSystem?.hud?.layoutH ?? HUD_LAYOUT_DEFAULT_HEIGHT_PX;
  const x = (v.x * 0.5 + 0.5) * W + margin;
  const y = (-v.y * 0.5 + 0.5) * H + margin;
  return { x, y, ok };
}

/**
 * Places the player outside the node cluster, facing toward the center.
 * Uses grouping if available to prefer a single environment cluster.
 */
export function applySmartInitialView({ THREE, ctx, graph, positions, nodeById, navigation, rig, json }) {
  if (!nodeById || !nodeById.size) return;

  const layoutMode = String(json?.layout?.grouping?.mode || "");
  const groupById = makeGroupByIdForLayoutMode(graph, layoutMode, json?.layout?.grouping || {});

  // Find environment groups (excluding SHARED)
  const envSet = new Set();
  for (const n of graph?.nodes || []) {
    const g = groupById.get(n.id);
    if (g && g !== "SHARED") envSet.add(g);
  }
  const envs = Array.from(envSet);

  // Deterministic RNG for consistent placement
  const rng = createLcgRng(graph?.seed ?? 1);

  const tmp = new THREE.Vector3();

  // Compute overall graph centroid
  const graphCentroid = new THREE.Vector3();
  let graphCount = 0;
  for (const mesh of nodeById.values()) {
    mesh.getWorldPosition(tmp);
    graphCentroid.add(tmp);
    graphCount++;
  }
  if (graphCount > 0) graphCentroid.multiplyScalar(1 / graphCount);

  // Compute start cluster centroid (prefer a single env if available)
  const startCentroid = new THREE.Vector3();
  let startRadius = 10;
  let hasStartCentroid = false;

  if (envs.length) {
    // Pick a random env cluster
    const env = envs[Math.floor(rng() * envs.length)];
    const pts = [];
    for (const n of graph?.nodes || []) {
      if (groupById.get(n.id) !== env) continue;
      const mesh = nodeById.get(n.id);
      if (!mesh) continue;
      mesh.getWorldPosition(tmp);
      startCentroid.add(tmp);
      pts.push(tmp.clone());
    }
    if (pts.length > 0) {
      startCentroid.multiplyScalar(1 / pts.length);
      hasStartCentroid = true;
      for (const p of pts) startRadius = Math.max(startRadius, p.distanceTo(startCentroid));
      startRadius = Math.max(10, startRadius);
    }
  }

  // Fallback to overall centroid
  if (!hasStartCentroid && graphCount > 0) {
    startCentroid.copy(graphCentroid);
    hasStartCentroid = true;
    for (const mesh of nodeById.values()) {
      mesh.getWorldPosition(tmp);
      startRadius = Math.max(startRadius, tmp.distanceTo(startCentroid));
    }
    startRadius = Math.max(10, startRadius);
  }

  if (!hasStartCentroid) return;

  // Place the camera outside the cluster in a stable direction
  const fromGraph = startCentroid.clone().sub(graphCentroid);
  // Choose a stable outward direction for the camera:
  // prefer the vector from the full-graph centroid to the start-group centroid;
  // fall back to start-centroid itself if the two are nearly coincident,
  // or to +Z if even that is degenerate (epsilon guards avoid normalize-of-zero).
  const outDir =
    fromGraph.lengthSq() > 1e-6
      ? fromGraph.normalize()
      : startCentroid.length() > 0.0001
        ? startCentroid.clone().normalize()
        : new THREE.Vector3(0, 0, 1);

  const dist = startRadius + 22 + rng() * 12;
  const height = 5 + rng() * 5;

  const startPos = startCentroid.clone().addScaledVector(outDir, dist);
  startPos.y += height;

  // Move player to start position
  rig.player.position.copy(startPos);

  // Look toward the cluster center
  if (navigation?.lookAtWorld) {
    navigation.lookAtWorld(startCentroid);
  } else if (ctx?.look) {
    // Manual yaw/pitch calculation
    const camera = ctx.camera;
    rig.player.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const from = new THREE.Vector3();
    camera.getWorldPosition(from);
    const dir = new THREE.Vector3().subVectors(startCentroid, from);
    // Project direction onto the XZ ground plane to isolate the horizontal
    // distance; atan2(-x, -z) gives the yaw in the Y-up right-handed
    // convention where yaw-0 faces -Z and positive yaw rotates toward -X.
    const horiz = Math.max(0.0001, Math.hypot(dir.x, dir.z));
    ctx.look.state.yaw = Math.atan2(-dir.x, -dir.z);
    // Pitch = elevation angle above the ground plane.
    ctx.look.state.pitch = Math.atan2(dir.y, horiz);
    ctx.look.applyLook();
  }
}
