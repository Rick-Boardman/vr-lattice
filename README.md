# Lattice

![Lattice: turn data into understanding](docs/assets/Lattice_Hero.png)

Lattice turns graphs, networks, and Mermaid flowcharts into interactive spatial
visualizations. It builds on [Halo](https://github.com/Rick-Boardman/vr-halo)
for the scene rig, WebGL HUD, navigation, input, and WebXR runtime.

**Apache-2.0. Developers and AI coding agents are welcome to use, modify,
distribute, and contribute.** Third-party components retain their own licenses.

## Try the included example

Install Node.js 24 and npm 11, then:

```sh
git clone https://github.com/Rick-Boardman/vr-lattice.git
cd vr-lattice
npm ci
npm start
```

Open http://127.0.0.1:8080/examples/graph/. No account, API key, private
repository, neighboring checkout, or cloud deployment is required. WebXR needs
HTTPS outside localhost and a compatible browser/device.

## What it provides

- Graph normalization, adjacency, metrics, and scene runners.
- Shared node/edge meshes, labels, card scenes, picking, and graph HUD helpers.
- Force-directed, clustered, and Mermaid flow layout.
- Configurable visual presets for workflow diagrams, topology, and relationships.

Applications own execution, persistence, integrations, and domain rules. Lattice
visualizes workflow structures; it does not execute workflows or connect databases.

## Installation and releases

Download the versioned package and checksum from
[Releases](https://github.com/Rick-Boardman/vr-lattice/releases).
See [the quick start](docs/quick-start.md) for exact installation commands,
browser import maps, and a runnable example. Browser-native modules need an
import map; bundlers resolve package imports normally. Keep one Three.js instance.

The package entry point is `@rb/lattice`; `/graph`, `/mermaid`, and documented
`/src/` subpaths are also available. Halo 0.2.0, Three.js 0.160.1, and Troika
are application-provided peers. A separate browser build preserves existing
sibling `/lattice/` and `/halo/` hosting paths.

## Develop and contribute

```sh
npm run build
npx playwright install chromium
npm run test:browser
npm run audit:release
npm run pack:deliverable
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).
AI-assisted contributions use the same licensing, testing, and review standards.
Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Documentation

- [Quick start](docs/quick-start.md)
- [Graph layout](src/graph/application-style-layout.md)
- [Scene effects](src/graph/scene-effects.md)
- [Browser distribution](docs/browser-distribution.md)
- [Third-party components and asset provenance](THIRD_PARTY.md)
- [Public release audit](docs/release-audit.md)
- [LICENSE](LICENSE) and [NOTICE](NOTICE)
