// SPDX-License-Identifier: Apache-2.0
/**
 * The business look and the simple connection model of a graph board, in one place for Conduit, Loom and Insight.
 * Colours are the Halo "business" theme's family; change them here and every board follows.
 */
export const BUSINESS_BOARD_HUD_THEME = "business";

/** Spread into `createCardGraphScene({ style })`: straight connections from outline to outline. */
export const BUSINESS_BOARD_SCENE_STYLE = Object.freeze({
  flatActionEdgeAnchorMode: "nearest-surface",
  flatObstacleDetourEnabled: true,
});

/**
 * Spread into `createCardGraphScene(...)`: no connector points on the board, every edge an ordinary connection.
 * Ports stay in documents and inspectors, and saved data edges are untouched.
 */
export const BUSINESS_BOARD_SCENE_ACCESSORS = Object.freeze({
  getInputPorts: () => [],
  getOutputPorts: () => [],
  getEdgeClass: () => "action",
});

const NEUTRAL_SLOT_COLORS = Object.freeze({
  bgColor: 0x1c2836,
  activeBgColor: 0x2a4a6e,
  outlineColor: 0x33445a,
  activeOutlineColor: 0x6ea6e0,
  textColor: 0xdbe5ef,
  activeTextColor: 0xffffff,
});

/** Toolbar slot colours: one neutral set; only an active Stop is red. */
export const BUSINESS_HOTBAR_SLOT_COLORS = Object.freeze({
  primary: NEUTRAL_SLOT_COLORS,
  execution: NEUTRAL_SLOT_COLORS,
  danger: Object.freeze({ ...NEUTRAL_SLOT_COLORS, activeBgColor: 0x7f2f35, activeOutlineColor: 0xd98a90 }),
  utility: NEUTRAL_SLOT_COLORS,
  rotation: NEUTRAL_SLOT_COLORS,
  mode: NEUTRAL_SLOT_COLORS,
  spacer: Object.freeze({ textColor: 0x4d5e72 }),
});

export const BUSINESS_PANEL_COLORS = Object.freeze({
  actionButtonBg: 0x263446,
  actionButtonActiveBg: 0x2f5f94,
  actionButtonDestructiveBg: 0x8a3339,
  paletteSection: 0x8fa3b8,
  paletteRowBg: 0x1c2836,
  paletteRowActiveBg: 0x2a4a6e,
  hotbarHeader: 0xaebccb,
  hotbarStatusText: 0xdfe7f0,
});

/**
 * @param {{ running?: boolean, dirty?: boolean }} state Document state.
 * @returns {number} Background colour of the toolbar's status badge.
 */
export function resolveBusinessHotbarStatusColor({ running = false, dirty = false } = {}) {
  if (running) return 0x2a4a6e;
  return dirty ? 0x6b5a2a : 0x263446;
}

/**
 * The line that shows a connection is being made: from the source node's outline to the pointer, or to a target node.
 * Call `update()` once a frame; it does nothing while no connection is in progress. Not drawn in VR.
 *
 * @param {object} options
 * @param {object} options.renderer Three.js renderer.
 * @param {object} options.camera Scene camera.
 * @param {object} options.raycaster A Three.js raycaster to reuse.
 * @param {object} options.pointerNdc A Three.js Vector2 to reuse.
 * @param {() => object | null} options.getScene The current scene model (`setEdgePreview`).
 * @param {() => string | null} options.getSourceId The node a connection is being drawn from.
 * @param {(clientX: number, clientY: number) => object | null} options.pickHit The graph hit under a client point.
 * @returns {{ update: () => void, dispose: () => void }} Frame update and cleanup.
 */
export function createBoardEdgePreview({ renderer, camera, raycaster, pointerNdc, getScene, getSourceId, pickHit }) {
  const pointer = { x: 0, y: 0, known: false };

  function remember(event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.known = true;
    // Embedded in a page, a click here does not give this frame the keyboard, and Esc has to reach it.
    if (event.type === "pointerdown") window.focus();
  }

  function pointerNdcFromClient() {
    const rect = renderer.domElement.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return false;
    pointerNdc.set(((pointer.x - rect.left) / rect.width) * 2 - 1, -(((pointer.y - rect.top) / rect.height) * 2 - 1));
    return true;
  }

  function update() {
    const scene = getScene();
    if (!scene?.setEdgePreview) return;
    const sourceId = getSourceId();
    if (!sourceId || !pointer.known || renderer.xr?.isPresenting) {
      scene.setEdgePreview(null);
      return;
    }
    const hit = pickHit(pointer.x, pointer.y);
    if (!pointerNdcFromClient()) {
      scene.setEdgePreview(null);
      return;
    }
    raycaster.setFromCamera(pointerNdc, camera);
    scene.setEdgePreview({
      fromId: sourceId,
      ray: raycaster.ray,
      targetId: hit?.kind === "node" || hit?.kind === "action-handle" ? hit.id : null,
    });
  }

  window.addEventListener("pointermove", remember, { capture: true, passive: true });
  window.addEventListener("pointerdown", remember, { capture: true, passive: true });
  return {
    update,
    dispose() {
      window.removeEventListener("pointermove", remember, { capture: true });
      window.removeEventListener("pointerdown", remember, { capture: true });
    },
  };
}
