// SPDX-License-Identifier: Apache-2.0
import * as THREE_NS from "three";
import {
  createSceneHudBootstrap,
} from "@rb/halo/src/core.js";
import { DEFAULT_SCENE_RIG_PITCH_CLAMP_EPSILON_RAD } from "@rb/halo/src/rig.js";
import { clamp } from "@rb/halo/src/scalar-math.js";

import { configureXrSafeRenderer, wireDesktopResize } from "./boot.js";
import { applyStandardGraphHudLayout, hideDefaultDemoWindows, ensureGraphHudWindows } from "./hud-layout.js";

/**
 * Purpose: Create the shared graph-scene runtime context by wiring Three.js scene state, the scene HUD bootstrap, graph HUD layout defaults, and resize handling into one reusable composition root.
 * @param {object} [options] Graph-scene context options.
 * @param {object} [options.THREE=THREE_NS] Three.js namespace used to allocate scene, camera, lights, math objects, and renderer-facing types.
 * @param {HTMLCanvasElement} [options.canvas] Canvas used by the graph scene renderer.
 * @param {boolean} [options.isOculusBrowser=false] Whether the current browser should use the Oculus-specific renderer pixel-ratio cap.
 * @param {object} [options.renderer] Renderer configuration.
 * @param {boolean} [options.renderer.antialias=true] Whether renderer antialiasing is enabled.
 * @param {boolean} [options.renderer.alpha=false] Whether the renderer uses an alpha channel.
 * @param {number} [options.renderer.desktopMaxPixelRatio=2] Desktop pixel-ratio cap applied by configureXrSafeRenderer.
 * @param {number} [options.renderer.oculusMaxPixelRatio=2] Oculus-browser pixel-ratio cap applied by configureXrSafeRenderer.
 * @param {object} [options.scene] Scene appearance configuration.
 * @param {number} [options.scene.background=0x0a0e27] Scene background color.
 * @param {boolean} [options.scene.fog=true] Whether the scene has distance fog. A flat board that the view backs away from to fit should not: its content fades as the view widens.
 * @param {number} [options.scene.fogColor=0x0a0e27] Fog color.
 * @param {number} [options.scene.fogNear=55] Fog near distance.
 * @param {number} [options.scene.fogFar=260] Fog far distance.
 * @param {object} [options.camera] Perspective-camera configuration.
 * @param {number} [options.camera.fov=70] Camera vertical field of view in degrees.
 * @param {number} [options.camera.near=0.05] Camera near clip plane.
 * @param {number} [options.camera.far=700] Camera far clip plane.
 * @param {object} [options.rig] Scene-rig configuration.
 * @param {object} [options.rig.desktopStartPos] Desktop player start position.
 * @param {object} [options.rig.vrStartPos] VR player start position applied on VR entry.
 * @param {number} [options.rig.initialYaw=0] Initial rig yaw in radians.
 * @param {number} [options.rig.initialPitch=0] Initial rig pitch in radians.
 * @param {"clamp" | "wrap"} [options.rig.pitchMode="wrap"] Pitch-handling mode forwarded to the scene rig.
 * @param {number} [options.rig.pitchClampEps=DEFAULT_SCENE_RIG_PITCH_CLAMP_EPSILON_RAD] Clamp epsilon used when pitchMode is `clamp`.
 * @param {boolean} [options.rig.vrPivotCompensation=false] Whether VR turning compensates for head-pivot offset.
 * @param {object} [options.hud] HUD-system configuration.
 * @param {number} [options.hud.xrFramebufferScaleFactor=0.7] XR framebuffer scale factor for HUD rendering.
 * @param {object | null} [options.hud.vrAnchor=null] Optional explicit VR anchor override for the HUD.
 * @param {number} [options.hud.vrLayoutW=1800] VR HUD layout width.
 * @param {number} [options.hud.vrLayoutH=1000] VR HUD layout height.
 * @param {number} [options.hud.vrScaleW=11.0] VR HUD world-space width scale.
 * @param {number} [options.hud.vrScaleH=6.1] VR HUD world-space height scale.
 * @param {number} [options.hud.vrDistance=4.4] VR HUD distance from the rig anchor.
 * @param {number} [options.hud.vrYOffset=-0.32] VR HUD vertical offset.
 * @param {string} [options.hud.windowClampMode="none"] HUD window clamp mode.
 * @param {number} [options.hud.hotbarSlotCount=4] Hotbar slot count forwarded to the HUD system.
 * @param {Array<unknown> | null} [options.hud.hotbarTooltips=null] Optional hotbar tooltip lines.
 * @param {boolean} [options.hud.reserveSystemHotbarSlots=true] Whether the shared debug/help hotbar tail stays reserved.
 * @param {string | object} [options.hud.theme] HUD window theme preset name or override bag ("professional" when left out).
 * @param {string} [options.hud.uiPreset="default"] HUD window preset string forwarded to the shared HUD bootstrap.
 * @param {Array<string> | null} [options.hud.visibleWindowKeys=null] Optional list of shared Halo panel keys that should exist for this graph scene.
 * @param {Array<string> | null} [options.hud.hiddenWindowKeys=null] Optional list of shared Halo panel keys that should start hidden.
 * @param {string} [options.hud.statusMode="text"] HUD status display mode.
 * @param {boolean} [options.hud.enableDesktopContextMenu=true] Whether desktop right-click should open the shared HUD context menu.
 * @param {(slotIndex: number) => void | null} [options.hud.onHotbarSlot=null] Optional hotbar-slot callback.
 * @param {() => void | null} [options.hud.onEnterVR=null] Optional VR-entry callback.
 * @param {() => void | null} [options.hud.onExitVR=null] Optional VR-exit callback.
 * @param {boolean} [options.hud.showControllerRays=true] Whether HUD bootstrap should show controller rays.
 * @param {boolean} [options.hud.applyStandardLayout=true] Whether the canonical graph HUD layout should be applied.
 * @param {boolean} [options.hud.hideDemoWindows=true] Whether default demo windows should be hidden after HUD creation.
 * @param {boolean} [options.hud.ensureHelpWindow=true] Whether the shared graph HELP window should be created.
 * @param {boolean} [options.hud.ensureSelectionWindow=true] Whether the shared graph TARGET/selection window should be created.
 * @param {object} [options.navigation] Additional navigation options forwarded to createSceneHudBootstrap.
 * @param {object} [options.lights] Scene-light configuration.
 * @param {{ sky?: number, ground?: number, intensity?: number } | null} [options.lights.hemisphere={ sky: 0xffffff, ground: 0x223344, intensity: 0.7 }] Optional hemisphere-light configuration.
 * @param {{ color?: number, intensity?: number, pos?: number[] } | null} [options.lights.directional={ color: 0xffffff, intensity: 0.95, pos: [6, 10, 3] }] Optional directional-light configuration.
 * @returns {{ THREE: object, isOculusBrowser: boolean, renderer: object, desktopPixelRatio: number, scene: object, camera: object, rig: { player: object, playerYaw: object, playerPitch: object, head: object }, look: { state: object, getYaw: Function, setYaw: Function, getPitch: Function, setPitch: Function, applyLook: Function }, navigation: object, hudSystem: object, controllers: object, setWorldControlsEnabled: Function, getWorldControlsEnabled: Function, dispose: () => void }} Graph-scene runtime context exposing the configured scene, camera, rig nodes, HUD system, navigation, controller handles, and teardown hook.
 * Side effects: creates scene, camera, lights, renderer/HUD/navigation state, adds rig nodes and lights to the scene, may hide or create HUD windows, wires a desktop resize handler, and mutates player position on VR enter/exit when default callbacks are used.
 */
export function createGraphSceneContext({
  // Allow injecting a THREE instance for testing, but default to the application-provided package instance.
  THREE = THREE_NS,
  canvas,
  isOculusBrowser = false,

  renderer: {
    antialias = true,
    alpha = false,
    desktopMaxPixelRatio = 2,
    oculusMaxPixelRatio = 2,
  } = {},

  scene: {
    background = 0x0a0e27,
    fog = true,
    fogColor = 0x0a0e27,
    fogNear = 55,
    fogFar = 260,
  } = {},

  camera: { fov = 70, near = 0.05, far = 700 } = {},

  rig: {
    desktopStartPos = new THREE.Vector3(0, 6, 26),
    vrStartPos = new THREE.Vector3(0, 0, 0),
    initialYaw = 0,
    initialPitch = 0,
    pitchMode = "wrap", // 'clamp' | 'wrap'
    pitchClampEps = DEFAULT_SCENE_RIG_PITCH_CLAMP_EPSILON_RAD,
    // Graph scenes prefer pure rotation (no translation) when turning in VR.
    // This avoids the visible "arc" caused by head-pivot compensation.
    vrPivotCompensation = false,
  } = {},

  hud: {
    xrFramebufferScaleFactor = 0.7,
    vrAnchor = null,
    // Increased VR layout to give more spacing between HUD panels
    vrLayoutW = 1800,
    vrLayoutH = 1000,
    vrScaleW = 11.0,
    vrScaleH = 6.1,
    vrDistance = 4.4,
    vrYOffset = -0.32,
    windowClampMode = "none",
    hotbarSlotCount = 4,
    hotbarTooltips = null,
    reserveSystemHotbarSlots = true,
    theme: hudTheme = undefined,
    uiPreset = "default",
    visibleWindowKeys = null,
    hiddenWindowKeys = null,
    statusMode = "text",
    enableDesktopContextMenu = true,
    onHotbarSlot = null,
    onEnterVR = null,
    onExitVR = null,
    showControllerRays = true,
    applyStandardLayout = true,
    hideDemoWindows = true,
    ensureHelpWindow = true,
    ensureSelectionWindow = true,
  } = {},

  navigation: navigationOptions = {},

  lights: {
    hemisphere = { sky: 0xffffff, ground: 0x223344, intensity: 0.7 },
    directional = { color: 0xffffff, intensity: 0.95, pos: [6, 10, 3] },
  } = {},
} = {}) {
  if (!canvas) throw new Error("createGraphSceneContext: missing canvas");

  // Graph scenes are config-driven; preserve the configured VR start position.
  // Note: createSceneHudBootstrap has a generic default (0,0,0) that is correct
  // for the Demo harness, but wrong for graphs that expect a staged starting location.
  let _playerRef = null;
  const _desktopStartPosRef = desktopStartPos;
  const _vrStartPosRef = vrStartPos;

  let desktopPixelRatio = 1;

  const sceneObj = new THREE.Scene();
  sceneObj.background = new THREE.Color(background);
  sceneObj.fog = fog ? new THREE.Fog(fogColor, fogNear, fogFar) : null;

  const cameraObj = new THREE.PerspectiveCamera(
    fov,
    (() => {
      try {
        const r = canvas.getBoundingClientRect();
        const w = Math.max(1, Math.floor(r.width));
        const h = Math.max(1, Math.floor(r.height));
        return w / h;
      } catch {
        return window.innerWidth / window.innerHeight;
      }
    })(),
    near,
    far
  );

  const {
    renderer,
    rig: rigNodes,
    look,
    hudSystem,
    navigation,
    setWorldControlsEnabled,
    getWorldControlsEnabled,
  } = createSceneHudBootstrap({
    THREE,
    canvas,
    rendererOptions: { antialias, alpha },
    configureRenderer: (r) => {
      desktopPixelRatio = configureXrSafeRenderer({
        renderer: r,
        THREE,
        canvas,
        desktopMaxPixelRatio,
        oculusMaxPixelRatio,
        isOculusBrowser,
      }).desktopPixelRatio;
    },
    scene: sceneObj,
    rigOptions: {
      camera: cameraObj,
      desktopStartPos,
      initialYaw,
      initialPitch,
      pitchMode,
      pitchClampEps,
      vrPivotCompensation,
      addToScene: true,
    },
    hudOptions: {
      // Graph scenes wire their own renderer/camera resize; avoid double handlers.
      autoHandleResize: false,
      showControllerRays,
      xrFramebufferScaleFactor,
      // Prefer the canonical pitch anchor for HUD/controllers.
      // If a caller passes vrAnchor, allow it explicitly.
      ...(vrAnchor ? { vrAnchor } : {}),
      vrLayoutW,
      vrLayoutH,
      vrScaleW,
      vrScaleH,
      vrDistance,
      vrYOffset,
      windowClampMode,
      hotbarSlotCount,
      hotbarTooltips: Array.isArray(hotbarTooltips) ? hotbarTooltips : undefined,
      theme: hudTheme,
      reserveSystemHotbarSlots,
      uiPreset,
      visibleWindowKeys: Array.isArray(visibleWindowKeys) ? visibleWindowKeys : undefined,
      hiddenWindowKeys: Array.isArray(hiddenWindowKeys) ? hiddenWindowKeys : undefined,
      statusMode,
      enableDesktopContextMenu,
      onHotbarSlot: onHotbarSlot || undefined,
      onEnterVR:
        onEnterVR ||
        (() => {
          try {
            _playerRef?.position?.copy?.(_vrStartPosRef);
          } catch {
            // no-op
          }
        }),
      onExitVR:
        onExitVR ||
        (() => {
          try {
            _playerRef?.position?.copy?.(_desktopStartPosRef);
          } catch {
            // no-op
          }
        }),
    },
    navigationOptions: {
      isEnabled: () => getWorldControlsEnabled(),
      isTyping: () => false,
      ...navigationOptions,
    },
  });

  const { player, playerYaw, playerPitch, head } = rigNodes;
  _playerRef = player;

  // Lighting defaults (can be modified by callers after creation if needed)
  if (hemisphere) {
    sceneObj.add(new THREE.HemisphereLight(hemisphere.sky, hemisphere.ground, hemisphere.intensity));
  }
  if (directional) {
    const d = new THREE.DirectionalLight(directional.color, directional.intensity);
    const p = Array.isArray(directional.pos) ? directional.pos : [6, 10, 3];
    d.position.set(p[0] || 0, p[1] || 0, p[2] || 0);
    sceneObj.add(d);
  }

  if (hideDemoWindows) hideDefaultDemoWindows(hudSystem);
  // Create help + selection windows before layout (they may not exist in the default HUD).
  ensureGraphHudWindows(hudSystem, {
    ensureHelpWindow,
    ensureSelectionWindow,
  });
  if (applyStandardLayout) applyStandardGraphHudLayout(hudSystem);

  const unwireResize = wireDesktopResize({ renderer, camera: cameraObj, hudSystem });

  return {
    THREE,
    isOculusBrowser,
    renderer,
    desktopPixelRatio,
    scene: sceneObj,
    camera: cameraObj,
    rig: { player, playerYaw, playerPitch, head },
    look: {
      state: look.state,
      getYaw: look.getYaw,
      setYaw: look.setYaw,
      getPitch: look.getPitch,
      setPitch: look.setPitch,
      applyLook: look.applyLook,
    },
    navigation,
    hudSystem,
    controllers: hudSystem.controllers,
    setWorldControlsEnabled,
    getWorldControlsEnabled,
    dispose: () => {
      try {
        unwireResize?.();
      } catch {
        // no-op
      }
    },
  };
}
