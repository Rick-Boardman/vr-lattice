// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHudAppearancePreference } from "@rb/halo/src/hud-appearance.js";
import { installGraphPanelThemeControl, resolveGraphPanelTheme, createGraphSettingsHotbarItem } from "../src/graph/panel-theme-control.js";

function fixture(){
  const modes=[], stored=new Map(), windows={}, listeners=new Set(), cleanup=new Set();
  const query={
    matches:true,
    addEventListener(type,callback){assert.equal(type,"change");listeners.add(callback);},
    removeEventListener(type,callback){assert.equal(type,"change");listeners.delete(callback);},
  };
  let lines=[];
  const platform={
    localStorage:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)},
    matchMedia:()=>query,
  };
  const ctx={
    setPanelTheme(mode){modes.push(mode);this.panelTheme=mode;},
    onDispose(listener){cleanup.add(listener);return ()=>cleanup.delete(listener);},
    hudSystem:{
      hud:{ui:{windows}},
      createWindow:(key,options)=>windows[key]=options,
      setWindowLines:(key,value)=>{assert.ok(windows[key]);lines=value;},
      destroyWindow:key=>delete windows[key],
    },
  };
  return {ctx,platform,modes,stored,windows,listeners,cleanup,get lines(){return lines;},
    system(matches){query.matches=matches;for(const cb of listeners)cb({matches});}};
}

test("lazy closable Settings follows System and retains legacy nonpersisted bridge",()=>{
  const f=fixture(),opts={storageKey:"example:theme",platform:f.platform};
  assert.equal(resolveGraphPanelTheme(opts),"light");
  assert.equal(resolveGraphPanelTheme({...opts,initialMode:"dark"}),"dark");
  const settings=installGraphPanelThemeControl(f.ctx,opts);
  assert.equal(installGraphPanelThemeControl(f.ctx,opts),settings);
  assert.equal(settings.preference,"system");
  assert.equal(settings.mode,"light");
  assert.deepEqual(f.windows,{});
  assert.equal(f.listeners.size,1);
  assert.equal(settings.openSettings(),true);
  assert.equal(f.windows["lattice-settings"].closeable,true);
  assert.equal(f.windows["lattice-settings"].title,"Settings");
  assert.deepEqual(f.lines.map(x=>x.text),["Appearance","System (Light)","Light","Dark"]);

  f.system(false);
  assert.equal(settings.mode,"dark");
  assert.equal(f.stored.size,0);
  f.lines[2].actionButtonOnClick();
  assert.equal(f.stored.get(opts.storageKey),"light");
  assert.equal(settings.preference,"light");
  f.system(false);
  assert.equal(settings.mode,"light");
  assert.equal(settings.setTheme("dark"),true);
  assert.equal(settings.preference,"light");
  assert.equal(f.stored.get(opts.storageKey),"light");
  assert.equal(settings.setTheme("purple"),false);
  f.windows["lattice-settings"].onClose();
  assert.deepEqual(f.windows,{});
  assert.equal(settings.setPreference("system"),true);
  assert.equal(settings.preference,"system");
  f.system(true);
  assert.equal(settings.mode,"light");
  assert.equal(f.stored.get(opts.storageKey),"system");
  for(const cleanup of f.cleanup)cleanup();
  assert.equal(f.listeners.size,0);
});

test("legacy per-app key migration and opt-out do not create duplicate settings/listeners",()=>{
  const f=fixture();
  f.stored.set("old-key","dark");
  const opts={storageKey:"new-key",legacyStorageKeys:["old-key"],platform:f.platform};
  assert.equal(resolveGraphPanelTheme(opts),"dark");
  assert.equal(f.stored.has("new-key"),false,"startup resolve is read-only");
  const external=createHudAppearancePreference(opts);
  const control=installGraphPanelThemeControl(f.ctx,{...opts,preference:external,settings:false});
  assert.equal(f.stored.get("new-key"),"dark");
  assert.equal(control.preference,"dark");
  assert.equal(control.openSettings(),false);
  assert.equal(f.listeners.size,1,"external shared preference not redeclared");
  control.dispose();
  assert.equal(f.listeners.size,1,"host still owns its preference");
  assert.deepEqual(f.windows,{});
  assert.equal(createGraphSettingsHotbarItem({platform:f.platform}).tooltip,"Settings: Appearance");
  external.dispose();
  assert.equal(f.listeners.size,0);
});

test("old contexts do not create an unusable control",()=>{
  assert.equal(installGraphPanelThemeControl({}),null);
});
