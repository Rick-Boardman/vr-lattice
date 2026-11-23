// SPDX-License-Identifier: Apache-2.0
import { hashStringToU32 } from "@rb/halo/src/string-hash.js";

const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const posNum = (v, fallback) => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback;
const bucket = (map, key, value) => {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
};
const weight = edge => Math.log1p(posNum(edge.weight ?? edge.count, 1));

function orderByTies(keys, affinity) {
  const remaining = new Set(keys);
  const out = [];
  while (remaining.size) {
    const previous = out.at(-1);
    const rank = id => previous == null ? 0 : affinity.get(previous)?.get(id) ?? 0;
    const next = [...remaining].sort((a,b)=>rank(b)-rank(a)||cmp(a,b))[0];
    out.push(next);
    remaining.delete(next);
  }
  return out;
}

function addTie(map, a, b, w) {
  if (a === b) return;
  if (!map.has(a)) map.set(a, new Map());
  if (!map.has(b)) map.set(b, new Map());
  map.get(a).set(b, (map.get(a).get(b) ?? 0) + w);
  map.get(b).set(a, (map.get(b).get(a) ?? 0) + w);
}

// One bounded weighted modularity refinement within each declared group;
// deterministic ties, isolates remain singleton, and declared groups never mix.
export function findWeightedNetworkCommunities(ids, affinity) {
  const membership = new Map(ids.map(id=>[id,id]));
  const degree = new Map(ids.map(id=>[id,[...(affinity.get(id)?.values() ?? [])].reduce((a,b)=>a+b,0)]));
  const volume = new Map(degree);
  const twiceWeight = [...degree.values()].reduce((a,b)=>a+b,0);
  if (!twiceWeight) return membership;
  for (let pass=0; pass<10; ++pass) {
    let moved = false;
    for (const id of ids) {
      const original = membership.get(id);
      const k = degree.get(id);
      if (!k) continue;
      volume.set(original, volume.get(original)-k);
      const ties = new Map();
      for (const [neighbor,w] of affinity.get(id) ?? []) {
        const c = membership.get(neighbor);
        ties.set(c, (ties.get(c) ?? 0)+w);
      }
      const score = c => (ties.get(c) ?? 0) - (k*volume.get(c))/twiceWeight;
      let best = original;
      let value = score(best);
      for (const c of [...ties.keys()].sort(cmp)) {
        const next = score(c);
        if (next > value+1e-9) { best=c; value=next; }
      }
      volume.set(best, volume.get(best)+k);
      membership.set(id,best);
      moved ||= best !== original;
    }
    if (!moved) break;
  }
  return membership;
}

// Packs compact, separate rectangles; no group is placed on top of another.
// Recursively used for host/dependent bundles and communities inside groups.
function pack(items,gap) {
  if (!items.length) return {w:0,h:0,points:[]};
  const maxW = Math.max(...items.map(item=>item.w));
  const area = items.reduce((a,item)=>a+(item.w+gap)*(item.h+gap),0);
  const target = Math.max(maxW,Math.sqrt(area)*1.2);
  let x=0,y=0,rowH=0,w=0;
  const points=[];
  for (const item of items) {
    if (x && x+item.w>target) {x=0; y+=rowH+gap; rowH=0;}
    for (const p of item.points) points.push({...p,x:p.x+x,y:p.y+y});
    w=Math.max(w,x+item.w);
    x+=item.w+gap;
    rowH=Math.max(rowH,item.h);
  }
  return {w,h:y+rowH,points};
}

function localGrid(ids, gap) {
  const cols = Math.ceil(Math.sqrt(ids.length));
  const rows = Math.ceil(ids.length / cols);
  return {w:cols*gap,h:rows*gap,points:ids.map((id,i)=>({
    id,x:(i%cols+0.5)*gap,y:(Math.floor(i/cols)+0.5)*gap,
  }))};
}

export function layoutPackedNetwork({ THREE, graph, groupById, settings={}, seed=1 } = {}) {
  const nodes = [...graph.nodes].sort((a,b)=>cmp(String(a.id),String(b.id)));
  const ids = new Set(nodes.map(node=>node.id));
  const edges = [...graph.edges].filter(e=>ids.has(e.fromId)&&ids.has(e.toId))
    .sort((a,b)=>cmp(String(a.fromId),String(b.fromId))||cmp(String(a.toId),String(b.toId))||
      cmp(String(a.type),String(b.type))||weight(a)-weight(b));
  const groups = new Map();
  const clusterByNode = new Map();
  const communityByNode = new Map();
  const affinities = new Map();
  const groupTies = new Map();
  const physics = new Set(settings.physicsEdgeTypes ?? []);
  const dependent = new Set(settings.dependentEdgeTypes ?? []);
  const hostByLeaf = new Map();
  const isCommunity = settings.strategy === "community";
  for (const node of nodes) {
    const group = groupById?.get(node.id) ?? "GROUP";
    bucket(groups,group,node.id);
    clusterByNode.set(node.id,group);
  }
  for (const edge of edges) {
    const a=clusterByNode.get(edge.fromId), b=clusterByNode.get(edge.toId);
    if (a === b && (!physics.size || physics.has(edge.type))) addTie(affinities,edge.fromId,edge.toId,weight(edge));
    if (a !== b && (!physics.size || physics.has(edge.type))) addTie(groupTies,a,b,weight(edge));
    if (a === b && edge.fromId !== edge.toId && dependent.has(edge.type)) {
      const current = hostByLeaf.get(edge.toId);
      if (!current || weight(edge)>weight(current)) hostByLeaf.set(edge.toId,edge);
    }
  }
  const gap=posNum(settings.minNodeSpacing,3.6);
  const groupGap=posNum(settings.minGroupGap,gap*4);
  const groupsPacked=[];
  const groupOrder=orderByTies(groups.keys(),groupTies);
  for (const group of groupOrder) {
    const children=groups.get(group);
    let bundles=[];
    if (isCommunity) {
      const byCommunity = findWeightedNetworkCommunities(children,affinities);
      const subgroups = new Map();
      for (const id of children) bucket(subgroups,byCommunity.get(id),id);
      for (const members of subgroups.values()) {
        const communityId=JSON.stringify([group,members[0]]);
        for (const id of members) communityByNode.set(id,communityId);
        bundles.push(localGrid(orderByTies(members,affinities),gap));
      }
    } else {
      const leavesByHost = new Map();
      const hosts = new Set([...hostByLeaf.values()].map(e=>e.fromId));
      for (const id of children) {
        const resolved=hostByLeaf.get(id)?.fromId;
        // Cycles/multi-level dependencies remain independently eligible hosts.
        if (resolved != null && !hosts.has(id)) bucket(leavesByHost,resolved,id);
      }
      const satellites = new Set([...leavesByHost.values()].flat());
      for (const host of orderByTies(children.filter(id=>!satellites.has(id)), affinities)) {
        const leaves=leavesByHost.get(host) ?? [];
        if (!leaves.length) { bundles.push(localGrid([host],gap)); continue; }
        const grid = localGrid(leaves,gap);
        const width = Math.max(grid.w,gap);
        bundles.push({w:width,h:grid.h+gap,points:[
          {id:host,x:width/2,y:0.5*gap},
          ...grid.points.map(p=>({...p,y:p.y+gap})),
        ]});
      }
    }
    groupsPacked.push(pack(bundles,gap*0.5));
  }
  const board=pack(groupsPacked,groupGap);
  const depth=posNum(settings.groupDepth,0);
  const floor=Number.isFinite(settings.floorY) ? settings.floorY : null;
  const positions=new Map(board.points.map(({id,x,y})=>[
    id,new THREE.Vector3(x-board.w/2,floor==null?board.h/2-y:floor+board.h-y,
      depth ? ((hashStringToU32(String(seed)+":"+String(id))/0xffffffff)-0.5)*depth : 0),
  ]));
  positions.clusterByNode=clusterByNode;
  positions.communityByNode=communityByNode;
  return positions;
}
