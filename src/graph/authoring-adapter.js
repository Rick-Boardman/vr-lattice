import { createInlineSceneEditor, pickGraphDesktopTextField, pickGraphSavedBodyScroll } from "./desktop-scene-interaction.js";

/**
 * Bridge authored graph hit surfaces to a host's field and mutation policy.
 * The adapter does not mutate documents: writeField is the host's normal command.
 */
export function createGraphAuthoringAdapter({
  host, project, getMode, getScene, getDocument, raycaster, pickOrdinaryHit,
  resolveField, resolveEdge, getEdgeKey, allowWrite = () => true,
  canPick = () => true, canOpen = canPick, canResolve = () => true,
  canReadSaved = () => true, writeField, onOpen,
} = {}) {
  function resolve(target) {
    const doc = getDocument?.();
    if (!target || !doc || target.document !== doc || !canResolve(target)) return null;
    const entry = target.kind === "node"
      ? doc.graph?.nodes?.find(row => String(row.id) === target.id)
      : target.kind === "edge" && doc.graph?.edges?.includes(target.edge) ? target.edge : null;
    return entry && allowWrite(target, entry) ? entry : null;
  }
  const editor = createInlineSceneEditor({
    host, project, getMode,
    onCommit(target, value) {
      const entry = resolve(target);
      if (entry) writeField?.({ target, entry, value });
    },
  });
  return {
    editor,
    supportsPicking: () => Array.isArray(getScene?.()?.editHitTargets),
    resolve,
    pick(preferredHit, ...args) {
      if (!canPick(...args)) return null;
      const hit = pickGraphDesktopTextField(getScene?.(), raycaster, preferredHit);
      const rowKey = hit && resolveField?.(hit);
      if (!rowKey) return null;
      const id = hit.kind === "node" ? String(hit.id ?? "") : null;
      const edge = hit.kind === "edge" ? resolveEdge?.(hit.edge) : null;
      if (!id && !edge) return null;
      const target = {
        kind:hit.kind,rowKey,surface:hit.surface,document:getDocument?.(),
        key:JSON.stringify(id ? ["node",id,rowKey] : ["edge",getEdgeKey?.(edge)]),
        ...(id ? {id} : {edge}),
      };
      return resolve(target) ? target : null;
    },
    open(target) {
      if (!canOpen(target)) return false;
      const entry = resolve(target);
      if (!entry || !editor.open(target,entry[target.rowKey])) return false;
      onOpen?.({target,entry});
      return true;
    },
    pickSaved(clientX,clientY) {
      const scene = getScene?.();
      if (!scene?.getBodyScrollTarget || !canReadSaved() || editor.isEditing()) return null;
      const winner = pickOrdinaryHit?.(clientX,clientY);
      return pickGraphSavedBodyScroll({scene,raycaster,winner,project});
    },
  };
}

/** Keep passive reveal and recognized double-clicks in the same gesture lifecycle. */
export function createPassiveGraphInspector({
  gesture, canReveal, isSelected, reveal, isBlocked, open,
} = {}) {
  return {
    defer(target,x,y) {
      gesture?.deferInspect(()=>{
        if (canReveal(target) && isSelected(target)) reveal(target,x,y);
      });
    },
    doubleClick(event) {
      const target=gesture?.consume(event);
      if (!target || isBlocked(event) || !open(target,event.clientX,event.clientY)) return false;
      gesture.cancelInspect();
      event.preventDefault();
      return true;
    },
  };
}

/** Pure placement; spherical anchors may be outside display bounds. */
export function resolveGraphInspectorFrame(anchor,{
  edge = 16, layoutW, bottomLimit, inspectorW, inspectorH, gap,
  spherical = false, avoidAnchor = false, errorPrefix = "resolveGraphInspectorFrame",
} = {}) {
  if (!anchor || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y))
    throw new Error(errorPrefix+": missing hud anchor point");
  if (!Number.isFinite(layoutW) || !Number.isFinite(bottomLimit))
    throw new Error(errorPrefix+": missing inspector layout bounds");
  if (!Number.isFinite(inspectorW) || !Number.isFinite(inspectorH))
    throw new Error(errorPrefix+": missing inspector dimensions");
  const minEdge=Math.max(0,Math.round(Number(edge)||0));
  const w=Math.max(0,Math.round(inspectorW)), h=Math.max(0,Math.round(inspectorH));
  const resolvedGap=Math.max(0,Math.round(Number(gap)||0));
  const rawY=Math.round(anchor.y-h*.36);
  const rawX=Math.round(anchor.x+resolvedGap);
  const size={w,h,minW:300,minH:220};
  if(spherical) return {x:rawX,y:Math.max(-900,rawY),...size};
  const maxX=Math.max(minEdge,Math.round(layoutW)-w-minEdge);
  const maxY=Math.max(minEdge,Math.round(bottomLimit)-h);
  const x=Math.max(minEdge,Math.min(maxX,rawX)), y=Math.max(minEdge,Math.min(maxY,rawY));
  const avoidX=Number.isFinite(anchor.avoidX)?anchor.avoidX:avoidAnchor?anchor.x:NaN;
  const leftX=Math.round(avoidX-resolvedGap-w);
  return {x:Number.isFinite(avoidX)&&avoidX>=x&&avoidX<=x+w&&leftX>=minEdge?Math.min(maxX,leftX):x,y,...size};
}
