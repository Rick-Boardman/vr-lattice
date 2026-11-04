// SPDX-License-Identifier: Apache-2.0
// Config-driven runner for graph-style scenes.
// Intentionally small: centralizes common boot + context + picking plumbing.

import { createGraphSceneContext } from "./context.js";
import { startAsyncBootLoop } from "./boot.js";

/**
 * @typedef {Object} GraphSceneConfig
 * @property {string} name
 * @property {string} [canvasId]
 * @property {boolean} [isOculusBrowser]
 * @property {Object} [context] Options forwarded to createGraphSceneContext (except canvas/isOculusBrowser)
 * @property {(ctx: any) => Promise<void>} build
 * @property {(ctx: any, frame: {dt:number}) => void} [onFrame]
 * @property {(ctx: any, fps:number) => void} [onFps]
 * @property {number} [fpsWindowSeconds]
 * @property {string|null} [stageVar]
 * @property {string|null} [okVar]
 */

/**
 * Purpose: Create a graph-scene runtime context from a config object, start its async boot loop, and return the initialized shared context to the caller.
 * @param {GraphSceneConfig} config Graph-scene configuration describing the canvas, runtime context options, async build step, and optional frame/fps hooks.
 * @returns {Promise<{ THREE: object, isOculusBrowser: boolean, renderer: object, desktopPixelRatio: number, scene: object, camera: object, rig: { player: object, playerYaw: object, playerPitch: object, head: object }, look: { state: object, applyLook: Function }, navigation: object, hudSystem: object, controllers: object, setWorldControlsEnabled: Function, getWorldControlsEnabled: Function, dispose: () => void }>} Graph-scene context returned by createGraphSceneContext.
 * Side effects: looks up the configured canvas in the DOM, creates the graph-scene context, starts the async boot/render loop, and invokes the configured build, frame, and fps callbacks.
 */
export async function runGraphScene(config) {
  if (!config || typeof config !== "object") throw new Error("runGraphScene: missing config");
  if (typeof config.build !== "function") throw new Error("runGraphScene: missing config.build(ctx)");

  const canvasId = config.canvasId || "c";
  const canvas = document.getElementById(canvasId);
  if (!canvas) throw new Error(`runGraphScene: missing canvas#${canvasId}`);

  const ctx = createGraphSceneContext({
    ...(config.context || {}),
    canvas,
    isOculusBrowser: !!config.isOculusBrowser,
  });

  startGraphSceneBoot({
    ctx,
    build: () => config.build(ctx),
    stageVar: config.stageVar ?? null,
    okVar: config.okVar ?? null,
    fpsWindowSeconds: Number.isFinite(config.fpsWindowSeconds) ? config.fpsWindowSeconds : 0.5,
    onFrame: (frame) => {
      try {
        config.onFrame?.(ctx, frame);
      } catch (e) {
        console.warn("Graph scene onFrame error", e);
      }
    },
    onFps: typeof config.onFps === "function" ? (fps) => config.onFps(ctx, fps) : null,
  });

  return ctx;
}

/**
 * Purpose: Start the shared async boot/render loop for an already-created graph-scene context.
 * @param {object} [options] Boot-loop options.
 * @param {{ THREE: object, renderer: object, scene: object, camera: object, hudSystem: object, navigation: object }} [options.ctx] Graph-scene context returned by createGraphSceneContext.
 * @param {(ctx: object) => Promise<void> | void} [options.build] Async build callback invoked before the steady-state render loop begins.
 * @param {(frame: { dt: number }) => void | null} [options.onFrame=null] Optional per-frame callback.
 * @param {(fps: number) => void | null} [options.onFps=null] Optional callback invoked with rolling FPS samples.
 * @param {number} [options.fpsWindowSeconds=0.5] FPS sampling window in seconds.
 * @param {string | null} [options.stageVar=null] Optional global variable name used to expose boot stages.
 * @param {string | null} [options.okVar=null] Optional global variable name used to expose boot success.
 * @param {string} [options.stagePrefix="run"] Prefix applied to boot-stage names.
 * @returns {void}
 * Side effects: starts the async boot loop through startAsyncBootLoop, which mutates renderer/HUD/navigation frame state and may publish boot-stage globals when requested.
 */
export function startGraphSceneBoot({
  ctx,
  build,
  onFrame = null,
  onFps = null,
  fpsWindowSeconds = 0.5,
  stageVar = null,
  okVar = null,
  stagePrefix = "run",
} = {}) {
  if (!ctx) throw new Error("startGraphSceneBoot: missing ctx");
  if (typeof build !== "function") throw new Error("startGraphSceneBoot: missing build(ctx) function");

  return startAsyncBootLoop({
    THREE: ctx.THREE,
    renderer: ctx.renderer,
    scene: ctx.scene,
    camera: ctx.camera,
    hudSystem: ctx.hudSystem,
    navigation: ctx.navigation,
    build: () => build(ctx),
    stageVar,
    okVar,
    stagePrefix,
    onFrame,
    onFps,
    fpsWindowSeconds,
  });
}
