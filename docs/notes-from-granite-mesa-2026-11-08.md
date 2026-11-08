# Notes from Granite Mesa (2026-11-08)

Made at the owner's request; keep or rework as you see fit.

`createGraphSceneContext({scene: {fog: false}})` (`src/graph/context.js`): a scene without distance fog. It defaults to
true, so nothing else changes. Conduit and Loom use it: Halo's `fitBounds` now backs the view away to keep a whole graph in a
narrow pane, and with fog on (near 44, far 210) the graph faded out as it did.
