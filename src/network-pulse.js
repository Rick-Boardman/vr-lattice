// SPDX-License-Identifier: Apache-2.0
// Generic 3D network pulse effect helper.
// Designed for reuse across scenes (not a DOM overlay; WebGL-only).

import { NETWORK_PULSE_DEFAULTS } from "./network-pulse-policy.js";
import { clamp, lerp } from "@rb/halo/src/scalar-math.js";

/**
 * Purpose: Create a reusable WebGL pulse effect controller for graph/network edges that can emphasize lines incident to an active node.
 * @param {object} [options={}] Pulse effect configuration.
 * @param {object} options.THREE Three.js namespace used to allocate the pulse group, instanced geometry, shader material, and working vectors.
 * @param {{ add: (...objects: unknown[]) => void, remove: (object: unknown) => void }} options.parent Parent object that receives the pulse effect group.
 * @param {number} [options.color=NETWORK_PULSE_DEFAULTS.color] Hex color applied to active pulse meshes and emphasized pulseable edges.
 * @param {number} [options.maxPulses=NETWORK_PULSE_DEFAULTS.maxPulses] Maximum number of reusable pulse instances allocated up front.
 * @param {number} [options.pulsesPerEdge=NETWORK_PULSE_DEFAULTS.pulsesPerEdge] Number of animated pulses emitted along each pulseable incident edge.
 * @param {number} [options.pulseRadius=NETWORK_PULSE_DEFAULTS.pulseRadius] Radius used to size the moving pulse head and trail.
 * @param {"classic" | "mainflow"} [options.style="classic"] Pulse animation style used to calculate scale falloff over time.
 * @param {number} [options.pulseBaseOpacity=0.9] Shared material opacity used for pulse meshes.
 * @param {number} [options.pulseMinScale=1.105] Minimum pulse scale applied during animation.
 * @param {number} [options.pulseMaxScale=1.6] Maximum pulse scale applied during animation.
 * @param {(line: unknown) => boolean} [options.isEdgePulseable=null] Optional predicate used to exclude specific edge lines from pulse emission.
 * @returns {{ group: unknown, setTheme: (theme: string | null) => void, clear: () => void, dispose: () => void, setActiveNode: (nodeId: string | null, atS: number) => void, rebuild: (edgeLines: Array<unknown>) => void, setEdgeEmphasis: (edgeLines: Array<unknown>, options?: { dimOpacity?: number, brightOpacity?: number }) => void, update: (tS: number, nodeById: Map<string, { position: unknown }>, edgeLines: Array<unknown>, options?: { speed?: number }) => void }} Pulse effect controller with lifecycle, emphasis, and per-frame update hooks.
 * Side effects: allocates Three.js geometry/material/mesh objects, adds and removes a group from the supplied parent, mutates edge line material colors/opacities, and mutates pulse instance visibility, position, and scale during updates.
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

  // One depth-tested draw for the whole pool. Each camera-facing quad is oriented
  // along its edge's projected tangent, including per-eye projection in XR.
  const capacity = Math.max(0, Math.trunc(maxPulses));
  const pulseGeo = new THREE.InstancedBufferGeometry();
  pulseGeo.setIndex([0, 1, 2, 0, 2, 3]);
  pulseGeo.setAttribute("position", new THREE.Float32BufferAttribute([
    -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0,
  ], 3));
  function dynamicAttribute(name, itemSize) {
    const attribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * itemSize), itemSize);
    attribute.setUsage(THREE.DynamicDrawUsage);
    pulseGeo.setAttribute(name, attribute);
    return attribute;
  }
  const origins = dynamicAttribute("pulseOrigin", 3);
  const vectors = dynamicAttribute("pulseVector", 3);
  const sizes = dynamicAttribute("pulseSize", 2);
  const dynamicAttributes = [origins, vectors, sizes];
  pulseGeo.instanceCount = 0;
  const baseColor = new THREE.Color(color);
  const hsl = baseColor.getHSL({});
  const lightInk = new THREE.Color().setHSL(hsl.h, Math.min(0.88, hsl.s * 1.30), 0.21);
  const lightCore = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.45);
  const darkInk = baseColor.clone();
  const darkCore = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.65);
  const pulseMat = new THREE.ShaderMaterial({
    uniforms: {
      pulseInk: { value: darkInk },
      pulseCore: { value: darkCore },
      pulseOpacity: { value: pulseBaseOpacity },
      lightMode: { value: false },
      pixelsToNdc: { value: 0 },
    },
    vertexShader: `
      attribute vec3 pulseOrigin;
      attribute vec3 pulseVector;
      attribute vec2 pulseSize;
      uniform float pixelsToNdc;
      varying vec2 pulseUV;
      varying float tailReach;
      void main() {
        vec4 center = modelViewMatrix * vec4(pulseOrigin, 1.0);
        vec3 along = mat3(modelViewMatrix) * pulseVector;
        vec2 tangent = along.xy;
        if (projectionMatrix[2][3] != 0.0) {
          tangent -= center.xy * along.z / min(center.z, -0.001);
        }
        float tangentLength = length(tangent);
        vec2 forward = tangentLength > 0.0001 ? tangent / tangentLength : vec2(1.0, 0.0);
        vec2 across = vec2(-forward.y, forward.x);
        float radius = pulseSize.x * length(modelViewMatrix[0].xyz);
        if (pixelsToNdc > 0.0) {
          float viewUnitsPerPixel = pixelsToNdc * abs((projectionMatrix * center).w) / projectionMatrix[1][1];
          radius = clamp(radius, 2.65 * viewUnitsPerPixel, 4.1 * viewUnitsPerPixel);
        }
        // Shift rearward so the bright head stays exactly on the moving path.
        pulseUV = vec2(mix(-3.8, 1.2, position.x * 0.5 + 0.5), position.y * 1.15);
        tailReach = min(3.8, pulseSize.y * tangentLength / max(radius, 0.0001));
        center.xy += radius * (forward * pulseUV.x + across * pulseUV.y);
        gl_Position = projectionMatrix * center;
      }
    `,
    fragmentShader: `
      uniform vec3 pulseInk;
      uniform vec3 pulseCore;
      uniform float pulseOpacity;
      uniform bool lightMode;
      varying vec2 pulseUV;
      varying float tailReach;
      void main() {
        float x = pulseUV.x;
        float y = pulseUV.y;
        float headR = length(vec2(x / 0.88, y / 0.65));
        float head = 1.0 - smoothstep(0.30, 1.18, headR);
        float glint = 1.0 - smoothstep(0.06, 0.70, length(vec2(x / 0.88, y / 0.50)));
        float behind = max(0.0, -x);
        float reach = max(0.12, tailReach);
        float width = mix(0.16, 0.62, exp(-behind * 0.49));
        float tail = (1.0 - smoothstep(0.0, 1.0, abs(y) / width))
          * (1.0 - smoothstep(0.0, reach, behind))
          * (1.0 - smoothstep(-0.12, 0.30, x));
        float haloR = length(vec2(x / 1.05, y / 1.02));
        float halo = (1.0 - smoothstep(0.25, 1.10, haloR)) * (lightMode ? 0.14 : 0.18);
        float alpha = min(1.0, max(head * 0.96, tail * 0.9) + halo) * pulseOpacity;
        vec3 ink = mix(pulseInk, pulseCore, glint * (lightMode ? 0.96 : 0.72));
        gl_FragColor = vec4(ink, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
  // CPU positions live in instance attributes, outside the unit quad's bounds.
  pulseMesh.frustumCulled = false;
  pulseMesh.visible = false;
  const renderViewport = new THREE.Vector4();
  pulseMesh.onBeforeRender = renderer => {
    // Bound the visual weight in desktop/touch screen pixels: readable at
    // overview scale but not oversized when zoomed. XR keeps world sizing.
    const pixels = renderer.getCurrentViewport(renderViewport).w;
    pulseMat.uniforms.pixelsToNdc.value = renderer.xr?.isPresenting || pixels <= 0
      ? 0 : 2 * renderer.getPixelRatio() / pixels;
    pulseMat.uniformsNeedUpdate = true;
  };
  group.add(pulseMesh);

  function setTheme(theme) {
    const light = theme === "light";
    pulseMat.uniforms.lightMode.value = light;
    pulseMat.uniforms.pulseInk.value = light ? lightInk : darkInk;
    pulseMat.uniforms.pulseCore.value = light ? lightCore : darkCore;
    // Light needs chromatic contrast; additive glow washes out on pale worlds.
    pulseMat.blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;
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
    pulseGeo.instanceCount = 0;
    pulseMesh.visible = false;
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
      force = false,
    } = {}
  ) {
    if (!force && activeNodeId === lastEmphasisNodeId) return;
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
    if (!activeNodeId || pulseRadius <= 0 || capacity === 0) {
      clearPulses();
      return;
    }

    const edgeIdxs = incidentEdgeLineIdxByNodeId.get(activeNodeId) || [];
    const baseTime = Math.max(0, tS - activeAtS);

    let pIdx = 0;
    for (let i = 0; i < edgeIdxs.length && pIdx < capacity; i++) {
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

      const dx = _b.x - _a.x;
      const dy = _b.y - _a.y;
      const dz = _b.z - _a.z;
      if (dx === 0 && dy === 0 && dz === 0) continue;
      for (let k = 0; k < pulsesPerEdge && pIdx < capacity; k++) {
        const phase = k / pulsesPerEdge;
        const u = (baseTime * speed + phase) % 1;

        const px = lerp(_a.x, _b.x, u);
        const py = lerp(_a.y, _b.y, u);
        const pz = lerp(_a.z, _b.z, u);

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
        origins.setXYZ(pIdx, px, py, pz);
        vectors.setXYZ(pIdx, dx, dy, dz);
        sizes.setXY(pIdx, pulseRadius * s, u);
        pIdx++;
      }
    }

    pulseGeo.instanceCount = pIdx;
    pulseMesh.visible = pIdx > 0;
    for (const attribute of dynamicAttributes) {
      if (!pIdx) continue;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, pIdx * attribute.itemSize);
      attribute.needsUpdate = true;
    }
  }

  return {
    group,
    setTheme,
    clear,
    dispose,
    setActiveNode,
    rebuild,
    setEdgeEmphasis,
    update,
  };
}
