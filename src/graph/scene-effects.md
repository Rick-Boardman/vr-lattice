# Shared Graph Scene Effects

This note captures the reusable presentation ideas from the retired standalone
main-flow demo and describes where graph-scene effects belong in the shared
runtime.

## What Is Already Shared

### Edge pulse

The shared runtime already owns the graph pulse effect:

- `src/network-pulse.js`
- `createNetworkPulseEffect(...)`
- `src/graph/scene-config.js`

The `"mainflow"` pulse style preserves the sharper pulse profile inspired by the
old demo while keeping the implementation reusable and scene-agnostic.

Use this when a graph scene needs to emphasize data flow or active incident
edges without introducing app-local effect code.

### Stable settle layout

The shared runtime also owns the graph settle/layout behavior:

- `src/force-layout.js`
- `src/graph/application-style-layout.js`

These modules create readable settled graph layouts with spring, repulsion,
spacing, and centering rules. They are intentionally one-shot solvers rather
than per-frame bounce physics.

## What Was Retired With The Standalone Main-Flow Demo

The old demo also bundled several presentation-specific behaviors that were not
promoted into shared runtime code:

- a ballistic drop-and-settle entrance animation for graph nodes
- impact-triggered bounce audio
- random electrical zap audio during pulse playback
- DOM buttons and CSS2D labels

Those behaviors were app-local and not appropriate as shared defaults.

## Shared Runtime Direction

If these effects come back, the shared runtime version should follow these
rules:

- no DOM overlays or CSS2D labels
- desktop and Quest/WebXR safe by default
- presentation effects stay opt-in instead of becoming default graph behavior
- audio is optional and never required for correctness
- node motion works from shared graph scene meshes and resolved target positions

### Future staged entrance effect

If a graph scene needs the old falling-cubes feel, add a dedicated runtime
controller rather than reviving a standalone app harness.

Suggested shape:

- `createGraphDropSettleEffect({ THREE, nodes, floorY, bounds, gravity, bounce, angularDamping, onImpact })`
- `start()`
- `reset()`
- `update(dt)`

Responsibilities:

- spawn nodes above their final settled positions
- animate toward rest with bounded, deterministic-enough motion
- stop cleanly once nodes settle so normal shared graph interaction can take over
- report optional impact callbacks without coupling graph rendering to audio

### Future optional audio

If we add graph-effect audio, keep it isolated and optional.

Suggested shape:

- `createGraphEffectAudio({ audioContext, enabled })`
- `playImpact({ velocity })`
- `startPulseLoop()`
- `stopPulseLoop()`

Rules:

- never autoplay before a user gesture
- graph visuals must remain correct when audio is unavailable or disabled
- audio is presentation chrome, not runtime behavior

## Validation Harnesses

Validate graph effects in live runtime-backed scenes:

- `https://www.netciv.com/helix/`
- `https://www.netciv.com/chorus/`
- `https://www.netciv.com/conduit/`

Do not add new graph-effect work back into retired standalone demos.
