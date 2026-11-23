// SPDX-License-Identifier: Apache-2.0

/** Raycast only the host's explicitly listed graph targets, without choosing a hit. */
export function raycastGraphTargets(sceneModel, raycaster, configureRay, { far = Infinity } = {}) {
  if (!sceneModel) return null;
  try { sceneModel.root?.updateMatrixWorld?.(true); } catch { /* preserve host fallback */ }
  configureRay(raycaster);
  raycaster.far = far;
  return raycaster.intersectObjects([
    ...(sceneModel.actionHandleHitTargets ?? []), ...(sceneModel.portHitTargets ?? []),
    ...(sceneModel.nodeHitTargets ?? []), ...(sceneModel.edgeHitTargets ?? []),
  ], false);
}

/** Resolve the XR-selectable node/handle result from a host-chosen graph hit. */
export function resolveGraphRaySelection(hits, selectPreferredGraphHit) {
  if (!hits?.length) return null;
  const graphHit = selectPreferredGraphHit(hits);
  const id = graphHit?.kind === "edge" ? null : graphHit?.id ?? null;
  if (!id) return null;
  const entry = hits.find(hit => hit?.object?.userData?.graphHit === graphHit) ?? hits[0];
  return { id, distance: Number(entry?.distance), point: entry?.point?.clone?.() ?? null, graphHit };
}

/** Read a Three controller's -Z ray, excluding scale from its direction. */
export function readGraphControllerRay(controller, origin, direction, rotation) {
  if (!controller?.matrixWorld) return false;
  rotation.extractRotation(controller.matrixWorld);
  origin.setFromMatrixPosition(controller.matrixWorld);
  direction.set(0, 0, -1).applyMatrix4(rotation).normalize();
  return true;
}

/** Project existing graph node centers, including centers on the rectangle boundary. */
export function collectGraphNodesInRect(sceneModel, rect, point, project) {
  const ids = [];
  for (const id of sceneModel?.getNodeIds?.() ?? []) {
    const mesh = sceneModel.getNodeMeshById(id);
    if (!mesh?.getWorldPosition) continue;
    mesh.getWorldPosition(point);
    const client = project(point);
    if (client && client.x >= rect.left && client.x <= rect.right &&
        client.y >= rect.top && client.y <= rect.bottom) ids.push(id);
  }
  return ids;
}

/** Own the geometry for a camera-local marquee; gesture and selection remain with the host. */
export function createGraphMarqueeOverlay(THREE, camera, { color = 0x88a3c5, opacity = 0.94,
  renderOrder = 12000 } = {}) {
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(15), 3);
  geometry.setAttribute("position", position);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
    color, transparent: true, opacity, depthTest: false,
  }));
  line.visible = false;
  line.renderOrder = renderOrder;
  camera.add(line);
  return { line, geometry,
    show(start, end) {
      position.setXYZ(0, start.x, start.y, start.z);
      position.setXYZ(1, end.x, start.y, start.z);
      position.setXYZ(2, end.x, end.y, end.z);
      position.setXYZ(3, start.x, end.y, end.z);
      position.setXYZ(4, start.x, start.y, start.z);
      position.needsUpdate = true;
      line.visible = true;
    },
    hide() { line.visible = false; },
    dispose() { camera.remove(line); geometry.dispose(); line.material.dispose(); },
  };
}
