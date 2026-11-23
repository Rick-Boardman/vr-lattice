// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createNetworkViewModel, deriveNetworkView, networkFitDistance } from "../src/graph/network-view.js";

const edge = (fromId, toId, type = "depends") => Object.freeze({ fromId, toId, type });
const graph = (ids, edges) => Object.freeze({ nodes: Object.freeze(ids.map(id => Object.freeze({ id }))), edges: Object.freeze(edges) });

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
