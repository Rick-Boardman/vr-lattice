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

`setEdgePreview({ fromId, ray, targetId })` on the card graph scene (null hides it): the dashed line and arrow of a connection being made,
from the source node's outline to where the pointer's ray meets the source's plane, or to a target node's outline. It costs nothing until
first used. Conduit and Loom call it each frame while a connection is in progress. `style.edgePreviewColor` sets the colour.

`src/graph/business-board.js` and `src/graph/business-icons.js` (owner: this belongs in Lattice, not copied into each app): the board's
connection settings, toolbar and panel colours, status badge, icon set and the connection line preview. Conduit, Loom and Insight import
them. `@rb/halo` now follows Halo's `main`: the owner's rule is that Lattice always uses the latest Halo.
