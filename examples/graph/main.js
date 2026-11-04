import * as THREE from "three";
import {createGraphSceneContext,toCanonicalGraph} from "../../src/graph/index.js";
import {buildNodeMeshFromSpec,buildEdgeLineFromSpec} from "../../src/graph/graph-mesh-builders.js";
import {renderHudFrame,startAnimationLoop} from "@rb/halo";
const graph=toCanonicalGraph({
 nodes:[{id:"input",kind:"step"},{id:"transform",kind:"step"},{id:"output",kind:"step"}],
 edges:[{from:"input",to:"transform",kind:"flow"},{from:"transform",to:"output",kind:"flow"}],
});
const ctx=createGraphSceneContext({THREE,canvas:document.getElementById("c")});
const positions=new Map(graph.nodes.map((node,index)=>[node.id,new THREE.Vector3((index-1)*5,0,0)]));
for(const node of graph.nodes){
 const mesh=buildNodeMeshFromSpec({THREE,node,spec:{defaultColor:0x59c7e8}});
 mesh.position.copy(positions.get(node.id));ctx.scene.add(mesh);
}
for(const edge of graph.edges)ctx.scene.add(buildEdgeLineFromSpec({THREE,edge,fromPos:positions.get(edge.from),toPos:positions.get(edge.to),spec:{defaultColor:0xcbd5e1}}));
ctx.hudSystem.createWindow("example",{title:"LATTICE",x:20,y:320,w:360,h:140});
ctx.hudSystem.setWindowLines("example",[{text:"3 nodes / 2 connections"},{text:"Graph primitives composed with Halo."}]);
startAnimationLoop({renderer:ctx.renderer,THREE,maxDelta:0.05,onFrame:({dt})=>renderHudFrame({...ctx,dt})});
globalThis.__latticeExample={ctx,graph};
