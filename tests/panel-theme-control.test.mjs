// SPDX-License-Identifier: Apache-2.0
import { test } from "node:test";
import assert from "node:assert/strict";
import { installGraphPanelThemeControl, resolveGraphPanelTheme } from "../src/graph/panel-theme-control.js";

test("HUD selector follows system, applies native actions, persists explicit choice and disposes", () => {
  const modes = [];
  const stored = new Map();
  const windows = new Map();
  let listener;
  let lines;
  const query = {
    matches: true,
    addEventListener(type, callback) { assert.equal(type, "change"); listener = callback; },
    removeEventListener(type, callback) { assert.equal(type, "change"); assert.equal(callback, listener); listener = null; },
  };
  const platform = {
    localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) },
    matchMedia: () => query,
  };
  const ctx = {
    setPanelTheme: mode => modes.push(mode),
    hudSystem: {
      createWindow: (key, options) => windows.set(key, options),
      setWindowLines: (key, value) => { assert.ok(windows.has(key)); lines = value; },
      destroyWindow: key => windows.delete(key),
    },
  };
  const options = { storageKey: "example:theme", platform };
  assert.equal(resolveGraphPanelTheme(options), "light");
  assert.equal(resolveGraphPanelTheme({ ...options, initialMode: "dark" }), "dark");
  const toggle = installGraphPanelThemeControl(ctx, options);
  assert.equal(installGraphPanelThemeControl(ctx, options), toggle);
  assert.equal(toggle.mode, "light");
  assert.equal(lines[0].text, "Light");
  assert.equal(lines[0].actionButtonText, "Active");
  listener({ matches: false });
  assert.equal(toggle.mode, "dark");
  assert.equal(stored.size, 0);
  lines[0].actionButtonOnClick();
  assert.equal(stored.get(options.storageKey), "light");
  listener({ matches: false });
  assert.equal(toggle.mode, "light");
  assert.equal(toggle.setTheme("dark"), true);
  assert.equal(stored.get(options.storageKey), "light");
  assert.equal(toggle.setTheme("purple"), false);
  assert.deepEqual(modes, ["light", "dark", "light", "dark"]);
  toggle.dispose();
  assert.equal(listener, null);
  assert.equal(windows.size, 0);
});

test("old contexts do not create an unusable style selector", () => {
  assert.equal(installGraphPanelThemeControl({}), null);
});
