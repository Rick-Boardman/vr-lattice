// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createNetworkViewModel, deriveNetworkView, networkFitDistance, selectBackbonePaths } from "../src/graph/network-view.js";

const edge = (fromId, toId, type = "depends") => Object.freeze({ fromId, toId, type });
const graph = (ids, edges) => Object.freeze({ nodes: Object.freeze(ids.map(id => Object.freeze({ id }))), edges: Object.freeze(edges) });

test("maximum-weight forest retains a weak bridge, leaves separate components, and is stable", () => {
  const p = (fromId,toId,weight) => Object.freeze({fromId,toId,weight,count:1});
  const paths = [p("A","B",9), p("A","C",5), p("B","C",7), p("C","D",1), p("D","E",5), p("F","G",2)];
  const forest = selectBackbonePaths(paths,0);
  assert.deepEqual(forest,[paths[0],paths[2],paths[4],paths[5],paths[3]]);
  assert.deepEqual(selectBackbonePaths([...paths].reverse(),0),forest);
  const extra = selectBackbonePaths(paths,1);
  assert.equal(extra.length,forest.length+1);
  assert.ok(extra.every(path => paths.includes(path)));
  const ties = [p("a","b",1),p("a","c",1),p("b","c",1)];
  assert.deepEqual(selectBackbonePaths(ties,0),selectBackbonePaths([...ties].reverse(),0));
});

test("backbone uses community ties and real rendered endpoints, not organization-name neighbors", () => {
  const nodes = ["a1","a2","b","c","d"];
  const weighted = (fromId,toId,weight) => ({fromId,toId,weight});
  const data = graph(nodes, [weighted("a1","b",1), weighted("a2","b",4), weighted("a1","c",2),
    weighted("b","c",8), weighted("c","d",1)]);
  const affiliations = new Map(nodes.map(id => [id, id==="d"?"west":"east"]));
  const community = new Map([["a1","A"],["a2","A"],["b","B"],["c","C"],["d","D"]]);
  const model = createNetworkViewModel(data,affiliations,{summarizeOverview:true,overviewLinks:"backbone",backboneExtrasPerGroup:0},community);
  const view = deriveNetworkView(model);
  assert.equal(view.backbone,true);
  assert.equal(view.overviewPathCount,4);
  assert.deepEqual(view.aggregated.map(row=>[row.anchorFromId,row.anchorToId,row.count,row.weight]),
    [["b","c",1,8], ["a2","b",2,5], ["c","d",1,1]]);
  assert.ok(view.aggregated.every(row => data.edges.some(edge =>
    edge.fromId === row.anchorFromId && edge.toId === row.anchorToId)));
  assert.equal(deriveNetworkView(model,{overviewLinks:"group-summary"}).aggregated.length,1);
  assert.deepEqual(deriveNetworkView(model,{all:true}).raw,data.edges);
  assert.deepEqual(deriveNetworkView(model,{nodeId:"a2",focused:true}).raw,[data.edges[1]]);
});

test("overview aggregates only real cross-group endpoints; All restores every original edge identity", () => {
  const data = graph(["a", "b", "c", "d"], [edge("a","b"), edge("a","c"), edge("c","b"), edge("c","d"), edge("a","a")]);
  const model = createNetworkViewModel(data, new Map([["a","one"],["b","one"],["c","two"],["d","two"]]), { summarizeOverview:true });
  const overview = deriveNetworkView(model);
  assert.ok(overview.overview);
  assert.deepEqual(overview.aggregated, [{ fromId:"group:one", toId:"group:two", count:2 }]);
  const selected = deriveNetworkView(model, { nodeId:"a", focused:true });
  assert.deepEqual([...selected.nodeIds], ["a","b","c"]);
  assert.deepEqual(selected.raw, [data.edges[0],data.edges[1],data.edges[4]]);
  const group = deriveNetworkView(model, { groupId:"two" });
  assert.deepEqual(group.raw, [data.edges[1],data.edges[2],data.edges[3]]);
  const groupFocus = deriveNetworkView(model, { groupId:"two", focused:true });
  assert.deepEqual([...groupFocus.nodeIds], ["c","d"]);
  assert.deepEqual(groupFocus.raw, [data.edges[3]]);
  assert.deepEqual(groupFocus.aggregated, []);
  const all = deriveNetworkView(model, { all:true, nodeId:"a" });
  assert.deepEqual(all.raw, data.edges);
  assert.equal(all.raw[0], data.edges[0]);
});

test("collapsed leaves preserve external dependencies through hosts and restore exact links when expanded", () => {
  const data = graph(["server","db","app","other","ambiguous","loop-a","loop-b"], [
    edge("server","db","hosts"), edge("app","db"),
    edge("server","ambiguous","hosts"), edge("other","ambiguous","hosts"),
    edge("loop-a","loop-b","hosts"),edge("loop-b","loop-a","hosts"),
  ]);
  const model = createNetworkViewModel(data, new Map(), { hierarchy:{ dependentEdgeTypes:["hosts"], collapsedByDefault:true } });
  assert.deepEqual([...model.parents], [["db","server"]]);
  const collapsed = deriveNetworkView(model);
  assert.ok(!collapsed.nodeIds.has("db"));
  assert.deepEqual(collapsed.aggregated, [{fromId:"app",toId:"server",count:1}]);
  const expanded = deriveNetworkView(model, {nodeId:"server",focus:true,expandedHosts:new Set(["server"])});
  assert.ok(expanded.nodeIds.has("db"));
  assert.equal(expanded.raw[1],data.edges[1]);
  assert.deepEqual(deriveNetworkView(model,{all:true}).raw,data.edges);
});

test("padded camera fit uses the narrower axis and keeps positive finite results", () => {
  const wide = networkFitDistance(100, 70, 16/9);
  const narrow = networkFitDistance(100, 70, 0.58);
  assert.ok(wide > 100 && narrow > wide);
  const halfAngle = Math.atan(Math.tan(70*Math.PI/360) * 0.58 * 0.76);
  assert.ok(Math.abs(narrow * Math.sin(halfAngle) - 100) < 1e-9);
});
