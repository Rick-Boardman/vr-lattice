// SPDX-License-Identifier: Apache-2.0
import { resolveGraphSceneEditTarget } from "./picking.js";

const styledDocuments = new WeakSet();
const editorStyles = `/* Inline edits replace the painted text region only. No detached HUD window. */
.lattice-inline-scene-edit {
  position: fixed; z-index: 10; box-sizing: border-box; display: flex; flex-direction: column;
  background: #15283e; color: #edf5ff; border: 1px solid #9ab9d9;
  border-radius: 3px; font: var(--inline-scene-font, 15px)/1.25 system-ui, sans-serif;
  --scene-selection-ink: #102338; --scene-selection-bg: #a5cff3;
  --scene-scroll-track: #2b435d; --scene-scroll-thumb: #a6c2dd; --scene-scroll-hover: #c2dcf4;
}
.lattice-inline-scene-edit[data-mode="light"] {
  background: #fff; color: #142a40; border-color: #315d89;
  --scene-selection-ink: #fff; --scene-selection-bg: #245e96;
  --scene-scroll-track: #dce8f3; --scene-scroll-thumb: #506f8d; --scene-scroll-hover: #315779;
}
.lattice-inline-scene-edit :is(input,textarea) {
  width: 100%; min-width: 0; min-height: 0; flex: 1; box-sizing: border-box;
  margin: 0; padding: 1px 4px; background: transparent; border: 0; outline: 0;
  color: inherit; caret-color: currentColor; font: inherit; resize: none; user-select: text;
}
.lattice-inline-scene-edit textarea {
  padding: 3px 5px; overflow-y: auto; overflow-x: hidden;
  overflow-wrap: anywhere; overscroll-behavior: contain;
}
.lattice-inline-scene-edit textarea::-webkit-scrollbar { width: 12px; }
.lattice-inline-scene-edit textarea::-webkit-scrollbar-track { background: var(--scene-scroll-track); }
.lattice-inline-scene-edit textarea::-webkit-scrollbar-thumb {
  background: var(--scene-scroll-thumb); border: 2px solid var(--scene-scroll-track); border-radius: 6px;
}
.lattice-inline-scene-edit textarea::-webkit-scrollbar-thumb:hover {
  background: var(--scene-scroll-hover);
}
@supports not selector(textarea::-webkit-scrollbar) {
  .lattice-inline-scene-edit textarea { scrollbar-color: var(--scene-scroll-thumb) var(--scene-scroll-track); }
}
.lattice-inline-scene-edit :is(input,textarea)::selection {
  color: var(--scene-selection-ink); background: var(--scene-selection-bg);
}
.lattice-inline-scene-actions {
  display: flex; justify-content: flex-end; align-items: center; gap: 4px;
  padding: 2px 4px; min-height: 23px; box-sizing: border-box; font: 11px/1.2 system-ui, sans-serif;
}
.lattice-inline-scene-actions span { margin-right: auto; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.lattice-inline-scene-actions button { border: 1px solid #819ab4; border-radius: 3px; padding: 2px 6px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.lattice-inline-scene-actions button:last-child { background: #245e96; border-color: #245e96; color: #fff; }
.lattice-inline-scene-actions button:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }`;
function ensureSceneEditorStyle(doc, nonce) {
  if (styledDocuments.has(doc)) return;
  const style = doc.createElement("style");
  if (nonce) style.nonce = nonce;
  style.dataset.latticeInlineSceneEdit = "";
  style.textContent = editorStyles;
  (doc.head ?? doc.documentElement).append(style);
  styledDocuments.add(doc);
}

/** Position a browser text control over the authored pixels, not a HUD window. */
export function createInlineSceneEditor({ host, project, getMode, onCommit, onEnd, styleNonce } = {}) {
  let edit = null;
  const doc = host?.ownerDocument;
  function end(commit = false, { restoreFocus = true } = {}) {
    const active = edit;
    if (!active) return false;
    edit = null;
    if (active.outsidePointer) doc.removeEventListener("pointerdown",active.outsidePointer,true);
    active.root.remove();
    if (active.textMesh) active.textMesh.visible = active.wasVisible;
    if (commit && active.field.value !== active.original) onCommit?.(active.target, active.field.value);
    if (restoreFocus) host?.focus?.({ preventScroll:true });
    onEnd?.();
    return true;
  }
  function update() {
    if (!edit) return false;
    const { mesh, localBounds:b } = edit.target.surface;
    if (!mesh?.parent || !b) { end(); return false; }
    const points = [
      {x:b.left,y:b.top,z:0}, {x:b.right,y:b.top,z:0},
      {x:b.left,y:b.bottom,z:0}, {x:b.right,y:b.bottom,z:0},
    ].map(point=>project(mesh,point));
    if (points.some(p=>!p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) { end(); return false; }
    const viewport = host.getBoundingClientRect();
    const left = Math.max(viewport.left,Math.min(...points.map(p=>p.x)));
    const top = Math.max(viewport.top,Math.min(...points.map(p=>p.y)));
    const right = Math.min(viewport.right,Math.max(...points.map(p=>p.x)));
    const bottom = Math.min(viewport.bottom,Math.max(...points.map(p=>p.y)));
    const width=right-left,height=bottom-top;
    if (width<32 || height<(edit.multiline?54:14)) { end(); return false; }
    const style=edit.root.style;
    const next=[left,top,width,height].map(n=>`${Math.round(n*100)/100}px`);
    if (next[0]!==style.left || next[1]!==style.top || next[2]!==style.width || next[3]!==style.height)
      [style.left,style.top,style.width,style.height]=next;
    edit.root.dataset.mode = getMode?.()==="light" ? "light" : "dark";
    const font = Math.min(edit.multiline?19:23,Math.max(13,edit.multiline?width/18:height*0.59));
    style.setProperty("--inline-scene-font",`${font}px`);
    return true;
  }
  function open(target,value) {
    if (!doc || edit || !target?.surface?.mesh || !target.surface.localBounds) return false;
    ensureSceneEditorStyle(doc, styleNonce);
    const multiline=target.multiline ?? target.rowKey==="notes";
    const label=target.ariaLabel ?? (multiline?"Card notes":target.kind==="edge"?"Edge caption":"Card title");
    const root=doc.createElement("div");
    const field=doc.createElement(multiline?"textarea":"input");
    root.className="lattice-inline-scene-edit";
    root.dataset.kind=multiline?"body":"label";
    root.setAttribute("role","group");
    root.setAttribute("aria-label",label+" editor");
    field.setAttribute("aria-label",label);
    field.spellcheck=multiline;
    field.value=String(value ?? "");
    root.append(field);
    if (multiline) {
      const bar=doc.createElement("div");bar.className="lattice-inline-scene-actions";
      const hint=doc.createElement("span");hint.textContent="Click away or Ctrl+Enter to save";bar.append(hint);
      for (const [text,commit] of [["Cancel",false],["Save",true]]) {
        const button=doc.createElement("button");button.type="button";button.textContent=text;
        button.addEventListener("click",()=>end(commit));bar.append(button);
      }
      root.append(bar);
    } else {
      field.title="Enter or click outside to save. Esc to cancel.";
    }
    root.addEventListener("keydown",event=>{
      event.stopPropagation();
      if (event.isComposing || edit?.composing) return;
      if (event.key==="Escape") { event.preventDefault();end(); }
      else if (event.key==="Enter" && event.target===field && (!multiline || event.ctrlKey || event.metaKey)) {
        event.preventDefault();end(true);
      }
    });
    for (const name of ["pointerdown","pointerup","dblclick","wheel"]) root.addEventListener(name,event=>event.stopPropagation());
    const textMesh=target.surface.textMesh;
    const active={target,root,field,multiline,textMesh,wasVisible:textMesh?.visible,original:field.value,composing:false,outsidePointer:null};
    // Capture precedes graph/HUD listeners on the canvas. End the edit
    // without swallowing the same click. A native textarea scrollbar and
    // the in-card Save/Cancel controls are inside this editor.
    active.outsidePointer=event=>{
      if (edit!==active || active.composing || event.isPrimary===false ||
          event.button!==0 || event.composedPath().includes(root)) return;
      end(true,{restoreFocus:false});
    };
    field.addEventListener("compositionstart",()=>{active.composing=true;});
    field.addEventListener("compositionend",()=>{active.composing=false;});
    if (!multiline) {
      root.addEventListener("focusout",event=>{
        const next=event.relatedTarget;
        // No related target normally means loss of window focus; preserve
        // unsaved input when the user switches tabs or applications.
        if (edit===active && !active.composing && next && next.ownerDocument===doc &&
            !root.contains(next) && doc.hasFocus()) end(true,{restoreFocus:false});
      });
    }
    doc.addEventListener("pointerdown",active.outsidePointer,true);
    edit=active;
    doc.body.append(root);
    if (!update()) return false;
    if (textMesh) textMesh.visible=false;
    field.focus({preventScroll:true});
    if (multiline) field.setSelectionRange(field.value.length,field.value.length);
    else field.select();
    return true;
  }
  return {open,update,cancel:()=>end(),isEditing:()=>Boolean(edit),dispose:()=>end()};
}

// The browser owns double-click timing. Qualify its event using two actual
// primary scene clicks, so drags, ports, overlays and mode changes cannot edit.
export function createSceneEditGesture({ maxMovement = 3, maxClickDistance = 6 } = {}) {
  let press = null;
  let recent = [];
  let inspectTimer = null;
  function cancelInspect() {
    if (inspectTimer != null) clearTimeout(inspectTimer);
    inspectTimer = null;
  }
  function reset() { press = null; recent = []; }
  return {
    reset,
    cancelInspect,
    deferInspect(callback, delayMs = 500) {
      cancelInspect();
      inspectTimer = setTimeout(()=>{inspectTimer=null; callback();},delayMs);
    },
    start(event, target) {
      if (!target || event.pointerType !== "mouse" || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) { reset(); return; }
      press = { target, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    },
    move(event) {
      if (press?.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > maxMovement) press.moved = true;
    },
    finish(event) {
      if (!press || press.pointerId !== event.pointerId || event.type !== "pointerup" ||
          press.moved || Math.hypot(event.clientX - press.x, event.clientY - press.y) > maxMovement) {
        reset(); return;
      }
      const {target} = press;
      recent = [...recent.slice(-1), {target,x:event.clientX,y:event.clientY}];
      press = null;
      return target;
    },
    consume(event) {
      const [first, second] = recent;
      reset();
      if (event.button !== 0 || !first || !second || first.target.key !== second.target.key ||
          first.target.document !== second.target.document ||
          Math.hypot(first.x - second.x, first.y - second.y) > maxClickDistance ||
          Math.hypot(second.x - event.clientX, second.y - event.clientY) > maxMovement) return null;
      return second.target;
    },
  };
}

/** Resolve the already-selected graph hit against authored edit faces. The host
 * must initialize its ray with the current pointer before using this helper.
 */
export function pickGraphDesktopTextField(scene, raycaster, preferredHit) {
  if (!scene || !raycaster || !Array.isArray(scene.editHitTargets)) return null;
  const hits = raycaster.intersectObjects([...(scene.nodeHitTargets ?? []), ...scene.editHitTargets], false);
  const picked = resolveGraphSceneEditTarget(hits, preferredHit, { includeSurface:true });
  return picked?.surface ? picked : null;
}

/** Reuse ordinary graph priority and project the saved card rail into client pixels. */
export function pickGraphSavedBodyScroll({ scene, raycaster, winner, project }) {
  if (winner?.kind !== "node") return null;
  const target = scene?.getBodyScrollTarget?.(winner.id);
  if (!target?.surface?.mesh) return null;
  const {mesh} = target.surface;
  const hit = raycaster.intersectObject(mesh, false)[0];
  if (!hit) return null;
  const local = mesh.worldToLocal(hit.point.clone());
  if (local.y < target.railBottom || local.y > target.railTop) return null;
  const top = project(mesh,{x:target.railX,y:target.railTop,z:.03});
  const bottom = project(mesh,{x:target.railX,y:target.railBottom,z:.03});
  if (!top || !bottom) return null;
  return {...target,isRail:Math.abs(local.x-target.railX)<=target.railWidth*.8,top,bottom};
}

/** Own wheel and rail input only when a host returns an overflowing saved body.
 * Install before its normal board pointer listeners; dispose on unmount.
 */
export function attachGraphSavedBodyInput({dom,pickTarget,isBlocked=()=>false,onRailStart}) {
  const view=dom?.ownerDocument?.defaultView;
  if (!view || typeof pickTarget!=="function") return ()=>{};
  let drag=null;
  const target=event=>event.target===dom&&!isBlocked(event)&&pickTarget(event.clientX,event.clientY);
  const stop=event=>{event.preventDefault();event.stopImmediatePropagation();};
  const fractionAt=(event,t)=>{
    const dx=t.bottom.x-t.top.x,dy=t.bottom.y-t.top.y;
    return ((event.clientX-t.top.x)*dx+(event.clientY-t.top.y)*dy)/Math.max(1,dx*dx+dy*dy);
  };
  const wheel=event=>{
    if (event.ctrlKey||event.altKey||event.metaKey||!event.deltaY) return;
    const hit=target(event);
    if (!hit) return;
    const height=Math.hypot(hit.bottom.x-hit.top.x,hit.bottom.y-hit.top.y);
    const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?height:1);
    hit.scrollBy(pixels/Math.max(1,height));
    stop(event);
  };
  const start=event=>{
    if (event.button!==0||event.isPrimary===false||event.pointerType==="touch") return;
    const hit=target(event);
    if (!hit?.isRail) return;
    onRailStart?.();
    const pos=fractionAt(event,hit), head=hit.fraction*(1-hit.thumbFraction);
    const grip=pos>=head&&pos<=head+hit.thumbFraction?pos-head:hit.thumbFraction/2;
    drag={id:event.pointerId,target:hit,grip};
    hit.scrollTo((pos-grip)/Math.max(.01,1-hit.thumbFraction));
    dom.setPointerCapture?.(event.pointerId);
    stop(event);
  };
  const move=event=>{
    if (drag?.id!==event.pointerId) return;
    drag.target.scrollTo((fractionAt(event,drag.target)-drag.grip)/Math.max(.01,1-drag.target.thumbFraction));
    stop(event);
  };
  const release=()=>{
    if (!drag) return;
    const {id}=drag; drag=null;
    if (dom.hasPointerCapture?.(id)) dom.releasePointerCapture(id);
  };
  const end=event=>{if(drag?.id===event.pointerId){release();stop(event);}};
  const lost=event=>{if(drag?.id===event.pointerId) release();};
  const listeners=[["wheel",wheel,{capture:true,passive:false}],["pointerdown",start,true],
    ["pointermove",move,true],["pointerup",end,true],["pointercancel",end,true],["lostpointercapture",lost,true]];
  for(const [name,fn,options] of listeners) view.addEventListener(name,fn,options);
  return ()=>{
    for(const [name,fn] of listeners) view.removeEventListener(name,fn,true);
    release();
  };
}
