# Browser distribution

The source package uses standard `@rb/halo/src/...` and `@dagrejs/dagre` imports.
Use a bundler or the included example's browser import map when consuming it.

`npm run build` also creates `dist/browser/`. This deterministic hosting artifact
rewrites only those dependency imports to sibling `/halo/src/...` modules and
Lattice's bundled Dagre ESM file. It preserves the existing `/lattice/src/...`
module URLs. Halo is not copied into Lattice; deploy a compatible Halo alongside
it. Other application imports and the public API remain unchanged.

Dagre's bundled Graphlib code and both full MIT notices travel with the artifact.
Do not publish a stale build: rebuild from the lockfile and test consumers before
deployment. A source-package release does not automatically deploy a hosted copy.
