// SPDX-License-Identifier: Apache-2.0
/**
 * Create a shared flat board backdrop for front-facing graph surfaces.
 * Purpose: give flat graph apps a reusable runtime-owned pane behind their cards without relying on app-local DOM or floor-grid hacks.
 * @param {object} [options={}] Backdrop inputs.
 * @param {any} options.THREE Three.js namespace used to allocate geometry, materials, and groups.
 * @param {{ add?: Function, remove?: Function }} options.parent Parent object that receives the backdrop root.
 * @param {"xy" | "xz" | string} [options.plane="xy"] Plane orientation for the backdrop.
 * @param {number} [options.width=180] Backdrop width in world units.
 * @param {number} [options.height=110] Backdrop height in world units.
 * @param {number} [options.depthOffset=-0.18] Offset applied backward along the plane normal so the pane sits behind the graph content.
 * @param {number} [options.color=0x0f1621] Surface tint color.
 * @param {number} [options.opacity=0.22] Surface opacity.
 * @param {number} [options.borderColor=0x28415d] Border tint color.
 * @param {number} [options.borderOpacity=0.64] Border opacity.
 * @returns {{ root: any, setVisible: (nextVisible: boolean) => void, dispose: () => void }} Runtime backdrop controller.
 * Side effects: allocates a plane mesh and outline, adds them to the provided parent, and disposes them when torn down.
 */
export function createFlatBoardBackdrop({
  THREE,
  parent,
  plane = "xy",
  width = 180,
  height = 110,
  depthOffset = -0.18,
  color = 0x0f1621,
  opacity = 0.22,
  borderColor = 0x28415d,
  borderOpacity = 0.64,
} = {}) {
  if (!THREE) throw new Error("createFlatBoardBackdrop: THREE is required");
  if (!parent?.add) throw new Error("createFlatBoardBackdrop: parent with add(...) is required");

  const resolvedPlane = String(plane ?? "xy").trim().toLowerCase() === "xz" ? "xz" : "xy";
  const root = new THREE.Group();
  root.name = "flatBoardBackdrop";

  const surfaceGeometry = new THREE.PlaneGeometry(width, height);
  const borderGeometry = new THREE.EdgesGeometry(surfaceGeometry);
  const surfaceMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: true,
  });
  const borderMaterial = new THREE.LineBasicMaterial({
    color: borderColor,
    transparent: true,
    opacity: borderOpacity,
  });

  const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
  const border = new THREE.LineSegments(borderGeometry, borderMaterial);
  border.renderOrder = 1;

  root.add(surface);
  root.add(border);

  if (resolvedPlane === "xz") {
    root.rotation.x = -Math.PI * 0.5;
    root.position.y = depthOffset;
  } else {
    root.position.z = depthOffset;
  }

  parent.add(root);

  return {
    root,
    setVisible(nextVisible) {
      root.visible = !!nextVisible;
    },
    dispose() {
      parent.remove?.(root);
      surfaceGeometry.dispose?.();
      borderGeometry.dispose?.();
      surfaceMaterial.dispose?.();
      borderMaterial.dispose?.();
    },
  };
}
