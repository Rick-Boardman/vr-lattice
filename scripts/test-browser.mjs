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
 await mkdir(path.join(root,"dist/shots"),{recursive:true});await page.screenshot({path:path.join(root,"dist/shots/graph.png")});
 if(errors.length)throw new Error(errors.join("\n"));
 await page.setViewportSize({width:390,height:844});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error("Mobile overflow");
 console.log("PASS graph: nodes, edges, WebGL draw calls, assets, mobile viewport",stats);
}finally{await browser.close();server.close();}
