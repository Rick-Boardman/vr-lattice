// SPDX-License-Identifier: Apache-2.0
const CELL = 64;
const overlaps = (a,b) => a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top;

export function retainNonoverlappingNetworkLabels(candidates, previous) {
  const visible = new Set();
  const grid = new Map();
  candidates.sort((a,b)=>b.priority-a.priority
    || Number(previous.has(b.label))-Number(previous.has(a.label))
    || a.depth-b.depth || a.label.id-b.label.id);
  for (const entry of candidates) {
    const box = entry.rect;
    const minX=Math.floor(box.left/CELL), maxX=Math.floor(box.right/CELL);
    const minY=Math.floor(box.top/CELL), maxY=Math.floor(box.bottom/CELL);
    const keys=[];
    for (let x=minX;x<=maxX;x++) for (let y=minY;y<=maxY;y++) keys.push(x+":"+y);
    // Intentional protected labels remain discoverable even if two collide.
    // At a given priority, last frame's incumbents win to avoid flickering.
    if (!entry.protected && keys.some(key=>grid.get(key)?.some(other=>overlaps(box,other)))) continue;
    visible.add(entry.label);
    for (const key of keys) {
      if (!grid.has(key)) grid.set(key,[]);
      grid.get(key).push(box);
    }
  }
  return visible;
}

export function createNetworkLabelProjector(THREE) {
  const center=new THREE.Vector3(), lo=new THREE.Vector3(), hi=new THREE.Vector3(), scale=new THREE.Vector3();
  return function project(label, worldPosition, camera, width, height) {
    const plate=label.userData.backgroundMesh;
    if (!plate?.geometry || width<=0 || height<=0) return null;
    if (!plate.geometry.boundingBox) plate.geometry.computeBoundingBox();
    const bounds=plate.geometry.boundingBox;
    if (!bounds) return null;
    label.getWorldScale(scale);
    center.copy(worldPosition).applyMatrix4(camera.matrixWorldInverse);
    if (center.z >= -camera.near) return null;
    lo.set(center.x+bounds.min.x*scale.x,center.y+bounds.min.y*scale.y,center.z)
      .applyMatrix4(camera.projectionMatrix);
    hi.set(center.x+bounds.max.x*scale.x,center.y+bounds.max.y*scale.y,center.z)
      .applyMatrix4(camera.projectionMatrix);
    const left=Math.max(0,(1+lo.x)*width/2), right=Math.min(width,(1+hi.x)*width/2);
    const top=Math.max(0,(1-hi.y)*height/2), bottom=Math.min(height,(1-lo.y)*height/2);
    if (!(left<right && top<bottom)) return null;
    return {left,right,top,bottom};
  };
}
