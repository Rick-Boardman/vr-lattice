# Lattice quick start

Lattice is plain JavaScript ES modules. Use Node.js 24 and npm 11 for the
repository tooling. The included browser example uses local installed dependencies.

## Run from a clean checkout

```sh
git clone https://github.com/Rick-Boardman/vr-lattice.git
cd vr-lattice
npm ci
npm start
```

Visit http://127.0.0.1:8080/examples/graph/.
The server binds to loopback only. Stop it with Ctrl+C. Open the example's
[index.html](../examples/graph/index.html) for the complete import map and
[main.js](../examples/graph/main.js) for the complete working application.

The example normalizes three nodes and two connections, uses Lattice's shared
mesh builders, composes Halo's scene/HUD runtime, and starts the render loop.
It uses synthetic data and makes no business-service requests.

The compact graph summary sits at the upper left; navigation Help opens at the
upper right on desktop. Click or tap a labeled node to see its details below the
summary. The bottom toolbar offers FIT (frame all nodes while preserving the view
angle), RESET (restore the front view and stop movement), HELP, and TOOLS (debug
and system log). Diagnostics start hidden. Narrow screens stack the panels and
start with Help collapsed; shorter screens scroll panel content to keep the graph
and toolbar accessible. Resizing reframes the graph for the available space.

For text-defined diagrams, start with [Mermaid flowcharts in 3D](mermaid.md).
It covers raw flowchart text, fenced Markdown, flat/spherical card rendering,
camera framing, controller APIs, and the precise supported subset. The graph
demo above does not parse Mermaid or exercise the Mermaid renderer.

## Install a versioned package in another application

```sh
npm install three@0.185.1 troika-three-text@0.52.4 @dagrejs/dagre@3.0.0 github:Rick-Boardman/vr-halo#v0.3.0 github:Rick-Boardman/vr-lattice#v0.3.1
```

Import graph helpers from `@rb/lattice` and the frame loop from `@rb/halo`.
A bundler can resolve these package imports. For browser-native ESM, use an import
map like the included example, adapting the module roots to your host. Map
`three` and all Troika transitive imports to a single compatible installation.
Also map `@rb/halo/` to the installed Halo root and `@dagrejs/dagre` to its
ESM build. These mappings replace any dependency on a sibling source checkout.
Copy Halo's asset directory and its accompanying font licenses together when
self-hosting modules. Serve JavaScript with a JavaScript MIME type.

Lattice 0.3.0 raises the exact Three.js peer from 0.160.1 to 0.185.1 and is
tested with Halo 0.3.0. Lattice 0.3.1 keeps that peer set. Graph boot uses
`THREE.Timer` instead of the deprecated `THREE.Clock`. Upgrade the application's
Three.js installation and Halo pin together; retain a single Three.js instance
for Halo, Lattice, and Troika. The Halo peer range remains `>=0.2.0`, and Troika
remains `^0.52.4` (development uses 0.52.4). WebGL 2 is required: Three.js
removed WebGL 1 support in r163. Public Lattice module paths are unchanged.

## Validate

```sh
npm run build
npx playwright install chromium
npm run test:browser
npm run audit:release
```

The browser check creates an actual WebGL context and saves a screenshot under
`dist/shots/`. Headless software rendering does not prove headset behavior.
Check physical-device input, text entry, and XR presentation on the devices you
support. Immersive WebXR requires a secure context and compatible hardware.

## Developer and AI-agent boundaries

Read [AGENTS.md](../AGENTS.md) before extending the library. Inspect actual
exports and option documentation rather than inventing APIs. Reuse shared
runtime and graph primitives, keep application policy in the application,
and report the checks you actually ran. Public hosted URLs may track a moving
release; use a tagged package for reproducible applications.
