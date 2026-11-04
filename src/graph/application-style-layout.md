# Application-Style Shared Graph Layout

This repo uses a single shared force/constraint layout for both:

- `3d-scenes.html?scene=application-network`
- `3d-scenes.html?scene=people-network`

The shared implementation is:

- [runtime/graph/application-style-layout.js](application-style-layout.js)
  - `layoutClusteredGraphApplicationStyle(...)`

## Goals

- One ruleset (no graph-type special casing) that behaves well for:
  - Sparse graphs (pairs, rings/cycles)
  - Medium density graphs (communities, hubs, dumbbells)
  - Dense graphs (near-cliques)
- Desktop + Quest/WebXR stability:
  - Bounded iteration counts
  - Avoid per-frame allocations inside simulation loops
- Readability:
  - Enforce a true minimum spacing between nodes to reduce “hairball” overlap
  - Keep clusters coherent without collapsing into a single blob

## High-Level Model

The layout is a two-scale pipeline:

1. **Group centers (macro)**
   - Nodes are assigned to groups via `groupById`.
   - Each group gets a center position in 3D.
   - `centerGroupName` can pin one group at the origin.
   - `splitCenterGroupCount` can split a large center group into several sub-centers (deterministically by id hash).

2. **Per-group relaxation (micro)**
   - For each group, we simulate node positions using:
     - **Edge attraction** (springs) toward a rest length
     - **Soft repulsion** (inverse-square within a cutoff)
     - **Weak center pull** (keeps the group cohesive)
     - **Hard minimum-spacing projection** (a constraint solve step)
     - **Bounding radius** (prevents infinite expansion)

This is repeated for a fixed number of steps. The algorithm is deterministic for a given `seed`.

## Why Dense Graphs Look “Noisy” Without Constraints

A dense graph (e.g. clique-like) has many edges/springs. With only soft forces:

- Springs can collectively overwhelm repulsion and center the graph into a tight ball.
- Soft repulsion is not a hard guarantee; it can be countered by other forces.
- Even if node positions are reasonable, rendering hundreds of edges produces visual clutter.

To address the *layout* component (not just rendering), this layout adds a hard spacing constraint.

## The Hard Minimum-Spacing Constraint

A common expectation is: **after enough iterations, nodes should not remain “too close.”**

Soft repulsion cannot guarantee that. So we add a position-based projection step per iteration:

- After integrating velocities into positions, we check node pairs.
- If a pair’s distance is below `minNodeSpacing`, we push them apart along the connecting axis.
- We split the correction equally between both nodes.
- This runs for `spacingSolverIters` passes (small number) so corrections propagate.

This behaves like a “bounce around until separated” rule:

- Springs pull connected nodes together.
- The spacing solver pushes overlapping/too-close nodes apart.
- Damping stabilizes the system.

### Key tunables

- `minNodeSpacing` (default: `3.6`)
  - The enforced minimum distance between nodes in the per-group relaxation.
- `spacingSolverIters` (default: `1`)
  - Extra iterations improve constraint satisfaction but increase runtime cost.

These parameters are intentionally part of the shared layout signature so both scenes use the same rules.

## Density-Aware Scaling (No Special Cases)

To keep the same ruleset stable across densities, the layout scales some forces using density/degree statistics computed from the group’s spring set:

- **Spring strength** scales down as mean degree increases.
- **Center pull** scales down as density increases.
- **Repulsion** scales up slightly as density increases.
- **Bounding radius** expands slightly as density increases.

This helps dense graphs inflate into more isotropic (sphere-like) shapes while preserving sparse graph structure.

## Performance Notes

- The simulation uses typed arrays (`Float32Array`) for positions/velocities.
- Repulsion work is bounded with a `repelNeighborSpan` heuristic on large groups.
- The hard spacing solver reuses the same span to avoid worst-case O(n²) on very large groups.

## Debugging / Validation

Quick test graphs added under `3d-scenes/`:

- `people-network-graph-ring12.json` (cycle)
- `people-network-graph-pairs12.json` (degree-1 pairs)
- `people-network-graph-clique12.json` (dense clique)
- `people-network-graph-clique40.json` (dense clique)
- `people-network-graph-dumbbell8.json` (two hubs + leaves)
- `people-network-graph-dumbbell16.json` (bigger dumbbell)

Load via:

- `3d-scenes.html?scene=people-network&config=./3d-scenes/people-network/people-network.json`

## Integration Contract

Callers provide:

- `nodes`, `edges`
- `groupById: Map<nodeId, groupName>`
- Optional tuning callbacks:
  - `restLengthForEdge(edge, aNode, bNode)`
  - `boundRForGroup(groupName, ids)`
  - `includeEdgeInPhysics(edge)`
  - `typeOfNode(node)` / `initRadiusByType`
  - `placeUnpositioned(positions, ctx)`

The function returns:

- `Map<nodeId, THREE.Vector3>` positions.
