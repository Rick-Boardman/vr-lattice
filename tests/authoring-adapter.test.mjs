import assert from "node:assert/strict";
import test from "node:test";
import { createGraphAuthoringAdapter, createPassiveGraphInspector, resolveGraphInspectorFrame } from "../src/graph/authoring-adapter.js";
import { setGraphSceneEditSurface } from "../src/graph/scene-edit-surfaces.js";

test("authoring uses canonical node and edge data and rechecks policy and document identity",()=>{
  const node={id:"a"}, edge={id:"edge"}, original={graph:{nodes:[node],edges:[edge]}};
  let active=original,writable=true;
  const graphHit={kind:"node",id:"a",node};
  const card={userData:{graphHit,graphEditRegion:{shape:"card",bodyThreshold:0.5}}};
  const label={userData:{graphEditTarget:{kind:"edge",field:"label",edge:{id:"edge"}}}};
  const bounds={left:0,right:10,top:10,bottom:0};
  setGraphSceneEditSurface(card,"title",bounds);
  setGraphSceneEditSurface(card,"body",bounds);
  setGraphSceneEditSurface(label,"label",bounds);
  let hits=[{object:card,uv:{y:.9}}];
  const adapter=createGraphAuthoringAdapter({
    getScene:()=>({nodeHitTargets:[card],editHitTargets:[label]}),
    getDocument:()=>active,raycaster:{intersectObjects:()=>hits},
    allowWrite:()=>writable,
    resolveField:hit=>({title:"displayName",body:"description",label:"caption"})[hit.field],
    resolveEdge:e=>e.id===edge.id?edge:null,getEdgeKey:e=>e.id,
  });
  const title=adapter.pick(graphHit);
  assert.equal(title.rowKey,"displayName");
  assert.equal(adapter.resolve(title),node);
  hits=[{object:card,uv:{y:.2}}];
  assert.equal(adapter.pick(graphHit).rowKey,"description");
  hits=[{object:label}];
  const caption=adapter.pick();
  assert.equal(caption.rowKey,"caption");
  assert.equal(adapter.resolve(caption),edge);
  writable=false;
  assert.equal(adapter.resolve(title),null);
  assert.equal(adapter.pick(),null);
  writable=true;
  active={...original};
  assert.equal(adapter.resolve(title),null);
});

test("passive Inspector avoids blocking valid second click and never opens over HUD",()=>{
  let next, selected=true, allowed=true, cancelled=0, prevented=0, opens=0;
  const shown=[], target={key:"card"};
  const passive=createPassiveGraphInspector({
    gesture:{deferInspect:cb=>next=cb,consume:()=>target,cancelInspect:()=>cancelled++},
    canReveal:()=>allowed,isSelected:()=>selected,reveal:(...args)=>shown.push(args),
    isBlocked:event=>event.hud,open:()=>{opens++;return true;},
  });
  const down={clientX:35,clientY:45,preventDefault:()=>prevented++};
  passive.defer(target,35,45); selected=false;next();assert.equal(shown.length,0);
  passive.defer(target,35,45);selected=true;next();assert.deepEqual(shown,[[target,35,45]]);
  assert.equal(passive.doubleClick({...down,hud:true}),false);
  assert.equal(passive.doubleClick(down),true);
  assert.deepEqual([opens,cancelled,prevented],[1,1,1]);
});

test("Inspector placement retains right-edge, explicit avoidance and spherical semantics",()=>{
  const viewport={layoutW:1200,bottomLimit:600,inspectorW:300,inspectorH:240,gap:12};
  const point={x:1150,y:450};
  assert.equal(resolveGraphInspectorFrame(point,viewport).x,884);
  assert.equal(resolveGraphInspectorFrame(point,{...viewport,avoidAnchor:true}).x,838);
  assert.equal(resolveGraphInspectorFrame({...point,avoidX:1120},viewport).x,808);
  const sphere=resolveGraphInspectorFrame({x:1260,y:-5000},{...viewport,spherical:true});
  assert.deepEqual(sphere,{x:1272,y:-900,w:300,h:240,minW:300,minH:220});
});

test("a card edited in place is raised to the host's render order and put back when the edit ends",()=>{
  const el=()=>({style:{setProperty(){}},dataset:{},children:[],setAttribute(){},addEventListener(){},append(...c){this.children.push(...c);},
    remove(){},focus(){},select(){},setSelectionRange(){},contains:()=>false});
  const doc={createElement:()=>el(),addEventListener(){},removeEventListener(){},head:el(),body:el(),hasFocus:()=>true};
  const host={ownerDocument:doc,getBoundingClientRect:()=>({left:0,top:0,right:800,bottom:600,width:800,height:600}),focus(){}};
  const node={id:"a",notes:"n"},doc0={graph:{nodes:[node],edges:[]}};
  const raised=[];
  const scene={setRaisedNode:(id,order=null,{source}={})=>raised.push([id,order,source])};
  const mesh={parent:{}};
  const adapter=createGraphAuthoringAdapter({
    host,project:(_m,p)=>({x:100+p.x*20,y:100-p.y*20}),getScene:()=>scene,getDocument:()=>doc0,
    getEditRenderOrder:()=>10001,
  });
  const target={kind:"node",id:"a",rowKey:"notes",document:doc0,surface:{mesh,localBounds:{left:0,right:10,top:10,bottom:0}}};
  assert.equal(adapter.open(target),true);
  assert.deepEqual(raised,[["a",10001,"edit"]]);
  adapter.editor.cancel();
  assert.deepEqual(raised,[["a",10001,"edit"],[null,null,"edit"]]);
  const bare=createGraphAuthoringAdapter({host,project:(_m,p)=>({x:100+p.x*20,y:100-p.y*20}),getScene:()=>({}),
    getDocument:()=>doc0,getEditRenderOrder:()=>10001});
  assert.throws(()=>bare.open(target),/setRaisedNode/);
  assert.equal(bare.editor.isEditing(),false);
});
