# Third-party components

The project's original code and documentation use Apache-2.0. Third-party
components retain their own licenses; the root LICENSE does not relicense them.

| Component | Locked version | License | Distribution |
| --- | --- | --- | --- |
| Three.js | 0.160.1 | MIT | Installed dependency; provided by the application |
| troika-three-text | 0.52.4 | MIT | Installed dependency |
| troika-three-utils | 0.52.4 | MIT | Transitive dependency |
| troika-worker-utils | 0.52.0 | MIT | Transitive dependency |
| webgl-sdf-generator | 1.1.1 | MIT | Transitive dependency |
| bidi-js | 1.0.3 | MIT | Transitive dependency |
| require-from-string | 2.0.2 | MIT | Transitive dependency |

Exact dependency provenance and integrity are recorded in package-lock.json.
Dependency license texts remain in the installed packages. Applications that
bundle dependencies must preserve their applicable copyright and license notices.
Browser-test tooling is a development dependency and is excluded from the
library tarball.

Development tooling: playwright and playwright-core 1.62.1 use Apache-2.0;
the optional macOS watcher fsevents uses MIT. Their exact resolved versions,
integrity hashes, and license identifiers are recorded in package-lock.json.

| Additional component | Locked version | License | Distribution |
| --- | --- | --- | --- |
| Halo | 0.2.0 | Apache-2.0, with separately licensed fonts/data | Application-provided peer |
| @dagrejs/dagre | 3.0.0 | MIT | Dependency; bundled in browser distribution |
| @dagrejs/graphlib | 4.0.1 | MIT | Bundled inside Dagre's ESM build |

Dagre and Graphlib copyright/license texts are preserved in [LICENSES](LICENSES/).
The browser build copies the installed Dagre ESM bundle without modification.
The hero artwork was supplied by the project owner and is included as project
documentation under Apache-2.0; it is illustrative, not a runtime asset.
`docs/assets/Mermaid_Flow.png` is a browser screenshot generated from this
project's documented Mermaid scene example and is included as project
documentation under Apache-2.0.
