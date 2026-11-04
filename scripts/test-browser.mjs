import assert from "node:assert/strict";
import {chromium} from "playwright";
import {serve} from "./serve.mjs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {mkdir} from "node:fs/promises";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const {server,origin}=await serve(root);
const browser=await chromium.launch({args:["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}});const errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 page.on("response",r=>{if(r.status()>=400)errors.push(r.status()+" "+new URL(r.url()).pathname);});
 await page.goto(origin+"/examples/graph/");
 await page.waitForFunction(()=>!!globalThis.__latticeExample);
 await page.waitForTimeout(1200);
 const stats=await page.evaluate(()=>({nodes:globalThis.__latticeExample.graph.nodes.length,edges:globalThis.__latticeExample.graph.edges.length,calls:globalThis.__latticeExample.ctx.renderer.info.render.calls}));
 if(stats.nodes!==3||stats.edges!==2||stats.calls<1)throw new Error("Graph did not render");
 await mkdir(path.join(root,"dist/shots"),{recursive:true});
 const snapshot = () => page.evaluate(() => {
  const ex = globalThis.__latticeExample, {ctx} = ex, hud = ctx.hudSystem.hud;
  const windows = Object.entries(hud.ui.windows).filter(([,w]) => w.y >= 0).map(([key,w]) => ({key,x:w.x,y:w.y,w:w.w,h:w.collapsed?28:w.h,collapsed:w.collapsed}));
  ctx.camera.updateWorldMatrix(true,false);
  const nodes = [...ex.meshes].map(([id,mesh]) => {
   const p = mesh.position.clone().project(ctx.camera);
   return {id,x:(p.x+1)*hud.layoutW/2,y:(1-p.y)*hud.layoutH/2,z:p.z};
  });
  return {width:hud.layoutW,height:hud.layoutH,windows,nodes,area:ex.getGraphViewport(),selected:ex.getSelectedId(),yaw:ctx.look.getYaw(),pitch:ctx.look.getPitch(),roll:ctx.look.state.roll,position:ctx.rig.player.position.toArray()};
 });
 function checkLayout(state,label) {
  for(const w of state.windows) assert(w.x>=0 && w.y>=0 && w.x+w.w<=state.width+1 && w.y+w.h<=state.height+1, `${label}: ${w.key} outside viewport`);
  for(let i=0;i<state.windows.length;i++) for(let j=i+1;j<state.windows.length;j++) {
   const a=state.windows[i],b=state.windows[j];
   assert(!(a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y),`${label}: ${a.key} overlaps ${b.key}`);
  }
  for(const n of state.nodes) {
   assert(n.z>-1 && n.z<1 && n.x>=state.area.x && n.x<=state.area.x+state.area.w && n.y>=state.area.y && n.y<=state.area.y+state.area.h,`${label}: ${n.id} not framed`);
   assert(!state.windows.some(w=>n.x>=w.x&&n.x<=w.x+w.w&&n.y>=w.y&&n.y<=w.y+w.h),`${label}: ${n.id} obscured`);
  }
  console.log(`PASS ${label}: panels in bounds, no overlaps, graph visible`);
 }
 async function clickToolbar(index) {
  const w=(await snapshot()).windows.find(w=>w.key==="hotbar");
  await page.mouse.click(w.x+w.w*(index+0.5)/4,w.y+w.h/2);
  await page.waitForTimeout(100);
 }
 let state=await snapshot();
 checkLayout(state,"desktop");
 assert(!state.windows.find(w=>w.key==="help").collapsed,"Desktop Help should be open");
 assert(!state.windows.some(w=>["debug","chat","status","selection"].includes(w.key)),"Unexpected startup panels");
 assert.deepEqual(await page.evaluate(()=>globalThis.__latticeExample.labels.map(l=>l.userData.textMesh.text)),["Input","Transform","Output"]);
 await page.screenshot({path:path.join(root,"dist/shots/graph.png")});
 let node=state.nodes.find(n=>n.id==="transform");
 await page.mouse.click(node.x,node.y);
 await page.waitForTimeout(100);
 state=await snapshot();
 assert.equal(state.selected,"transform");
 assert(state.windows.some(w=>w.key==="selection"));
 assert(await page.evaluate(()=>globalThis.__latticeExample.ctx.hudSystem.hud.ui.data.selectionLines.some(l=>l.text==="1 incoming / 1 outgoing")));
 checkLayout(state,"selected node");
 await page.screenshot({path:path.join(root,"dist/shots/graph-selected.png")});
 // A drag must rotate without acting as a click that changes selection.
 await page.mouse.move(650,550);await page.mouse.down();await page.mouse.move(710,575,{steps:4});await page.mouse.up();
 assert.equal((await snapshot()).selected,"transform");
 const turned=await snapshot();assert.notEqual(turned.yaw,0);
 await page.evaluate(()=>globalThis.__latticeExample.ctx.rig.player.position.x+=100);
 await clickToolbar(0);
 state=await snapshot();
 assert.equal(state.yaw,turned.yaw,"Fit must preserve the view angle");
 checkLayout(state,"Fit graph after moving away");
 await page.evaluate(()=>{const c=globalThis.__latticeExample.ctx;c.navigation.autoWalk=true;c.look.state.roll=0.5;c.look.applyLook();});
 await clickToolbar(1);
 state=await snapshot();
 assert(Math.abs(state.yaw)<1e-10);assert(Math.abs(state.pitch)<1e-10);assert(Math.abs(state.roll)<1e-10);
 assert.equal(await page.evaluate(()=>globalThis.__latticeExample.ctx.navigation.autoWalk),false);
 checkLayout(state,"Reset view");
 await clickToolbar(2);assert((await snapshot()).windows.find(w=>w.key==="help").collapsed);
 await clickToolbar(2);assert(!(await snapshot()).windows.find(w=>w.key==="help").collapsed);
 await clickToolbar(3);
 state=await snapshot();assert(state.windows.some(w=>w.key==="debug")&&state.windows.some(w=>w.key==="chat"));
 checkLayout(state,"desktop diagnostics");
 await clickToolbar(3);assert(!(await snapshot()).windows.some(w=>["debug","chat"].includes(w.key)));
 await page.setViewportSize({width:1280,height:390});await page.waitForTimeout(150);
 await clickToolbar(3);checkLayout(await snapshot(),"short desktop diagnostics");await clickToolbar(3);
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:320,height:568}]) {
  await page.setViewportSize(viewport);await page.waitForTimeout(150);
  state=await snapshot();checkLayout(state,`${viewport.width}x${viewport.height}`);
  assert(state.windows.find(w=>w.key==="help").collapsed);
  await clickToolbar(2);checkLayout(await snapshot(),"narrow Help expanded");
  await clickToolbar(3);checkLayout(await snapshot(),"narrow diagnostics");
  if(viewport.width===390)await page.screenshot({path:path.join(root,"dist/shots/graph-tools-mobile.png")});
  await clickToolbar(3);
  if(viewport.width===390)await page.screenshot({path:path.join(root,"dist/shots/graph-mobile.png")});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 // Verify native touch selection in its own context, without mouse compatibility assumptions.
 const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const phone=await touch.newPage();await phone.goto(origin+"/examples/graph/");
 await phone.waitForFunction(()=>!!globalThis.__latticeExample);
 await phone.waitForTimeout(150);
 node=await phone.evaluate(()=>{const {ctx,meshes}=globalThis.__latticeExample;const p=meshes.get("input").position.clone().project(ctx.camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};});
 await phone.touchscreen.tap(node.x,node.y);
 await phone.waitForFunction(()=>globalThis.__latticeExample.getSelectedId()==="input");
 await touch.close();
 if(errors.length)throw new Error(errors.join("\n"));
 console.log("PASS graph: rendering, labels, selection, Fit, Reset, Help, diagnostics, resize and touch",stats);
}finally{await browser.close();server.close();}
