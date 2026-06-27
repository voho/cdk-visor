# cdk-visor

An interactive, fullscreen viewer for **AWS CDK** applications. Start at the
root construct and browse down through every level of detail — stacks,
constructs, individual CloudFormation resources, and the source code that
created them.

![cdk-visor](https://img.shields.io/badge/built%20with-Vite%20%2B%20React%20%2B%20TypeScript-4f9cf9)

## What it does

CDK apps synthesize into a *cloud assembly* (the `cdk.out/` directory). That
directory holds the construct tree, the manifest, and the generated
CloudFormation templates — but they're spread across several JSON files and are
hard to explore by hand. cdk-visor stitches them back together into a single,
navigable model:

- **Browse the construct tree** from the `App` root down to leaf resources, in a
  clean breadcrumbed canvas or the collapsible tree explorer.
- **Visualize relationships as a graph** — render the current level as an
  auto-laid-out diagram of nodes and their CloudFormation references, with four
  layout algorithms (hierarchical, force-directed, circular, grid), pan/zoom and
  click-to-drill.
- **Inspect any node** — its construct class (jsii fqn), logical id, properties,
  dependencies, and aggregate resource counts.
- **Trace references** — for any resource, see what it references and what
  references it (`Ref`, `Fn::GetAtt`, `Fn::Sub`, `DependsOn`, `Fn::ImportValue`),
  each link click-through navigable.
- **Drop down to CloudFormation** — see the exact synthesized resource (or, for
  a stack, the full template with readable parameters and outputs).
- **Jump to source** — when the assembly was synthesized with traces enabled,
  every resource links back to the line of CDK code that created it, with inline
  syntax highlighting.
- **Search everything** (`⌘K` / `Ctrl-K`) by name, path, CloudFormation type, or
  logical id, **filter** the tree, resize the panels, and share the exact view
  via the URL.

It ships with a built-in demo app (`ShopApp`) so you can try it immediately.

## Quick start

```bash
npm install
npm run dev          # open http://localhost:5173
```

The demo loads automatically. To explore your own app, click **Open project…**
and pick your project directory (or just the `cdk.out/` folder) — or drag &
drop it anywhere on the window. Everything is parsed in the browser; nothing is
uploaded.

```bash
npm run build        # type-check + production build into dist/
npm run preview      # serve the production build
npm run gen:demo     # regenerate the bundled demo assembly
```

## Pointing it at your CDK app

1. Synthesize your app:

   ```bash
   cdk synth
   ```

   This writes `cdk.out/` with `tree.json`, `manifest.json`, and one
   `*.template.json` per stack.

2. To get **source traces** (the "Source" tab), synthesize with debug tracing
   on so CDK records where each construct was created:

   ```bash
   CDK_DEBUG=true cdk synth
   ```

3. In cdk-visor, click **Open project…** and select your **project root**
   (recommended — this lets the viewer read both `cdk.out/` *and* your `.ts`
   sources so traces resolve inline), or just the `cdk.out/` directory.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `⌘K` / `Ctrl-K` or `/` | Open search |
| `↑` `↓` `←` `→` | Move selection within the current level |
| `Enter` | Drill into the selected node |
| `Esc` / `Backspace` | Go up one level |

## How it works

```
cdk.out/
├── tree.json            ← the construct hierarchy (the spine of the model)
├── manifest.json        ← logical ids + source traces, per stack
└── *.template.json      ← synthesized CloudFormation, one per stack
```

The loader reads these artifacts and `buildModel()` (`src/lib/model.ts`) merges
them into one enriched tree:

- the **construct tree** provides the hierarchy and each node's jsii type;
- each resource is linked to its **CloudFormation resource** via the
  `aws:cdk:path` metadata embedded in every template resource;
- **logical ids and traces** come from the manifest's per-stack metadata.

The result is a single `VisorNode` tree where every node knows its children, its
CloudFormation output, and where it came from. If a `tree.json` is missing,
cdk-visor still works by reconstructing a tree from the templates alone.

The reference graph (`src/lib/references.ts`) is derived from the same templates
by extracting CloudFormation intrinsics, and the graph view aggregates those
edges up to whichever level you're browsing — so the diagram is meaningful for a
whole stack or the internals of a single construct.

### Project layout

```
src/
├── types/cdk.ts          # types for the cloud-assembly artifacts
├── lib/
│   ├── model.ts          # buildModel(): the unified, enriched construct tree
│   ├── references.ts     # resource-to-resource reference graph
│   ├── graph.ts          # aggregate references into a per-level graph
│   ├── layout.ts         # auto-layout algorithms (layered/force/circular/grid)
│   ├── loader.ts         # load demo / directory / drag-drop + source resolution
│   ├── search.ts         # ranked search over the model
│   ├── icons.ts          # CFN type → badge label + color
│   ├── highlight.ts      # tiny JSON + TS syntax highlighters
│   ├── url.ts            # shareable view state in the URL hash
│   ├── docs.ts           # jsii fqn → AWS CDK docs URL
│   ├── dnd.ts            # recursive directory drag & drop
│   └── *.test.ts         # unit tests (Vitest)
├── components/           # TopBar, TreePanel, Canvas, GraphCanvas, Inspector…
└── App.tsx               # state + navigation orchestration
scripts/gen-demo.mjs      # generates the bundled demo cloud assembly + sources
public/demo/              # the generated demo (cdk.out + src)
```

## Development

```bash
npm run dev          # dev server
npm test             # run the unit tests (Vitest)
npm run test:e2e     # run the end-to-end tests (Playwright)
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run build        # type-check + production build
```

Unit tests (`src/**/*.test.ts`) cover the model, reference graph, layout
algorithms, search and highlighters; end-to-end tests (`e2e/`) drive the built
app in a real browser. CI (`.github/workflows/ci.yml`) runs lint, type-check,
unit tests, build and the Playwright e2e suite on every push and pull request.

## Native macOS app

cdk-visor can be packaged as a native macOS app with [Tauri](https://tauri.app),
which wraps the same frontend in the system WebView (WKWebView) — a small
(~5–15 MB) `.app`/`.dmg` rather than a bundled browser. The native build adds a
real folder picker (reading the chosen directory in Rust, which sidesteps
WebView file-access limits); drag-and-drop and the bundled demo work too.

**Prerequisites** (on macOS):

- [Rust](https://www.rust-lang.org/tools/install) (`rustup`)
- Xcode Command Line Tools (`xcode-select --install`)

**Run / build:**

```bash
npm install
npm run tauri:dev      # launch the app in development (hot-reloads the frontend)
npm run tauri:build    # produce a release .app + .dmg
```

The built app lands in `src-tauri/target/release/bundle/` (`macos/cdk-visor.app`
and `dmg/cdk-visor_<version>_<arch>.dmg`). For a universal binary:
`npm run tauri:build -- --target universal-apple-darwin`.

> Distribution outside your own machine requires signing/notarizing with an
> Apple Developer ID; see the Tauri macOS code-signing guide. The native shell
> lives in `src-tauri/` (a small Rust crate); the web app is unchanged and still
> runs in any browser.

## Tech

Vite + React + TypeScript, no UI framework and no graph/layout libraries — the
layout algorithms are implemented from scratch. All parsing and rendering
happens client-side. The optional native shell is a thin Tauri (Rust) wrapper.

## License

See [LICENSE](./LICENSE).
