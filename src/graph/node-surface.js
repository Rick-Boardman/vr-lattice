// SPDX-License-Identifier: Apache-2.0
/**
 * How far a ray from a node's centre travels before it leaves the node's outline.
 *
 * @param {string} shape Normalized node shape.
 * @param {number} halfWidth Half the shape's width.
 * @param {number} halfHeight Half the shape's height.
 * @param {number} ux Unit direction, x.
 * @param {number} uy Unit direction, y.
 * @returns {number} Distance from the centre to the outline along (ux, uy).
 */
export function resolveNodeSurfaceReach(shape, halfWidth, halfHeight, ux, uy) {
  const a = Math.max(1e-6, Number(halfWidth) || 0);
  const b = Math.max(1e-6, Number(halfHeight) || 0);
  const absX = Math.abs(ux);
  const absY = Math.abs(uy);
  if (shape === "pill" || shape === "circle" || shape === "double-circle") {
    return 1 / Math.sqrt((ux / a) ** 2 + (uy / b) ** 2);
  }
  if (shape === "diamond") {
    return 1 / (absX / a + absY / b);
  }
  if (shape === "hexagon") {
    // Corners at (0, +-b) and (+-0.866a, +-0.5b); its sides are the vertical pair and two slanted pairs.
    const sideX = a * Math.cos(Math.PI / 6);
    const vertical = absX > 1e-9 ? sideX / absX : Number.POSITIVE_INFINITY;
    const slanted = 1 / (absX / (2 * sideX) + absY / b);
    return Math.min(vertical, slanted);
  }
  const toSide = absX > 1e-9 ? a / absX : Number.POSITIVE_INFINITY;
  const toTop = absY > 1e-9 ? b / absY : Number.POSITIVE_INFINITY;
  return Math.min(toSide, toTop);
}
