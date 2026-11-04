// SPDX-License-Identifier: Apache-2.0
// Generic 3D network pulse effect helper.
// Designed for reuse across scenes (not a DOM overlay; WebGL-only).

import { NETWORK_PULSE_DEFAULTS } from "./network-pulse-policy.js";
import { clamp, lerp } from "@rb/halo/src/scalar-math.js";

/**
 * Purpose: Create a reusable WebGL pulse effect controller for graph/network edges that can emphasize lines incident to an active node.
 * @param {object} [options={}] Pulse effect configuration.
 * @param {{ Group: new () => { name: string, add: (...objects: unknown[]) => void }, SphereGeometry: new (radius: number, widthSegments: number, heightSegments: number) => { dispose?: () => void }, MeshBasicMaterial: new (options?: object) => { dispose?: () => void }, Mesh: new (geometry: unknown, material: unknown) => { visible: boolean, position: { set: (x: number, y: number, z: number) => void }, scale: { setScalar: (value: number) => void } }, Vector3: new () => { copy: (value: unknown) => unknown, x: number, y: number, z: number }, AdditiveBlending: number }} options.THREE Three.js namespace used to allocate the pulse group, meshes, geometry, materials, and working vectors.
 * @param {{ add: (...objects: unknown[]) => void, remove: (object: unknown) => void }} options.parent Parent object that receives the pulse effect group.
 * @param {number} [options.color=NETWORK_PULSE_DEFAULTS.color] Hex color applied to active pulse meshes and emphasized pulseable edges.
 * @param {number} [options.maxPulses=NETWORK_PULSE_DEFAULTS.maxPulses] Maximum number of reusable pulse meshes allocated up front.
 * @param {number} [options.pulsesPerEdge=NETWORK_PULSE_DEFAULTS.pulsesPerEdge] Number of animated pulses emitted along each pulseable incident edge.
 * @param {number} [options.pulseRadius=NETWORK_PULSE_DEFAULTS.pulseRadius] Sphere radius used for each pulse mesh.
 * @param {"classic" | "mainflow"} [options.style="classic"] Pulse animation style used to calculate scale falloff over time.
 * @param {number} [options.pulseBaseOpacity=0.9] Shared material opacity used for pulse meshes.
 * @param {number} [options.pulseMinScale=1.105] Minimum pulse scale applied during animation.
 * @param {number} [options.pulseMaxScale=1.6] Maximum pulse scale applied during animation.
 * @param {(line: unknown) => boolean} [options.isEdgePulseable=null] Optional predicate used to exclude specific edge lines from pulse emission.
 * @returns {{ group: unknown, clear: () => void, dispose: () => void, setActiveNode: (nodeId: string | null, atS: number) => void, rebuild: (edgeLines: Array<unknown>) => void, setEdgeEmphasis: (edgeLines: Array<unknown>, options?: { dimOpacity?: number, brightOpacity?: number }) => void, update: (tS: number, nodeById: Map<string, { position: unknown }>, edgeLines: Array<unknown>, options?: { speed?: number }) => void }} Pulse effect controller with lifecycle, emphasis, and per-frame update hooks.
 * Side effects: allocates Three.js geometry/material/mesh objects, adds and removes a group from the supplied parent, mutates edge line material colors/opacities, and mutates pulse mesh visibility/position/scale during updates.
 */
export function createNetworkPulseEffect({
  THREE,
  parent,
  color = NETWORK_PULSE_DEFAULTS.color,
  maxPulses = NETWORK_PULSE_DEFAULTS.maxPulses,
  pulsesPerEdge = NETWORK_PULSE_DEFAULTS.pulsesPerEdge,
  pulseRadius = NETWORK_PULSE_DEFAULTS.pulseRadius,
  // Optional style tweaks (keeps defaults identical)
  style = "classic", // classic | mainflow
  pulseBaseOpacity = 0.9,
  // Classic scaling previously produced ~[1.105..1.6]
  pulseMinScale = 1.105,
  pulseMaxScale = 1.6,
  isEdgePulseable = null,
} = {}) {
  if (!THREE) throw new Error("createNetworkPulseEffect requires THREE");
  if (!parent) throw new Error("createNetworkPulseEffect requires parent");

  const group = new THREE.Group();
  group.name = "networkPulse";
  parent.add(group);

  const incidentEdgeLineIdxByNodeId = new Map();

  const pulseGeo = new THREE.SphereGeometry(pulseRadius, 10, 8);
  const pulseMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: pulseBaseOpacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const pulseMeshes = [];
  for (let i = 0; i < maxPulses; i++) {
    const m = new THREE.Mesh(pulseGeo, pulseMat);
    m.visible = false;
    pulseMeshes.push(m);
    group.add(m);
  }

  let activeNodeId = null;
  let activeAtS = 0;
  let lastEmphasisNodeId = null;

  const _a = new THREE.Vector3();
  const _b = new THREE.Vector3();

  function smoothstep(t) {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
  }

  function clearPulses() {
    for (const p of pulseMeshes) p.visible = false;
  }

  function clear() {
    activeNodeId = null;
    activeAtS = 0;
    lastEmphasisNodeId = null;
    incidentEdgeLineIdxByNodeId.clear();
    clearPulses();
  }

  function dispose() {
    clear();
    parent.remove(group);
    pulseGeo.dispose?.();
    pulseMat.dispose?.();
  }

  function setActiveNode(nodeId, atS) {
    if (nodeId === activeNodeId) return;
    activeNodeId = nodeId || null;
    activeAtS = atS || 0;
    lastEmphasisNodeId = null;
  }

  function _edgeLineIsPulseable(line) {
    if (typeof isEdgePulseable === "function") return !!isEdgePulseable(line);
    const v = line?.userData?.pulseable;
    if (v == null) return true;
    return !!v;
  }

  function rebuild(edgeLines) {
    incidentEdgeLineIdxByNodeId.clear();
    for (let i = 0; i < edgeLines.length; i++) {
      const line = edgeLines[i];
      if (!_edgeLineIsPulseable(line)) continue;
      const e = line?.userData?.edge;
      if (!e?.fromId || !e?.toId) continue;
      if (!incidentEdgeLineIdxByNodeId.has(e.fromId)) incidentEdgeLineIdxByNodeId.set(e.fromId, []);
      if (!incidentEdgeLineIdxByNodeId.has(e.toId)) incidentEdgeLineIdxByNodeId.set(e.toId, []);
      incidentEdgeLineIdxByNodeId.get(e.fromId).push(i);
      incidentEdgeLineIdxByNodeId.get(e.toId).push(i);
    }
    lastEmphasisNodeId = null;
  }

  function setEdgeEmphasis(
    edgeLines,
    {
      dimOpacity = NETWORK_PULSE_DEFAULTS.dimOpacity,
      brightOpacity = NETWORK_PULSE_DEFAULTS.brightOpacity,
    } = {}
  ) {
    if (activeNodeId === lastEmphasisNodeId) return;
    lastEmphasisNodeId = activeNodeId;

    const hasActive = !!activeNodeId;
    for (const line of edgeLines) {
      const e = line?.userData?.edge;
      const baseOpacity = line?.userData?.baseOpacity ?? line?.material?.opacity ?? 0.55;
      const baseColor = line?.userData?.baseColor ?? line?.material?.color?.getHex?.() ?? 0x5b7aa6;
      if (!line?.material) continue;

      if (!hasActive) {
        line.material.opacity = baseOpacity;
        line.material.color.setHex(baseColor);
        continue;
      }

      const incident = e && (e.fromId === activeNodeId || e.toId === activeNodeId);
      const pulseable = _edgeLineIsPulseable(line);
      if (incident && pulseable) {
        line.material.opacity = brightOpacity;
        line.material.color.setHex(color);
      } else {
        // Keep incident-but-not-pulseable edges at base values.
        if (incident && !pulseable) {
          line.material.opacity = baseOpacity;
          line.material.color.setHex(baseColor);
          continue;
        }
        line.material.opacity = dimOpacity;
        line.material.color.setHex(baseColor);
      }
    }
  }

  function update(tS, nodeById, edgeLines, { speed = NETWORK_PULSE_DEFAULTS.speed } = {}) {
    if (!activeNodeId) {
      clearPulses();
      return;
    }

    const edgeIdxs = incidentEdgeLineIdxByNodeId.get(activeNodeId) || [];
    const baseTime = Math.max(0, tS - activeAtS);

    let pIdx = 0;
    for (let i = 0; i < edgeIdxs.length; i++) {
      const line = edgeLines[edgeIdxs[i]];
      const e = line?.userData?.edge;
      if (!e) continue;

      const fromMesh = nodeById.get(e.fromId);
      const toMesh = nodeById.get(e.toId);
      if (!fromMesh || !toMesh) continue;

      // Pulses emanate away from the active node.
      if (e.fromId === activeNodeId) {
        _a.copy(fromMesh.position);
        _b.copy(toMesh.position);
      } else {
        _a.copy(toMesh.position);
        _b.copy(fromMesh.position);
      }

      for (let k = 0; k < pulsesPerEdge; k++) {
        if (pIdx >= pulseMeshes.length) break;
        const phase = k / pulsesPerEdge;
        const u = (baseTime * speed + phase) % 1;

        const px = lerp(_a.x, _b.x, u);
        const py = lerp(_a.y, _b.y, u);
        const pz = lerp(_a.z, _b.z, u);

        const m = pulseMeshes[pIdx++];
        m.position.set(px, py, pz);

        let glow;
        if (style === "mainflow") {
          // "Mainflow" pulse profile: sharp symmetric peak at u = MAINFLOW_PEAK_U
          // with width controlled by MAINFLOW_FALLOFF.
          // w(u) = 1 − |u − peak| × falloff  →  smoothstep²  →  glow.
          // The floor (MAINFLOW_GLOW_FLOOR) keeps the pulse visible even in the tail.
          const MAINFLOW_PEAK_U = 0.25;
          const MAINFLOW_FALLOFF = 1.8;
          const MAINFLOW_GLOW_FLOOR = 0.15;
          const MAINFLOW_GLOW_RANGE = 0.85;
          const w = 1 - Math.abs(u - MAINFLOW_PEAK_U) * MAINFLOW_FALLOFF;
          const g = smoothstep(w);
          glow = MAINFLOW_GLOW_FLOOR + MAINFLOW_GLOW_RANGE * g * g;
        } else {
          // Classic pulse profile: broader peak shifted to u = CLASSIC_PEAK_U
          // with steeper falloff (CLASSIC_FALLOFF).  Higher floor keeps edges
          // softly illuminated even outside the peak window.
          const CLASSIC_PEAK_U = 0.35;
          const CLASSIC_FALLOFF = 2;
          const CLASSIC_GLOW_FLOOR = 0.45;
          const CLASSIC_GLOW_RANGE = 0.55;
          const w = 1 - Math.abs(u - CLASSIC_PEAK_U) * CLASSIC_FALLOFF;
          glow = CLASSIC_GLOW_FLOOR + CLASSIC_GLOW_RANGE * smoothstep(w);
        }

        const s = pulseMinScale + glow * (pulseMaxScale - pulseMinScale);
        m.scale.setScalar(s);
        // Slight opacity modulation (material is shared, so do not set per-mesh)
        m.visible = true;
      }
      if (pIdx >= pulseMeshes.length) break;
    }

    for (; pIdx < pulseMeshes.length; pIdx++) pulseMeshes[pIdx].visible = false;
  }

  return {
    group,
    clear,
    dispose,
    setActiveNode,
    rebuild,
    setEdgeEmphasis,
    update,
  };
}
