// SPDX-License-Identifier: Apache-2.0
import { hashStringToU32 } from "@rb/halo/src/string-hash.js";
import { findWeightedNetworkCommunities } from "./network-packed-layout.js";

const cmp=(a,b)=>a<b?-1:a>b?1:0;
const golden=Math.PI*(3-Math.sqrt(5));
const positive=(input,fallback)=>Number.isFinite(input)&&input>0?input:fallback;
const spiral=(i,n,phase)=> {
  const z=1-2*(i+0.5)/n, r=Math.sqrt(1-z*z), theta=i*golden+phase;
  return [r*Math.cos(theta),r*Math.sin(theta),z];
};
const edgeWeight=e=>Math.log1p(positive(Number(e.weight??e.count),1));

export function layoutConnectivityNetwork3d({THREE,graph,groupById,settings={},seed=1}) {
  const ids=[...new Set(graph.nodes.map(node=>node.id))].sort(cmp);
  const n=ids.length;
  const index=new Map(ids.map((id,i)=>[id,i]));
  const positions=new Map();
  const affinity=new Map(ids.map(id=>[id,new Map()]));
  const physics=new Set(settings.physicsEdgeTypes??[]);
  const dependent=new Set(settings.dependentEdgeTypes??[]);
  const ties=new Map();
  const edges=[...graph.edges].sort((a,b)=>cmp(a.fromId,b.fromId)||cmp(a.toId,b.toId)
    ||cmp(a.type,b.type)||edgeWeight(a)-edgeWeight(b));
  for(const e of edges) {
    if(e.fromId===e.toId||!index.has(e.fromId)||!index.has(e.toId)||physics.size&&!physics.has(e.type))continue;
    const a=Math.min(index.get(e.fromId),index.get(e.toId)), b=Math.max(index.get(e.fromId),index.get(e.toId));
    const key=a+":"+b, structural=dependent.has(e.type);
    const multiplier=Number(settings.edgeWeightByType?.[e.type] ?? 1);
    if (!Number.isFinite(multiplier) || multiplier <= 0) continue;
    const heat=edgeWeight(e)*multiplier;
    const tie=ties.get(key)??{a,b,heat:0,structural:false};
    tie.heat+=heat; tie.structural||=structural;
    ties.set(key,tie);
  }
  for(const {a,b,heat,structural} of ties.values()){
    const w=structural?heat*2:heat;
    affinity.get(ids[a]).set(ids[b],w);
    affinity.get(ids[b]).set(ids[a],w);
  }
  const member=findWeightedNetworkCommunities(ids,affinity);
  const groups=new Map();
  for(const id of ids){
    const key=member.get(id);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(id);
  }
  const min=positive(settings.minNodeSpacing,3.6);
  const phase=(hashStringToU32(String(seed))/0xffffffff)*Math.PI*2;
  const centers=[...groups.values()].sort((a,b)=>b.length-a.length||cmp(a[0],b[0]));
  const extent=min*Math.max(3.5,Math.cbrt(n)*2.25);
  const coords=new Float64Array(n*3), force=new Float64Array(n*3), anchors=new Float64Array(n*3);
  const communityByNode=new Map();
  // Actual volumetric community seeds; these remain weak anchors so observed
  // relationships, including bridges across environments, can pull neighbors together.
  for(let c=0;c<centers.length;c++){
    const members=centers[c];
    const dir=centers.length===1?[0,0,0]:spiral(c,centers.length,phase);
    const size=min*Math.max(1.25,Math.cbrt(members.length)*1.1);
    for(let j=0;j<members.length;j++){
      const id=members[j], o=index.get(id)*3;
      const offset=spiral(j,members.length,phase+c*golden);
      const r=members.length===1?0:size*(0.55+0.45*(j+1)/members.length);
      for(let k=0;k<3;k++){
        anchors[o+k]=dir[k]*extent;
        coords[o+k]=anchors[o+k]+offset[k]*r;
      }
      communityByNode.set(id,members[0]);
    }
  }
  const cutoff=min*6;
  const steps=n>1500?64:n>600?90:145;
  function affect(a,b,strength) {
    for(let k=0;k<3;k++){const f=(coords[b+k]-coords[a+k])*strength;force[a+k]+=f;force[b+k]-=f;}
  }
  for(let step=0;step<steps;step++){
    force.fill(0);
    const grid=new Map();
    for(let i=0;i<n;i++){
      const a=i*3, x=Math.floor(coords[a]/cutoff),y=Math.floor(coords[a+1]/cutoff),z=Math.floor(coords[a+2]/cutoff);
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
        for(const b of grid.get((x+dx)+":"+(y+dy)+":"+(z+dz))??[]){
          const d=Math.hypot(coords[b]-coords[a],coords[b+1]-coords[a+1],coords[b+2]-coords[a+2]);
          if(d>1e-9&&d<cutoff) affect(a,b,-(min**3*0.48/(d*d)+Math.max(0,min*1.12-d)*2)/d);
        }
      }
      const key=x+":"+y+":"+z;
      if(!grid.has(key))grid.set(key,[]);
      grid.get(key).push(a);
    }
    for(const {a,b,heat,structural} of ties.values()){
      const aa=a*3,bb=b*3;
      const d=Math.hypot(coords[bb]-coords[aa],coords[bb+1]-coords[aa+1],coords[bb+2]-coords[aa+2]);
      const rest=min*(structural?1.35:1.55+2/Math.sqrt(1+heat));
      const degree=Math.max(1,affinity.get(ids[a]).size,affinity.get(ids[b]).size);
      if(d>1e-9)affect(aa,bb,(d-rest)/d*(structural?0.65:Math.min(0.52,(0.12+heat*0.17)/Math.sqrt(degree))));
    }
    const cooling=0.23*(1-step/steps)+0.045;
    for(let i=0;i<coords.length;i++){
      const f=force[i]+(anchors[i]-coords[i])*0.028;
      coords[i]+=Math.max(-min,Math.min(min,f))*cooling;
    }
  }
  // True collision resolution after spring relaxation. This applies to all
  // axes, not a cosmetic depth jitter. Pair order is stable by node id.
  const floor=Number.isFinite(settings.floorY)?settings.floorY:null;
  for(let pass=0;pass<10;pass++){
    let changed=false;
    for(let a=0;a<coords.length;a+=3)for(let b=a+3;b<coords.length;b+=3){
      const d=Math.hypot(coords[b]-coords[a],coords[b+1]-coords[a+1],coords[b+2]-coords[a+2]);
      if(d>=min)continue;
      const push=(min-d)*0.51;
      for(let k=0;k<3;k++){
        const shift=d>1e-9?(coords[b+k]-coords[a+k])*push/d:k===(a+b)%7%3?push:0;
        coords[a+k]-=shift;coords[b+k]+=shift;
      }
      changed=true;
    }
    if(!changed)break;
  }
  let minY=Infinity;
  for(let i=0;i<n;i++)minY=Math.min(minY,coords[i*3+1]);
  for(let i=0;i<n;i++)positions.set(ids[i],new THREE.Vector3(coords[i*3],
    coords[i*3+1]+(floor===null?0:floor-minY),coords[i*3+2]));
  positions.clusterByNode=new Map(ids.map(id=>[id,groupById?.get(id)??"GROUP"]));
  positions.communityByNode=communityByNode;
  return positions;
}
