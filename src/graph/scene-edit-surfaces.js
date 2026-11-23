// SPDX-License-Identifier: Apache-2.0

const surfaces = new WeakMap();

/** Keep live Three meshes outside userData so scene serialization stays acyclic. */
export function setGraphSceneEditSurface(mesh, field, localBounds, textMesh = null) {
  if (!surfaces.has(mesh)) surfaces.set(mesh, new Map());
  surfaces.get(mesh).set(field, { localBounds, textMesh });
}

export function getGraphSceneEditSurface(mesh, field) {
  const registered = surfaces.get(mesh)?.get(field);
  if (!registered) return null;
  let { localBounds } = registered;
  if (!localBounds) {
    // Store no early copy of billboard bounds: the theme may replace its geometry.
    mesh.geometry?.computeBoundingBox?.();
    const bounds = mesh.geometry?.boundingBox;
    if (!bounds) return null;
    localBounds = { left: bounds.min.x, bottom: bounds.min.y, right: bounds.max.x, top: bounds.max.y };
  }
  return { mesh, localBounds: { ...localBounds }, textMesh: registered.textMesh };
}
