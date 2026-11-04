import test from "node:test";
import assert from "node:assert/strict";
import {toCanonicalGraph} from "../src/graph/canonical.js";
import {deriveGraphStats,deriveAdjacency} from "../src/graph/derived.js";
import {parseMermaidFlowchart} from "../src/mermaid-flow-parser.js";
import {layoutFlow} from "../src/mermaid-flow-layout.js";
test("normalization rejects incomplete records and retains valid connections",()=>{
 const graph=toCanonicalGraph({nodes:[{id:"a",kind:"step"},null,{id:"b",kind:"step"},{id:"missing-kind"}],edges:[{from:"a",to:"b",kind:"flow"},{from:"a"}]});
 assert.equal(graph.nodes.length,2);assert.equal(graph.edges.length,1);assert.ok(deriveGraphStats(graph));assert.ok(deriveAdjacency(graph));
});
test("Mermaid LR layout places connected nodes in finite left-to-right order",()=>{
 const parsed=parseMermaidFlowchart("flowchart LR\n A[Input] --> B[Output]");
 assert.equal(parsed.nodes.length,2);
 const positions=layoutFlow(parsed);
 assert.equal(positions.size,2);
 for(const {x,z}of positions.values()){assert.ok(Number.isFinite(x));assert.ok(Number.isFinite(z));}
 assert.ok(positions.get("A").x<positions.get("B").x);
});
