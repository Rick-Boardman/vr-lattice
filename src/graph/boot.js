// SPDX-License-Identifier: Apache-2.0
// Shared XR-safe renderer boot helpers for graph scenes.
// Goal: de-duplicate setup without changing scene behavior.

import { renderHudFrame } from "@rb/halo/src/frame-loop.js";
import { wireDesktopResize as wireSharedDesktopResize } from "@rb/halo/src/desktop-resize.js";

/**
 * Purpose: Detect whether the current browser user agent matches Oculus or Quest browser variants that need XR-safe renderer defaults.
 * Parameters: none.
 * @returns {boolean} True when the current user agent string matches OculusBrowser, MetaQuestBrowser, or Quest markers; otherwise false.
 * Side effects: none.
 */
export function detectOculusBrowser() {
  try {
    return /OculusBrowser|MetaQuestBrowser|Quest/i.test(navigator.userAgent || "");
  } catch {
    return false;
  }
}

/**
 * Purpose: Apply the canonical graph-scene renderer configuration for desktop and WebXR, including pixel-ratio capping, canvas-based sizing, SRGB output, and local-floor XR setup.
 * @param {object} [options] XR-safe renderer configuration.
 * @param {{ setPixelRatio: (value: number) => void, setSize: (width: number, height: number, updateStyle?: boolean) => void, outputColorSpace?: unknown, xr: { enabled: boolean, setReferenceSpaceType?: (type: string) => void, addEventListener?: (type: string, listener: () => void) => void } }} [options.renderer] Existing renderer to configure for graph-scene use.
 * @param {{ SRGBColorSpace?: unknown }} [options.THREE] Three.js namespace used for the SRGB output color space constant.
 * @param {HTMLCanvasElement} [options.canvas] Canvas whose client rect determines the desktop framebuffer size.
 * @param {number} [options.desktopMaxPixelRatio=2] Maximum desktop pixel ratio used when the browser is not an Oculus/Quest browser.
 * @param {number} [options.oculusMaxPixelRatio=2] Maximum desktop pixel ratio used when the browser is an Oculus/Quest browser.
 * @param {boolean} [options.isOculusBrowser=detectOculusBrowser()] Optional precomputed Oculus/Quest browser flag used to choose the pixel-ratio cap.
 * @returns {{ renderer: unknown, desktopPixelRatio: number }} The configured renderer plus the desktop pixel ratio that was applied.
 * Side effects: mutates renderer pixel ratio, framebuffer size, output color space, and XR reference-space settings, and installs a sessionend listener that restores the capped desktop pixel ratio.
 */
export function configureXrSafeRenderer({
  renderer,
  THREE,
  canvas,
  desktopMaxPixelRatio = 2,
  oculusMaxPixelRatio = 2,
  isOculusBrowser = detectOculusBrowser(),
} = {}) {
  if (!renderer) throw new Error("configureXrSafeRenderer: missing renderer");
  if (!THREE) throw new Error("configureXrSafeRenderer: missing THREE");
  if (!canvas) throw new Error("configureXrSafeRenderer: missing canvas");

  const maxRatio = isOculusBrowser ? oculusMaxPixelRatio : desktopMaxPixelRatio;
  const desktopPixelRatio = Math.min(window.devicePixelRatio || 1, maxRatio);

  renderer.setPixelRatio(desktopPixelRatio);
  // Size from the actual canvas client rect so HUD layout + renderer match.
  // (Some scenes use CSS to size the canvas; window.innerWidth can drift.)
  try {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width));
    const h = Math.max(1, Math.floor(r.height));
    renderer.setSize(w, h, false);
  } catch {
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  try {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } catch {
    // no-op
  }

  renderer.xr.enabled = true;
  try {
    renderer.xr.setReferenceSpaceType("local-floor");
  } catch {
    // no-op
  }

  renderer.xr.addEventListener?.("sessionend", () => {
    try {
      renderer.setPixelRatio(desktopPixelRatio);
    } catch {
      // no-op
    }
  });

  return { renderer, desktopPixelRatio };
}

/**
 * Purpose: Construct a canonical WebGL renderer for graph scenes and immediately apply the shared XR-safe renderer configuration.
 * @param {object} [options] Graph renderer construction options.
 * @param {{ WebGLRenderer: new (options: { canvas: HTMLCanvasElement, antialias: boolean, alpha: boolean }) => unknown, SRGBColorSpace?: unknown }} [options.THREE] Three.js namespace used to construct the renderer and provide the SRGB color space constant.
 * @param {HTMLCanvasElement} [options.canvas] Canvas bound to the created WebGLRenderer.
 * @param {boolean} [options.antialias=true] Whether the created renderer should enable antialiasing.
 * @param {boolean} [options.alpha=false] Whether the created renderer should use an alpha channel.
 * @param {number} [options.desktopMaxPixelRatio=2] Maximum desktop pixel ratio used when the browser is not an Oculus/Quest browser.
 * @param {number} [options.oculusMaxPixelRatio=2] Maximum desktop pixel ratio used when the browser is an Oculus/Quest browser.
 * @param {boolean} [options.isOculusBrowser=detectOculusBrowser()] Optional precomputed Oculus/Quest browser flag used to choose the pixel-ratio cap.
 * @returns {{ renderer: unknown, desktopPixelRatio: number }} The newly constructed renderer plus the desktop pixel ratio that was applied during configuration.
 * Side effects: allocates a new WebGLRenderer instance, mutates its framebuffer, output color space, and XR settings, and installs the same XR sessionend listener used by configureXrSafeRenderer.
 */
export function createXrRenderer({
  THREE,
  canvas,
  antialias = true,
  alpha = false,
  desktopMaxPixelRatio = 2,
  oculusMaxPixelRatio = 2,
  isOculusBrowser = detectOculusBrowser(),
} = {}) {
  if (!THREE) throw new Error("createXrRenderer: missing THREE");
  if (!canvas) throw new Error("createXrRenderer: missing canvas");

  const renderer = new THREE.WebGLRenderer({ canvas, antialias, alpha });
  return configureXrSafeRenderer({
    renderer,
    THREE,
    canvas,
    desktopMaxPixelRatio,
    oculusMaxPixelRatio,
    isOculusBrowser,
  });
}

/**
 * Purpose: Wire the shared desktop resize helper to graph-scene canvases so renderer sizing, camera projection, and optional HUD resize handling stay synchronized with the canvas client rect.
 * @param {object} [options] Resize wiring options.
 * @param {{ domElement?: HTMLCanvasElement, xr?: { isPresenting?: boolean } }} [options.renderer] Renderer whose canvas client rect drives resize calculations.
 * @param {{ aspect: number, updateProjectionMatrix: () => void }} [options.camera] Camera whose aspect ratio and projection matrix should update on desktop resize.
 * @param {{ handleResize?: () => void } | null} [options.hudSystem] Optional HUD system notified after resize updates complete.
 * @returns {() => void} Disposal function that removes the installed window resize listener.
 * Side effects: installs a window resize listener via the shared desktop-resize helper, mutates renderer size and camera projection on resize, and may invoke hudSystem.handleResize after each resize update.
 */
export function wireDesktopResize({ renderer, camera, hudSystem }) {
  if (!renderer) throw new Error("wireDesktopResize: missing renderer");
  if (!camera) throw new Error("wireDesktopResize: missing camera");

  const canvas = renderer.domElement;

  return wireSharedDesktopResize({
    renderer,
    camera,
    updateStyle: false,
    runImmediately: true,
    getSize: () => {
      try {
        const r = canvas.getBoundingClientRect();
        return {
          width: r.width,
          height: r.height,
        };
      } catch {
        return {
          width: window.innerWidth,
          height: window.innerHeight,
        };
      }
    },
    onResize: () => {
      try {
        hudSystem?.handleResize?.();
      } catch {
        // no-op
      }
    },
  });
}

/**
 * Purpose: Start the canonical asynchronous graph-scene boot loop that builds scene content once, renders each frame through the shared HUD pipeline, and optionally reports boot stage and FPS telemetry.
 * @param {object} [options] Async boot-loop configuration.
 * @param {{ Clock: new () => { getDelta(): number } }} [options.THREE] Three.js namespace used to allocate the per-frame Clock.
 * @param {{ setAnimationLoop: (callback: () => void) => void }} [options.renderer] Renderer that owns the animation loop.
 * @param {unknown} [options.scene] Scene rendered by the shared HUD frame loop.
 * @param {unknown} [options.camera] Camera rendered by the shared HUD frame loop.
 * @param {{ appendChatLine?: (entry: { text: string, color: number }) => void } | null} [options.hudSystem] Optional HUD system used for boot-failure chat diagnostics.
 * @param {{ update?: (dt?: number) => void, renderOverlay?: () => void } | null} [options.navigation] Optional navigation controller forwarded into renderHudFrame.
 * @param {() => void | Promise<void>} [options.build] Async or sync scene-build function invoked exactly once when the animation loop starts.
 * @param {string | null} [options.stageVar=null] Optional global window property name used to publish boot stage strings.
 * @param {string | null} [options.okVar=null] Optional global window property name used to publish a boolean success flag once frames are rendering.
 * @param {string} [options.stagePrefix="run"] Prefix applied to published boot-stage strings.
 * @param {((payload: { dt: number }) => void) | null} [options.onFrame=null] Optional per-frame callback invoked after renderHudFrame completes.
 * @param {number} [options.fpsWindowSeconds=0.5] Time window in seconds used to aggregate FPS samples before invoking onFps.
 * @param {((fps: number) => void) | null} [options.onFps=null] Optional callback invoked when the aggregated integer FPS value changes.
 * @returns {void} Does not return a value.
 * Side effects: installs a renderer animation loop, allocates a Three.Clock, executes the build function asynchronously, writes boot status flags onto window when configured, renders frames through renderHudFrame, logs build and callback errors to the console, and may append HUD chat diagnostics and FPS telemetry.
 */
export function startAsyncBootLoop({
  THREE,
  renderer,
  scene,
  camera,
  hudSystem,
  navigation,
  build,
  stageVar = null,
  okVar = null,
  stagePrefix = "run",
  onFrame = null,
  fpsWindowSeconds = 0.5,
  onFps = null,
} = {}) {
  if (!THREE) throw new Error("startAsyncBootLoop: missing THREE");
  if (!renderer) throw new Error("startAsyncBootLoop: missing renderer");
  if (!scene) throw new Error("startAsyncBootLoop: missing scene");
  if (!camera) throw new Error("startAsyncBootLoop: missing camera");
  if (typeof build !== "function") throw new Error("startAsyncBootLoop: missing build() function");

  let bootStarted = false;
  let bootFailed = false;
  let bootErrorShown = false;

  const clock = new THREE.Clock();
  let fpsAccumT = 0;
  let fpsFrames = 0;
  let fpsLastInt = 0;

  function setStage(s) {
    if (!stageVar) return;
    try {
      window[stageVar] = s;
    } catch {
      // no-op
    }
  }

  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();

    if (!bootStarted) {
      bootStarted = true;
      setStage(`${stagePrefix}:build-start`);
      Promise.resolve()
        .then(() => build())
        .catch((e) => {
          bootFailed = true;
          setStage(`${stagePrefix}:build-failed`);
          console.error("Graph scene build failed", e);
          try {
            hudSystem?.appendChatLine?.({
              text: `BUILD FAILED: ${e && e.message ? e.message : String(e)}`.slice(0, 160),
              color: 0xff6b6b,
            });
          } catch {
            // no-op
          }
        });
    }

    // Mark boot OK once we're actually drawing frames.
    if (okVar || stageVar) {
      try {
        if (okVar && !window[okVar]) {
          window[okVar] = true;
          setStage(`${stagePrefix}:anim-loop`);
        }
        if (!okVar && stageVar && !window[`${stageVar}_OK`]) {
          window[`${stageVar}_OK`] = true;
          setStage(`${stagePrefix}:anim-loop`);
        }
      } catch {
        // no-op
      }
    }

    renderHudFrame({ renderer, scene, camera, dt, hudSystem, navigation });

    try {
      onFrame?.({ dt });
    } catch (e) {
      console.warn("onFrame error", e);
    }

    if (bootFailed && !bootErrorShown) {
      bootErrorShown = true;
      try {
        hudSystem?.appendChatLine?.({ text: "Build failed (see SYSTEM LOG)", color: 0xff6b6b });
      } catch {
        // no-op
      }
    }

    if (typeof onFps === "function" && fpsWindowSeconds > 0) {
      fpsAccumT += dt;
      fpsFrames += 1;
      if (fpsAccumT >= fpsWindowSeconds) {
        const fps = Math.round(fpsFrames / fpsAccumT);
        if (fps !== fpsLastInt) {
          fpsLastInt = fps;
          try {
            onFps(fps);
          } catch {
            // no-op
          }
        }
        fpsAccumT = 0;
        fpsFrames = 0;
      }
    }

    // (render already happened above)
  });
}
