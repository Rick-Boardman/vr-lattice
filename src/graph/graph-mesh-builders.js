// SPDX-License-Identifier: Apache-2.0
// Pure mesh-building and highlighting utilities for graph scenes.

import { Text as TroikaText } from "troika-three-text";

import {
  HUD_TEXT_DEFAULT_COLOR,
  HUD_TEXT_FONT_URL,
  HUD_TEXT_SDF_GLYPH_SIZE,
  HUD_TEXT_UNICODE_FONTS_URL,
} from "@rb/halo/src/hud-text-style.js";
import {
  HUD_GRAPH_NODE_HOVER_EMISSIVE_COLOR,
  HUD_GRAPH_NODE_NEUTRAL_EMISSIVE_COLOR,
  HUD_GRAPH_NODE_SELECTED_EMISSIVE_COLOR,
} from "@rb/halo/src/hud-highlight-style.js";

export function asHexColor(c, fallback = HUD_TEXT_DEFAULT_COLOR) {
  if (typeof c === "number" && Number.isFinite(c)) return c >>> 0;
  const s = String(c || "").trim();
  if (!s) return fallback;
  if (s.startsWith("#")) {
    const n = parseInt(s.slice(1), 16);
    return Number.isFinite(n) ? n >>> 0 : fallback;
  }
  if (s.startsWith("0x")) {
    const n = parseInt(s.slice(2), 16);
    return Number.isFinite(n) ? n >>> 0 : fallback;
  }
  const n = Number(s);
  return Number.isFinite(n) ? (n >>> 0) : fallback;
}

export function buildNodeMeshFromSpec({ THREE, node, spec, isOculus }) {
  const type = String(node?.type || node?.kind || "node");
  const nodeSpec = (spec?.byType && spec.byType[type]) ? spec.byType[type] : (spec?.default || {});

  const color = asHexColor(nodeSpec?.color ?? spec?.defaultColor ?? HUD_TEXT_DEFAULT_COLOR, HUD_TEXT_DEFAULT_COLOR);

  const geomSpec = nodeSpec?.geometry || { type: "sphere" };
  const gType = String(geomSpec?.type || "sphere");
  let geo = null;
  if (gType === "sphere") {
    const r = Number(geomSpec?.radius) || 1.15;
    geo = new THREE.SphereGeometry(r, isOculus ? 14 : 20, isOculus ? 10 : 14);
  } else if (gType === "cylinder") {
    const r = Number(geomSpec?.radius) || 0.85;
    const h = Number(geomSpec?.height) || 2.4;
    geo = new THREE.CylinderGeometry(r, r, h, isOculus ? 10 : 16);
  } else if (gType === "box") {
    const sx = Number(geomSpec?.sx) || 1.0;
    const sy = Number(geomSpec?.sy) || 1.0;
    const sz = Number(geomSpec?.sz) || 1.0;
    geo = new THREE.BoxGeometry(sx, sy, sz);
  } else if (gType === "octahedron") {
    const r = Number(geomSpec?.radius) || 1.0;
    const d = Number(geomSpec?.detail) || 0;
    geo = new THREE.OctahedronGeometry(r, d);
  } else {
    geo = new THREE.SphereGeometry(1.0, isOculus ? 12 : 16, isOculus ? 9 : 12);
  }

  const mSpec = nodeSpec?.material || {};
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: Number.isFinite(mSpec?.roughness) ? mSpec.roughness : 0.6,
    metalness: Number.isFinite(mSpec?.metalness) ? mSpec.metalness : 0.1,
    transparent: true,
    opacity: Number.isFinite(mSpec?.opacity) ? mSpec.opacity : 0.92,
    emissive: 0x000000,
  });
  return new THREE.Mesh(geo, mat);
}

export function buildEdgeLineFromSpec({ THREE, edge, fromPos, toPos, spec }) {
  const type = String(edge?.type || edge?.kind || "edge");
  const colorByType = spec?.colorByType || {};
  const color = asHexColor(colorByType[type] ?? spec?.defaultColor ?? "#6b7c8f", 0x6b7c8f);
  const opacity = Number.isFinite(spec?.opacity) ? spec.opacity : 0.55;

  const pts = new Float32Array([fromPos.x, fromPos.y, fromPos.z, toPos.x, toPos.y, toPos.z]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pts, 3));

  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const line = new THREE.Line(geo, mat);
  line.userData.baseOpacity = mat.opacity;
  line.userData.baseColor = color;
  return line;
}

export function normalizeGraphTextValue(value) {
  const resolved = String(value ?? "");
  return resolved.trim() ? resolved : "";
}

export function estimateGraphTextWidthPx(text, fontSizePx, widthFactor = 0.58) {
  const resolved = normalizeGraphTextValue(text);
  if (!resolved) return 0;
  const resolvedFontSizePx = Math.max(1, Number(fontSizePx) || 1);
  return resolved.length * resolvedFontSizePx * widthFactor;
}

function applyTroikaMaterialDefaults(material, { depthTest = false, depthWrite = false } = {}) {
  if (!material) return;
  material.depthTest = !!depthTest;
  material.depthWrite = !!depthWrite;
  material.transparent = true;
  if ("toneMapped" in material) {
    material.toneMapped = false;
  }
}

export function applyGraphTroikaRenderSettings(mesh, {
  depthTest = false,
  depthWrite = false,
  renderOrder = 0,
} = {}) {
  if (!mesh) return;
  const resolvedRenderOrder = Number.isFinite(Number(renderOrder)) ? Number(renderOrder) : 0;
  mesh.userData.graphTroikaDepthTest = !!depthTest;
  mesh.userData.graphTroikaDepthWrite = !!depthWrite;
  mesh.userData.graphTroikaRenderOrder = resolvedRenderOrder;

  const applyToObject = (obj) => {
    if (!obj) return;
    try {
      obj.renderOrder = resolvedRenderOrder;
    } catch {
      // no-op
    }
    try {
      const material = obj.material;
      if (Array.isArray(material)) {
        for (const entry of material) {
          applyTroikaMaterialDefaults(entry, { depthTest, depthWrite });
        }
      } else {
        applyTroikaMaterialDefaults(material, { depthTest, depthWrite });
      }
    } catch {
      // no-op
    }
    try {
      if ((obj.isMesh || obj.isInstancedMesh) && !obj.userData?._graphTroikaBeforeRender) {
        const previousOnBeforeRender = typeof obj.onBeforeRender === "function"
          ? obj.onBeforeRender.bind(obj)
          : null;
        obj.userData._graphTroikaBeforeRender = true;
        obj.onBeforeRender = function graphTroikaBeforeRender(...args) {
          const result = previousOnBeforeRender?.(...args);
          try {
            obj.renderOrder = mesh.userData.graphTroikaRenderOrder;
          } catch {
            // no-op
          }
          try {
            const material = obj.material;
            if (Array.isArray(material)) {
              for (const entry of material) {
                applyTroikaMaterialDefaults(entry, {
                  depthTest: mesh.userData.graphTroikaDepthTest,
                  depthWrite: mesh.userData.graphTroikaDepthWrite,
                });
              }
            } else {
              applyTroikaMaterialDefaults(material, {
                depthTest: mesh.userData.graphTroikaDepthTest,
                depthWrite: mesh.userData.graphTroikaDepthWrite,
              });
            }
          } catch {
            // no-op
          }
          return result;
        };
      }
    } catch {
      // no-op
    }
  };

  applyToObject(mesh);
  try {
    mesh.traverse?.((entry) => {
      if (entry !== mesh) applyToObject(entry);
    });
  } catch {
    // no-op
  }
}

function resolveFontSizeFromCssFont(font, fallbackPx = 44) {
  const match = String(font ?? "").match(/(\d+(?:\.\d+)?)px/);
  const resolved = Number(match?.[1] ?? fallbackPx);
  return Number.isFinite(resolved) && resolved > 0 ? resolved : fallbackPx;
}

function resolveBillboardLabelLocalFontSize(fontSizePx) {
  const resolvedFontSizePx = Math.max(1, Number(fontSizePx) || 44);
  return Math.max(0.16, Math.min(0.34, resolvedFontSizePx / 220));
}

function syncTroikaText(mesh) {
  if (typeof mesh?.sync === "function") {
    try {
      mesh.sync();
    } catch {
      // no-op for lightweight test stubs.
    }
  }
}

function chainOnBeforeRender(mesh, callback) {
  if (!mesh || typeof callback !== "function") return;
  const previousOnBeforeRender = typeof mesh.onBeforeRender === "function"
    ? mesh.onBeforeRender.bind(mesh)
    : null;
  mesh.onBeforeRender = function chainedOnBeforeRender(...args) {
    previousOnBeforeRender?.(...args);
    callback(...args);
  };
}

function applyBillboardLabelRenderOrder(group, renderOrder) {
  const resolved = Math.floor(Number(renderOrder) || 0);
  group.renderOrder = resolved;
  if (group.userData?.backgroundMesh) {
    group.userData.backgroundMesh.renderOrder = resolved;
  }
  if (group.userData?.borderMesh) {
    group.userData.borderMesh.renderOrder = resolved + 0.01;
  }
  if (group.userData?.textMesh) {
    group.userData.textMesh.renderOrder = resolved + 0.02;
  }
}

export function createGraphTroikaText({
  Text = TroikaText,
  color = HUD_TEXT_DEFAULT_COLOR,
  font = HUD_TEXT_FONT_URL,
  unicodeFontsURL = HUD_TEXT_UNICODE_FONTS_URL,
  sdfGlyphSize = HUD_TEXT_SDF_GLYPH_SIZE,
  fontSize = 0.16,
  fontWeight = null,
  textAlign = "left",
  anchorX = "left",
  anchorY = "top",
  maxWidth = null,
  lineHeight = 1.1,
  outlineWidth = 0,
  outlineColor = 0x000000,
  outlineOpacity = 1,
  depthTest = false,
  depthWrite = false,
  renderOrder = 0,
} = {}) {
  const TextConstructor = typeof Text === "function" ? Text : TroikaText;
  const mesh = new TextConstructor();
  mesh.isGraphTroikaText = true;
  mesh.text = "";
  mesh.color = asHexColor(color, HUD_TEXT_DEFAULT_COLOR);
  mesh.fontSize = Number(fontSize) || 0.16;
  mesh.textAlign = textAlign;
  mesh.anchorX = anchorX;
  mesh.anchorY = anchorY;
  mesh.lineHeight = Number.isFinite(lineHeight) ? lineHeight : 1.1;
  mesh.maxWidth = Number.isFinite(maxWidth) ? maxWidth : undefined;
  mesh.outlineWidth = Number.isFinite(outlineWidth) ? outlineWidth : 0;
  mesh.outlineColor = asHexColor(outlineColor, 0x000000);
  mesh.outlineOpacity = Number.isFinite(outlineOpacity) ? outlineOpacity : 1;
  mesh.font = font ?? undefined;
  mesh.unicodeFontsURL = unicodeFontsURL ?? undefined;
  mesh.sdfGlyphSize = Number.isFinite(sdfGlyphSize) ? sdfGlyphSize : HUD_TEXT_SDF_GLYPH_SIZE;
  mesh.fontWeight = fontWeight ?? undefined;
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  applyTroikaMaterialDefaults(mesh.material, { depthTest, depthWrite });
  applyGraphTroikaRenderSettings(mesh, { depthTest, depthWrite, renderOrder });
  return mesh;
}

export function setGraphTroikaText(mesh, {
  text = "",
  color = null,
  font = undefined,
  unicodeFontsURL = undefined,
  fontSize = null,
  fontWeight = undefined,
  textAlign = undefined,
  anchorX = undefined,
  anchorY = undefined,
  maxWidth = undefined,
  lineHeight = undefined,
  outlineWidth = undefined,
  outlineColor = undefined,
  outlineOpacity = undefined,
  x = undefined,
  y = undefined,
  z = undefined,
  visible = true,
} = {}) {
  if (!mesh) return null;
  const resolvedText = normalizeGraphTextValue(text);
  mesh.text = resolvedText;
  mesh.visible = !!visible && !!resolvedText;
  if (color != null) mesh.color = asHexColor(color, HUD_TEXT_DEFAULT_COLOR);
  if (font !== undefined) mesh.font = font ?? undefined;
  if (unicodeFontsURL !== undefined) mesh.unicodeFontsURL = unicodeFontsURL ?? undefined;
  if (fontSize != null) mesh.fontSize = Number(fontSize) || mesh.fontSize;
  if (fontWeight !== undefined) mesh.fontWeight = fontWeight ?? undefined;
  if (textAlign !== undefined) mesh.textAlign = textAlign;
  if (anchorX !== undefined) mesh.anchorX = anchorX;
  if (anchorY !== undefined) mesh.anchorY = anchorY;
  if (maxWidth !== undefined) mesh.maxWidth = Number.isFinite(maxWidth) ? maxWidth : undefined;
  if (lineHeight !== undefined) mesh.lineHeight = Number.isFinite(lineHeight) ? lineHeight : mesh.lineHeight;
  if (outlineWidth !== undefined) mesh.outlineWidth = Number.isFinite(outlineWidth) ? outlineWidth : 0;
  if (outlineColor !== undefined) mesh.outlineColor = asHexColor(outlineColor, 0x000000);
  if (outlineOpacity !== undefined) mesh.outlineOpacity = Number.isFinite(outlineOpacity) ? outlineOpacity : 1;
  if (x !== undefined) mesh.position.x = Number(x) || 0;
  if (y !== undefined) mesh.position.y = Number(y) || 0;
  if (z !== undefined) mesh.position.z = Number(z) || 0;
  syncTroikaText(mesh);
  applyGraphTroikaRenderSettings(mesh, {
    depthTest: mesh.userData.graphTroikaDepthTest,
    depthWrite: mesh.userData.graphTroikaDepthWrite,
    renderOrder: mesh.userData.graphTroikaRenderOrder ?? mesh.renderOrder,
  });
  return mesh;
}

export function disposeGraphTroikaText(mesh) {
  mesh?.dispose?.();
}

export function createBillboardTextLabel({
  THREE,
  Text = TroikaText,
  text,
  color = HUD_TEXT_DEFAULT_COLOR,
  scale = [8, 2, 1],
  font = "44px monospace",
  fontUrl = HUD_TEXT_FONT_URL,
  unicodeFontsURL = HUD_TEXT_UNICODE_FONTS_URL,
  backgroundColor = 0x000000,
  backgroundOpacity = 0.35,
  borderColor = null,
  borderOpacity = 0.85,
  lineHeight = 1,
  outlineWidth = 0.025,
  outlineColor = 0x05090e,
  outlineOpacity = 0.92,
  depthTest = false,
  depthWrite = false,
  renderOrder = 0,
  textRole = "label",
} = {}) {
  const group = new THREE.Group();
  const cameraWorldQuaternion = new THREE.Quaternion();
  const parentWorldQuaternion = new THREE.Quaternion();
  // The group receives the camera's world rotation each frame to billboard the
  // label. A NON-uniform group scale (e.g. [8, 2, 1]) composed with that
  // rotation produces a shear in the world matrix, which made labels look
  // tilted at the "wrong angle" and vertically squished as the camera turned.
  // Fix: keep the group scale UNIFORM (rotation * uniform-scale is a similarity
  // transform with no shear) and bake the panel's width:height aspect into the
  // child geometry instead, which is axis-aligned within the group and so is
  // never sheared. World size and text wrap width are preserved exactly.
  const requestedScaleX = Number(scale?.[0]) || 1;
  const requestedScaleY = Number(scale?.[1]) || 1;
  const uniformScale = requestedScaleY > 0 ? requestedScaleY : 1;
  const panelAspectX = uniformScale > 0 ? requestedScaleX / uniformScale : 1;
  const backgroundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(panelAspectX, 1),
    new THREE.MeshBasicMaterial({
      color: asHexColor(backgroundColor, 0x000000),
      transparent: true,
      opacity: Number.isFinite(backgroundOpacity) ? backgroundOpacity : 0.35,
      depthTest: !!depthTest,
      depthWrite: !!depthWrite,
    }),
  );
  const borderMesh = borderColor == null
    ? null
    : new THREE.Mesh(
      new THREE.PlaneGeometry(panelAspectX + 0.03, 1.03),
      new THREE.MeshBasicMaterial({
        color: asHexColor(borderColor, 0xffffff),
        transparent: true,
        opacity: Number.isFinite(borderOpacity) ? borderOpacity : 0.85,
        depthTest: !!depthTest,
        depthWrite: !!depthWrite,
      }),
    );
  if (borderMesh) {
    borderMesh.position.z = -0.01;
    group.add(borderMesh);
  }
  group.add(backgroundMesh);

  const fontSizePx = resolveFontSizeFromCssFont(font, 44);
  const labelText = createGraphTroikaText({
    Text,
    color,
    font: fontUrl,
    unicodeFontsURL,
    fontSize: resolveBillboardLabelLocalFontSize(fontSizePx),
    fontWeight: String(font ?? "").includes("bold") ? "bold" : undefined,
    textAlign: "center",
    anchorX: "center",
    anchorY: "middle",
    maxWidth: 0.84 * panelAspectX,
    lineHeight: Number.isFinite(lineHeight) ? lineHeight : 1,
    outlineWidth: Number.isFinite(outlineWidth) ? outlineWidth : 0,
    outlineColor,
    outlineOpacity: Number.isFinite(outlineOpacity) ? outlineOpacity : 0,
    depthTest,
    depthWrite,
    renderOrder: renderOrder + 0.02,
  });
  labelText.userData.graphTextRole = textRole;
  group.add(labelText);
  setGraphTroikaText(labelText, { text, x: 0, y: 0, z: 0.01 });

  group.scale.set(uniformScale, uniformScale, uniformScale);
  group.userData.backgroundMesh = backgroundMesh;
  group.userData.borderMesh = borderMesh;
  group.userData.textMesh = labelText;
  group.userData.graphTextRole = textRole;
  group.setRenderOrder = (nextRenderOrder) => {
    applyBillboardLabelRenderOrder(group, nextRenderOrder);
  };
  group.dispose = () => {
    backgroundMesh.geometry?.dispose?.();
    backgroundMesh.material?.dispose?.();
    borderMesh?.geometry?.dispose?.();
    borderMesh?.material?.dispose?.();
    disposeGraphTroikaText(labelText);
  };

  const billboardToCamera = (...args) => {
    const camera = args[2] ?? null;
    if (camera?.getWorldQuaternion) {
      // Screen-aligned billboard: make the label share the camera's world
      // orientation so it always faces the viewer AND stays level, regardless
      // of how the parent graph group is rotated/tilted. Using lookAt() instead
      // orients in the parent's local frame and inherits the parent's tilt,
      // which made labels appear rotated. Copying the camera quaternion also
      // puts the label plane's +Z (and the text at z>0) toward the camera, so
      // the text renders in front of its background panel.
      camera.getWorldQuaternion(cameraWorldQuaternion);
      const parent = group.parent;
      if (parent?.getWorldQuaternion) {
        parent.getWorldQuaternion(parentWorldQuaternion).invert();
        group.quaternion.copy(parentWorldQuaternion).multiply(cameraWorldQuaternion);
      } else {
        group.quaternion.copy(cameraWorldQuaternion);
      }
    }
  };
  chainOnBeforeRender(backgroundMesh, billboardToCamera);
  if (borderMesh) chainOnBeforeRender(borderMesh, billboardToCamera);
  chainOnBeforeRender(labelText, billboardToCamera);
  applyBillboardLabelRenderOrder(group, renderOrder);
  return group;
}

export function makeLabelSpriteFactory({ THREE, Text = TroikaText, canvasW = 512, canvasH = 128, font = "44px monospace", scale = [8, 2, 1] } = {}) {
  return function makeLabelSprite({ text, color = "#dde3ea" } = {}) {
    return createBillboardTextLabel({
      THREE,
      Text,
      text: String(text ?? "").slice(0, 48),
      color,
      scale,
      font,
      backgroundColor: 0x000000,
      backgroundOpacity: 0.35,
      borderColor: null,
      depthTest: false,
      depthWrite: false,
      renderOrder: 0,
      textRole: "network-label",
    });
  };
}

export function applyGenericNodeHighlight(nodeMeshes, { selectedId = null, hoveredId = null } = {}) {
  for (const m of nodeMeshes) {
    const id = m?.userData?.id ?? m?.userData?.node?.id;
    const isSel = id && selectedId && id === selectedId;
    const isHover = id && hoveredId && id === hoveredId;

    const mat = m?.material;
    if (mat?.emissive && typeof mat.emissive.setHex === "function") {
      mat.emissive.setHex(
        isSel
          ? HUD_GRAPH_NODE_SELECTED_EMISSIVE_COLOR
          : isHover
            ? HUD_GRAPH_NODE_HOVER_EMISSIVE_COLOR
            : HUD_GRAPH_NODE_NEUTRAL_EMISSIVE_COLOR,
      );
    }
    if (mat?.opacity != null) {
      mat.opacity = isSel ? 1.0 : isHover ? 0.97 : 0.92;
    }
  }
}
