// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {createNetworkLabelProjector, retainNonoverlappingNetworkLabels} from "../src/graph/network-label-collision.js";

test("only overlapping secondary labels disappear; priority and incumbency are stable", () => {
  const a={id:1}, b={id:2}, c={id:3}, d={id:4};
  const item=(label,left,depth,priority=0,p=false)=>({label,rect:{left,right:left+20,top:0,bottom:10},depth,priority,protected:p});
  assert.deepEqual([...retainNonoverlappingNetworkLabels([item(a,0,5),item(b,10,6),item(c,20,7)],new Set())],[a,c]);
  assert.deepEqual([...retainNonoverlappingNetworkLabels([item(a,0,6),item(b,10,5)],new Set([a]))],[a]);
  assert.deepEqual([...retainNonoverlappingNetworkLabels([item(a,0,5),item(b,10,6,2,true),item(d,12,7,1,true)],new Set([a]))],[b,d]);
  assert.deepEqual([...retainNonoverlappingNetworkLabels([item(a,0,5),item(b,20,6)],new Set([a]))],[a,b]);
});

test("perspective label rectangles follow camera and billboard plate world scale", () => {
  const camera=new THREE.PerspectiveCamera(90,2,1,100);
  camera.updateMatrixWorld();
  const label=new THREE.Group();
  label.scale.setScalar(2);
  label.userData.backgroundMesh = {geometry:new THREE.PlaneGeometry(4,1)};
  const project=createNetworkLabelProjector(THREE);
  const at=(x,y,z)=>project(label,new THREE.Vector3(x,y,z),camera,1000,500);
  const near=at(0,0,-5),far=at(0,0,-10);
  assert.ok(near.right-near.left > far.right-far.left);
  assert.ok(Math.abs((near.right-near.left)-400)<1e-9);
  assert.equal(at(0,0,5),null);
  assert.equal(at(200,0,-10),null);
  assert.equal(at(9,0,-5).right,1000);
});
