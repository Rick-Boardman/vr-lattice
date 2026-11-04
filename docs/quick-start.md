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

## Install a versioned package in another application

```sh
npm install three@0.160.1 troika-three-text@0.52.4 @dagrejs/dagre@3.0.0 https://github.com/Rick-Boardman/vr-halo/releases/download/v0.2.0/rb-halo-0.2.0.tgz https://github.com/Rick-Boardman/vr-lattice/releases/download/v0.2.0/rb-lattice-0.2.0.tgz
```

Import graph helpers from `@rb/lattice` and the frame loop from `@rb/halo`.
A bundler can resolve these package imports. For browser-native ESM, use an import
map like the included example, adapting the module roots to your host. Map
`three` and all Troika transitive imports to a single compatible installation.
Also map `@rb/halo/` to the installed Halo root and `@dagrejs/dagre` to its
ESM build. These mappings replace any dependency on a sibling source checkout.
Copy Halo's asset directory and its accompanying font licenses together when
self-hosting modules. Serve JavaScript with a JavaScript MIME type.

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
