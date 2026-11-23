// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createGraphPalette } from "../src/graph/palette.js";

test("Palette keeps native group boundaries, disclosures, state and focus scroll", () => {
  let rows, options, reset = 0, selected = 0;
  const hudSystem = {
    hud: { ui: { windows: { palette: { scrollMode: "manual" } } } },
    setWindowLines(_key, next, settings) { rows = next; options = settings; },
    setWindowScrollTop() { reset++; },
  };
  const icons = { disclosureExpanded: Symbol("down"), disclosureCollapsed: Symbol("right") };
  const palette = createGraphPalette({ hudSystem, windowKey: "palette", defaultOpen: ["starter"], icons });
  const sections = [
    { key: "starter", title: "Starter", items: [
      { text: "Task", paletteActive: true, hoverText: "Create Task", onClick: () => selected++ },
      { text: "Start", onClick: () => {} },
    ] },
    { key: "advanced", title: "Advanced", emptyText: "Nothing available" },
  ];
  const render = (statusKey = "") => palette.render({ sections, statusKey, statusRows: [{ text: "Placement" }] });
  render();
  assert.deepEqual(rows.filter(row => row.accordionRole).map(row => row.accordionRole), ["header", "item", "last", "single"]);
  assert.equal(rows[2].actionButtonIconTexture, icons.disclosureExpanded);
  assert.equal(rows.at(-1).actionButtonIconTexture, icons.disclosureCollapsed);
  assert.equal(rows[3].actionButtonTextInsetPx, 27);
  assert.equal(rows[3].accordionSelected, true);
  rows[3].actionButtonOnClick();
  assert.equal(selected, 1);
  rows.at(-1).actionButtonOnClick();
  assert.equal(rows.at(-1).text.trim(), "Nothing available");
  assert.equal(rows.at(-1).accordionRole, "last");
  assert.equal(options.scrollMode, "manual");
  render("task");
  assert.equal(options.scrollMode, "top");
  assert.equal(reset, 1);
  render("task");
  assert.equal(options.scrollMode, "manual");
  assert.equal(reset, 1);
  assert.equal(rows.at(-1).text.trim(), "Nothing available");
});
