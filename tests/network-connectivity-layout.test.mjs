// SPDX-License-Identifier: Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { layoutConnectivityNetwork3d } from "../src/graph/network-connectivity-layout.js";

test("network geometry is volumetric, connectivity driven, and independent of semantic group labels", () => {
  const nodes=Array.from({length:24},(_,i)=>({id:String(i).padStart(2,"0")}));
  const edges=[];
  for(let b=0;b<24;b+=6) for(let i=b;i<b+6;i++)for(let j=i+1;j<b+6;j++)
    edges.push({fromId:nodes[i].id,toId:nodes[j].id,type:"communication",weight:20});
  for(let i=0;i<18;i+=6)edges.push({fromId:nodes[i].id,toId:nodes[i+6].id,type:"communication",weight:1});
  const graph={nodes,edges}, settings={floorY:0,minNodeSpacing:3.6};
  const groupById=new Map(nodes.map((n,i)=>[n.id,i%2?"DEV":"LIVE"]));
  const p=layoutConnectivityNetwork3d({THREE,graph,settings,seed:7,groupById});
  const q=layoutConnectivityNetwork3d({THREE,graph:{nodes:[...nodes].reverse(),edges:[...edges].reverse()},settings,seed:7});
  const spans=new THREE.Box3().setFromPoints([...p.values()]).getSize(new THREE.Vector3());
  assert.ok(spans.z>Math.max(spans.x,spans.y)*0.45,JSON.stringify(spans));
  assert.equal(p.size,nodes.length);
  assert.equal(p.clusterByNode.get("00"),"LIVE");
  assert.equal(p.communityByNode.get("00"),p.communityByNode.get("01"));
  assert.notEqual(p.communityByNode.get("00"),p.communityByNode.get("13"));
  assert.ok([...p].every(([id,v])=>v.equals(q.get(id)) && v.y>=0));
  const distance=e=>p.get(e.fromId).distanceTo(p.get(e.toId));
  const means=w=>{const subset=edges.filter(e=>e.weight===w);return subset.reduce((sum,e)=>sum+distance(e),0)/subset.length;};
  assert.ok(means(20)<means(1)*0.8,[means(20),means(1)]);
  for(const [a,v] of p)for(const [b,w] of p)if(a<b)assert.ok(v.distanceTo(w)>=settings.minNodeSpacing-0.002);
});

test("dependent nodes stay close to their host in all three dimensions",()=>{
  const nodes=Array.from({length:20},(_,i)=>({id:String(i).padStart(2,"0")}));
  const edges=[];
  for(let i=1;i<10;i++)edges.push({fromId:"00",toId:nodes[i].id,type:"HOSTS"});
  for(let i=11;i<20;i++)edges.push({fromId:"10",toId:nodes[i].id,type:"HOSTS"});
  const p=layoutConnectivityNetwork3d({THREE,graph:{nodes,edges},settings:{dependentEdgeTypes:["HOSTS"]}});
  assert.ok(edges.every(e=>p.get(e.fromId).distanceTo(p.get(e.toId))<p.get("00").distanceTo(p.get("10"))));
  const hostLeaves=nodes.slice(0,10).map(n=>p.get(n.id));
  const span=new THREE.Box3().setFromPoints(hostLeaves).getSize(new THREE.Vector3());
  assert.ok(Math.min(span.x,span.y,span.z)>2);
});
