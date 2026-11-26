import test from "node:test";
import assert from "node:assert/strict";
import { createNetworkViewModel, deriveNetworkView, selectCommunityLinks, networkFitDistanceForPoints, networkFitDistance } from "../src/graph/network-view.js";
import { retainNonoverlappingNetworkLabels } from "../src/graph/network-label-collision.js";

const edge = (fromId, toId, weight = 1) => ({ fromId, toId, weight, type: "chat" });

test("the backbone overview keeps a small graph's links inside each community", () => {
  // Two 4-person communities joined by one bridge: the overview showed only the bridge.
  const nodes = ["a1","a2","a3","a4","b1","b2","b3","b4"].map(id => ({ id }));
  const edges = [edge("a1","a2"), edge("a1","a3"), edge("a1","a4"), edge("b1","b2"), edge("b1","b3"), edge("b1","b4"), edge("a1","b1", 5)];
  const community = new Map(nodes.map(({ id }) => [id, id[0]]));
  const model = createNetworkViewModel({ nodes, edges }, new Map(), { overviewLinks: "backbone" }, community);
  const view = deriveNetworkView(model);
  assert.equal(view.backbone, true);
  assert.equal(view.aggregated.length, 1, "one path between the two communities");
  assert.equal(view.raw.length, 6, "every link inside them");
});

test("a large graph keeps each person's strongest links inside a community", () => {
  const inside = [edge("a","b",9), edge("a","c",8), edge("a","d",1), edge("b","c",7), edge("c","d",2)];
  const kept = selectCommunityLinks(inside, 500, { overviewLinksPerNode: 1 });
  assert.ok(kept.some(e => e.fromId === "a" && e.toId === "b"), "the strongest link stays");
  assert.ok(!kept.some(e => e.fromId === "a" && e.toId === "d"), "a weak link of two satisfied people goes");
  assert.equal(selectCommunityLinks(inside, 50).length, inside.length, "a small graph keeps them all");
});

test("the fit distance frames the actual extent, never beyond the bounding-sphere fit", () => {
  // A flat, wide graph: the sphere fit is driven by its radius, the extent fit by what the camera sees.
  const points = [];
  for (let x = -20; x <= 20; x += 5) for (let z = -3; z <= 3; z += 3) points.push({ x, y: 0, z });
  const out = { x: 0.08, y: 0.61, z: 0.8 };
  const extent = networkFitDistanceForPoints(points, { x: 0, y: 0, z: 0 }, out, 70, 1400 / 900, { fill: 0.8 });
  const sphere = networkFitDistance(Math.hypot(20, 3), 70, 1400 / 900);
  assert.ok(extent < sphere, `extent fit ${extent.toFixed(1)} is closer than the sphere fit ${sphere.toFixed(1)}`);
  // Every point projects inside 80% of the half-width at that distance.
  const tan = Math.tan(35 * Math.PI / 180) * 1400 / 900;
  const len = Math.hypot(out.x, out.y, out.z); const o = { x: out.x / len, y: out.y / len, z: out.z / len };
  const rl = Math.hypot(o.z, o.x); const r = { x: o.z / rl, y: 0, z: -o.x / rl };
  for (const p of points) {
    const depth = extent - (p.x * o.x + p.y * o.y + p.z * o.z);
    assert.ok(Math.abs(p.x * r.x + p.z * r.z) <= 0.8 * tan * depth + 1e-6);
  }
});

test("a person's label that would hide another node yields, a group label does not", () => {
  const label = (id, rect, extra = {}) => ({ label: { id, userData: { nodeId: id, ...extra } }, rect, depth: 1, protected: false, priority: 0 });
  const covering = label("p1", { left: 0, right: 100, top: 0, bottom: 20 });
  const group = { ...label("g", { left: 200, right: 300, top: 0, bottom: 20 }, { groupKey: "group:x" }), priority: 1 };
  const obstacles = [{ x: 50, y: 10, owner: "p2" }, { x: 10, y: 10, owner: "p1" }, { x: 250, y: 10, owner: "p3" }];
  const visible = retainNonoverlappingNetworkLabels([covering, group], new Set(), obstacles);
  assert.equal(visible.has(covering.label), false, "hides p2");
  assert.equal(visible.has(group.label), true);
});
