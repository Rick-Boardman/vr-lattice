// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { layoutPackedNetwork } from "../src/graph/network-packed-layout.js";
import { makeGroupByIdForLayoutMode } from "../src/graph/derived.js";

test("weighted communities respect primary groups and are stable under shuffled input", () => {
  const nodes = ["a","b","c","d","host"].map(id=>({id}));
  const edges = [
    {fromId:"a",toId:"b",weight:30,type:"tie"}, {fromId:"c",toId:"d",weight:30,type:"tie"},
    {fromId:"b",toId:"c",weight:1,type:"tie"}, {fromId:"a",toId:"d",weight:100,type:"ignore"},
  ];
  const groupById = new Map(nodes.map(n=>[n.id,n.id==="host"?"B":"A"]));
  const settings = {strategy:"community",physicsEdgeTypes:["tie"],minNodeSpacing:3,minGroupGap:10,groupDepth:2,floorY:12};
  const go = (nodes,edges)=>layoutPackedNetwork({ THREE,graph:{nodes,edges},groupById,settings,seed:7 });
  const a=go(nodes,edges), b=go([...nodes].reverse(),[...edges].reverse());
  assert.deepEqual(a,b);
  assert.equal(a.size,5);
  assert.equal(a.communityByNode.get("a"),a.communityByNode.get("b"));
  assert.notEqual(a.communityByNode.get("b"),a.communityByNode.get("c"));
  assert.equal(a.clusterByNode.get("host"),"B");
  assert.ok([...a.values()].every(v=>v.y>=12 && Math.abs(v.z)<=1));
  assert.ok(a.get("host").distanceTo(a.get("a"))>=10);
});

test("host dependents stay adjacent and explicitly shared and unknown remain distinct", () => {
  const nodes=[{id:"a",type:"application",environment:"DEV"},{id:"b",type:"application",environment:"PROD"},
    ...["host","db1","db2","shared","unclaimed"].map(id=>({id}))];
  const edges=[["a","host","APP_USES_SERVER"],["a","shared","APP_USES_SERVER"],
    ["b","shared","APP_USES_SERVER"],["host","db1","SERVER_HOSTS_DATABASE"],["host","db2","SERVER_HOSTS_DATABASE"]]
    .map(([fromId,toId,type])=>({fromId,toId,type}));
  const graph={nodes,edges};
  const groupById=makeGroupByIdForLayoutMode(graph,"applicationEnvInfer",{unknown:"UNKNOWN",inheritEdgeTypes:["SERVER_HOSTS_DATABASE"]});
  assert.deepEqual(["host","db1","db2","shared","unclaimed"].map(id=>groupById.get(id)),["DEV","DEV","DEV","SHARED","UNKNOWN"]);
  const p=layoutPackedNetwork({THREE,graph,groupById,settings:{strategy:"packed",minNodeSpacing:4,dependentEdgeTypes:["SERVER_HOSTS_DATABASE"]}});
  assert.ok(["db1","db2"].every(id=>p.get(id).distanceTo(p.get("host"))<=5));
});
