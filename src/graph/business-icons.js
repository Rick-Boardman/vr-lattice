// SPDX-License-Identifier: Apache-2.0
/* global Path2D */
/**
 * The toolbar and panel icons: one line-drawn set on a 24-unit grid, one stroke weight, one colour.
 * Drawn from paths at run time, so they stay sharp and need no image files.
 */
const ICON_CANVAS_PX = 96;
const ICON_GRID = 24;
const ICON_STROKE_WIDTH = 1.75;
const ICON_COLOR = "#dbe5ef";

const circle = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const box = (x, y, size) => `M${x + 1.5} ${y}h${size - 3}a1.5 1.5 0 0 1 1.5 1.5v${size - 3}a1.5 1.5 0 0 1-1.5 1.5h${-(size - 3)}a1.5 1.5 0 0 1-1.5-1.5v${-(size - 3)}a1.5 1.5 0 0 1 1.5-1.5z`;

const PAGE = ["M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z", "M14 3v5h5"];
const CROSS = ["M6 6l12 12", "M18 6 6 18"];
const TURN_LEFT = ["M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.3", "M3.5 3.5v4.8h4.8"];
const TURN_RIGHT = ["M20.5 12a8.5 8.5 0 1 1-2.8-6.3l2.8 2.6", "M20.5 3.5v4.8h-4.8"];
const CYCLE = ["M20 10.5A8 8 0 0 0 5.7 7L3.5 9.2", "M3.5 4.5v4.7h4.7", "M4 13.5A8 8 0 0 0 18.3 17l2.2-2.2", "M20.5 19.5v-4.7h-4.7"];
const LENS = [circle(11, 11, 7), "M20.5 20.5l-4.6-4.6"];

export const BUSINESS_ICON_PATHS = Object.freeze({
  new: [...PAGE, "M12 11.5v6", "M9 14.5h6"],
  create: [...PAGE, "M12 11.5v6", "M9 14.5h6"],
  load: ["M3 7a2 2 0 0 1 2-2h4.2l2 2.2H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
  save: ["M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M8 3v5h7", "M7.5 21v-7.5h9V21"],
  deploy: ["M12 15.5V4", "M7.5 8.5 12 4l4.5 4.5", "M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"],
  run: ["M7 4.5v15l12.5-7.5z"],
  step: ["M5 5v14l10.5-7z", "M19.5 5v14"],
  stop: [box(5, 5, 14)],
  clear: ["M8 21h12", "M5.4 14.6 14 6a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L11 21H7.8l-2.4-2.4a2.8 2.8 0 0 1 0-4z", "M9.5 10.5l6 6"],
  delete: ["M4 7h16", "M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7", "M6 7l1 12.5A1.6 1.6 0 0 0 8.6 21h6.8a1.6 1.6 0 0 0 1.6-1.5L18 7", "M10 11.5v5.5", "M14 11.5v5.5"],
  close: CROSS,
  cancel: CROSS,
  confirm: ["M5 13l4.5 4.5L19 7"],
  palette: [box(3.5, 3.5, 7), box(13.5, 3.5, 7), box(3.5, 13.5, 7), box(13.5, 13.5, 7)],
  log: ["M8.5 6H20", "M8.5 12H20", "M8.5 18H20", "M4 6h.01", "M4 12h.01", "M4 18h.01"],
  connectors: ["M9 3v5", "M15 3v5", "M6 8h12v3a6 6 0 0 1-12 0z", "M12 17v4"],
  rotateLeft: TURN_LEFT,
  rotateRight: TURN_RIGHT,
  refresh: CYCLE,
  reset: TURN_LEFT,
  modeDry: ["M9 3h6", "M10 3v6.2L4.9 18a2 2 0 0 0 1.7 3h10.8a2 2 0 0 0 1.7-3L14 9.2V3", "M7.6 15h8.8"],
  modeLive: ["M13 3 5 14h6l-1 7 8-11h-6z"],
  touchPan: ["M12 3v18", "M3 12h18", "M9.5 5.5 12 3l2.5 2.5", "M9.5 18.5 12 21l2.5-2.5", "M5.5 9.5 3 12l2.5 2.5", "M18.5 9.5 21 12l-2.5 2.5"],
  touchSelect: ["M4 8V5a1 1 0 0 1 1-1h3", "M16 4h3a1 1 0 0 1 1 1v3", "M20 16v3a1 1 0 0 1-1 1h-3", "M8 20H5a1 1 0 0 1-1-1v-3", "M11 4h2", "M11 20h2", "M4 11v2", "M20 11v2"],
  fit: ["M4 9V5a1 1 0 0 1 1-1h4", "M15 4h4a1 1 0 0 1 1 1v4", "M20 15v4a1 1 0 0 1-1 1h-4", "M9 20H5a1 1 0 0 1-1-1v-4"],
  output: [...PAGE, "M9 13h6", "M9 17h6"],
  zoomIn: [...LENS, "M11 8v6", "M8 11h6"],
  zoomOut: [...LENS, "M8 11h6"],
  edit: ["M4 20h4L19.2 8.8a2.1 2.1 0 0 0-3-3L5 17z", "M14.5 7.5l3 3"],
  pick: ["M6 9l6 6 6-6"],
  view: ["M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z", circle(12, 12, 3)],
  test: [circle(12, 12, 8.5), circle(12, 12, 3.5)],
});

/**
 * @param {object} THREE Three.js namespace.
 * @returns {Record<string, object | null>} One texture per icon name; null outside a browser.
 */
export function createBusinessIconTextures(THREE) {
  const textures = {};
  for (const [name, paths] of Object.entries(BUSINESS_ICON_PATHS)) {
    textures[name] = createIconTexture(THREE, paths);
  }
  return textures;
}

function createIconTexture(THREE, paths) {
  if (!THREE?.CanvasTexture || typeof document === "undefined" || typeof Path2D === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = ICON_CANVAS_PX;
  canvas.height = ICON_CANVAS_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(ICON_CANVAS_PX / ICON_GRID, ICON_CANVAS_PX / ICON_GRID);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = ICON_STROKE_WIDTH;
  ctx.strokeStyle = ICON_COLOR;
  for (const path of paths) ctx.stroke(new Path2D(path));
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
