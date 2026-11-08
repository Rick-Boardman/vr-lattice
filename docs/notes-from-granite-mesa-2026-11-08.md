# Notes from Granite Mesa (2026-11-08)

Made at the owner's request; keep or rework as you see fit.

`createGraphSceneContext({scene: {fog: false}})` (`src/graph/context.js`): a scene without distance fog. It defaults to
true, so nothing else changes. Conduit and Loom use it: Halo's `fitBounds` now backs the view away to keep a whole graph in a
narrow pane, and with fog on (near 44, far 210) the graph faded out as it did.

`style.flatActionEdgeAnchorMode: "nearest-surface"` (`src/graph/card-graph-scene.js`, `src/graph/node-surface.js`), at the owner's
request: on a flat board a connection is a straight line from one node's outline to the other's, along the line between their centres,
for card, pill, diamond and hexagon shapes. A straight line bends only when another node is in the way (the existing detour). A pair
running both ways keeps apart by 0.16; a self-connection is a small loop on the right. Standing handles go: the out handle shows on the
selected node only, at its right edge, on a layer neither the cameras nor the pick ray see otherwise. Other modes and the sphere layout
are unchanged. Tested: `tests/node-surface.test.mjs`.
