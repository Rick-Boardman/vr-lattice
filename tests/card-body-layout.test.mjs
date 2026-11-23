import test from "node:test";
import assert from "node:assert/strict";
import { layoutCardBodyText } from "../src/graph/card-body-layout.js";

const options = { width: 12, height: 80, fontHeight: 10, lineGap: 12, measure: text => [...text].length };

test("card notes grow past four lines when room is available, preserving paragraphs", () => {
  const notes = "First row\n\nSecond row\nThird row\nFourth row\nFifth row";
  assert.deepEqual(layoutCardBodyText(notes, options),
    ["First row", "", "Second row", "Third row", "Fourth row", "Fifth row"]);
});

test("only real overflow ellipsizes within the height reserved above a metric", () => {
  const notes = "First row\nSecond row\nUnaltered saved value";
  assert.deepEqual(layoutCardBodyText(notes, { ...options, height: 22 }), ["First row", "Second row…"]);
  assert.deepEqual(layoutCardBodyText("First row\nSecond row", { ...options, height: 22 }), ["First row", "Second row"]);
  assert.equal(notes, "First row\nSecond row\nUnaltered saved value");
});

test("long unbroken words wrap without breaking surrogate pairs", () => {
  assert.deepEqual(layoutCardBodyText("ok 😀😀😀😀😀", { ...options, width: 3 }), ["ok", "😀😀😀", "😀😀"]);
});

test("overflow signal distinguishes clipping from authored ellipsis", () => {
  let overflows = 0;
  const measured = { ...options, height: 22, onOverflow: () => { overflows++; } };
  layoutCardBodyText("Normal line\nAuthored…", measured);
  assert.equal(overflows, 0);
  layoutCardBodyText("Normal line\nFits\nExtra line", measured);
  assert.equal(overflows, 1);
});
