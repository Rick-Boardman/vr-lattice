// SPDX-License-Identifier: Apache-2.0
import {
  createHudAppearancePreference,
  resolveHudAppearancePreference,
  installHudAppearanceSettings,
  createHudAppearanceSettingsHotbarItem,
} from "@rb/halo/src/hud-appearance.js";

const installed = new WeakMap();
const DEFAULT_STORAGE_KEY = "lattice:panel-theme";
const DEFAULT_WINDOW_KEY = "lattice-settings";
const isMode = value => value === "light" || value === "dark";

function preferenceOptions({storageKey=DEFAULT_STORAGE_KEY,legacyStorageKeys,initialMode,platform=globalThis}={}) {
  return {storageKey,legacyStorageKeys,initialMode,platform};
}

/** Resolve effective color before boot without starting subscriptions or a HUD window. */
export function resolveGraphPanelTheme(options = {}) {
  return resolveHudAppearancePreference(preferenceOptions(options)).mode;
}

/** Standard Settings item for app hotbar slots; callers own the icon's lifecycle. */
export function createGraphSettingsHotbarItem(options) {
  return createHudAppearanceSettingsHotbarItem(options);
}

/**
 * Install one graph-scene preference binding. Retains the old installer name and
 * explicit setTheme() bridge. Settings is closable and remains hidden until opened.
 */
export function installGraphPanelThemeControl(ctx, options = {}) {
  const hud = ctx?.hudSystem;
  if (typeof ctx?.setPanelTheme!=="function" || typeof hud?.createWindow!=="function" ||
      typeof hud?.setWindowLines!=="function") return null;
  if (installed.has(ctx)) return installed.get(ctx);
  const {windowKey=DEFAULT_WINDOW_KEY,title="Settings",x,y,settings=true,keyboardShortcutTarget,platform=globalThis,preference:external}=options;
  const pref = external ?? createHudAppearancePreference(preferenceOptions(options));
  let current;
  let disposed = false;
  const apply = mode => {
    if (disposed || !isMode(mode)) return false;
    if (current!==mode || ("panelTheme" in ctx && ctx.panelTheme!==mode)) {
      current=mode;
      ctx.setPanelTheme(mode);
    }
    return true;
  };
  const unsubscribe=pref.subscribe(({mode})=>apply(mode));
  const frame={};
  if(Number.isFinite(x)) frame.x=x;
  if(Number.isFinite(y)) frame.y=y;
  const panel=settings===false ? null : installHudAppearanceSettings(hud,{
    preference:pref,windowKey,title,platform,frame,keyboardShortcutTarget,
  });
  let detachDispose;
  const control={
    get mode(){return current;},
    get preference(){return pref.getPreference();},
    get settingsOpen(){return panel?.isOpen() ?? false;},
    openSettings:options=>panel?.open(options) ?? false,
    closeSettings:options=>panel?.close(options) ?? false,
    toggleSettings:options=>panel?.toggle(options) ?? false,
    setPreference(next) {
      if(disposed || !["system","light","dark"].includes(next)) return false;
      pref.setPreference(next);
      apply(pref.getMode());
      return true;
    },
    setTheme(mode,{persist=false}={}) {
      if(disposed || (!isMode(mode) && mode!=="system")) return false;
      return persist || mode==="system" ? control.setPreference(mode) : apply(mode);
    },
    dispose() {
      if(disposed) return;
      disposed=true;
      detachDispose?.();
      unsubscribe?.();
      panel?.dispose();
      if(!external) pref.dispose();
      installed.delete(ctx);
    },
  };
  installed.set(ctx,control);
  detachDispose=ctx.onDispose?.(control.dispose);
  apply(pref.getMode());
  return control;
}
