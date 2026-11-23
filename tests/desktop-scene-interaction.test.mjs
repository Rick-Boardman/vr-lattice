// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createSceneEditGesture } from "../src/graph/desktop-scene-interaction.js";

const doc = {};
const title = {key:"task:title",document:doc,rowKey:"draftLabel"};
const notes = {key:"task:body",document:doc,rowKey:"notes"};
const e = (type, rest={}) => ({type,pointerType:"mouse",pointerId:1,button:0,clientX:90,clientY:45,...rest});
function click(gesture,target,rest) {
  gesture.start(e("pointerdown",rest),target);
  gesture.finish(e("pointerup",rest));
}
test("two physical mouse clicks on the same card field qualify the browser double-click once",()=>{
  const g=createSceneEditGesture();
  click(g,notes);
  assert.equal(g.consume(e("dblclick")),null);
  click(g,notes); click(g,notes,{clientX:92});
  assert.equal(g.consume(e("dblclick",{clientX:92})),notes);
  assert.equal(g.consume(e("dblclick")),null);
});
test("world edit ignores crossed fields or documents, touch, drag-return, cancel and HUD/port misses",()=>{
  const g=createSceneEditGesture();
  click(g,title); click(g,notes);
  assert.equal(g.consume(e("dblclick")),null);
  click(g,title); click(g,{...title,document:{}});
  assert.equal(g.consume(e("dblclick")),null);
  click(g,title,{pointerType:"touch"}); click(g,title);
  assert.equal(g.consume(e("dblclick")),null);
  click(g,title); g.start(e("pointerdown"),title);
  g.move(e("pointermove",{clientX:110})); g.finish(e("pointerup"));
  assert.equal(g.consume(e("dblclick")),null);
  click(g,title); g.start(e("pointerdown"),title); g.finish(e("pointercancel"));
  assert.equal(g.consume(e("dblclick")),null);
  click(g,title); click(g,null); click(g,title);
  assert.equal(g.consume(e("dblclick")),null);
});
