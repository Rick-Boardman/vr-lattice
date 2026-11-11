# Browser distribution

Install Lattice from a pinned release tag, for example
`github:Rick-Boardman/vr-lattice#v0.2.1`, in your application's `package.json`.
The installed source package uses standard `@rb/halo/src/...` and
`@dagrejs/dagre` imports. Bundlers resolve these package imports normally.

For browser-native modules, map Lattice to the installed package:

```html
<script type="importmap">
{
  "imports": {
    "@rb/lattice": "./node_modules/@rb/lattice/src/graph/index.js",
    "@rb/lattice/": "./node_modules/@rb/lattice/"
  }
}
</script>
```

Paths are relative to the application's document URL. Add the Halo, Three.js,
Troika and Dagre mappings shown in the [included example](../examples/graph/index.html),
using one compatible Three.js installation. For the Mermaid entry point, also map
`@rb/lattice/mermaid` to `./node_modules/@rb/lattice/src/mermaid/index.js`.
See the [quick start](quick-start.md) for dependency installation and hosting requirements.

`npm run build` validates imports and runs the unit tests. It does not generate a
separate browser artifact or rewrite dependency imports. Deploy the installed
packages with their accompanying licenses and notices, including Dagre and
Graphlib's MIT notices.
