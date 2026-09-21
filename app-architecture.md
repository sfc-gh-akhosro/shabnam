# Shabnam — App Architecture

**CSS on DOT diagrams.** A DOT-in, HTML-out workbench. Graphviz is the only DOT consumer. We do not write a parser, a tokenizer, or an AST.

This file is the blueprint. It describes the app we are building from scratch. When this document and the code disagree, the document wins until we change the document together.

---

## 0. Stack

Bun (ESM packaging only) + viz.js + TypeScript + SolidJS + HTML + CSS.

Any change or adding a major library, tech, or tool must be discussed and added here first.

**The stack is a lock, not carved stone.** "Discussed first" means *bring it up*, not *do without*. If a feature is genuinely better served by a library — a real parser instead of a hand-rolled scanner, a real AST instead of string surgery — say so, make the case, and we amend this section. Hand-rolling something a mature library does properly, in order to avoid a conversation, is the worse outcome: it is more code, less correct, and ours to maintain forever. What stays forbidden is a library that changes the *design* — a second DOT reader, a second layout engine, a second UI framework — and that ban is about the design, not about the dependency count.

Type-driven TypeScript, following Go / Rust:

- `interface` — methods only. No fields. Same role as a Go interface or a Rust trait.
- `type` — data only. No methods.
- `Map` (or a `Record` used as a map) — enum simulation: attribute value → function. First map: **shape → nodeHTML**.

Soft limits of **7** are in §9. Organization idea, not a wall. Break occasionally if the design forces it — not as the routine.

---

## 1. What the product is

Shabnam turns a Graphviz DOT file into a single HTML page that you can restyle and annotate.

The user authors a diagram in DOT — the same language already used for architecture diagrams. Shabnam does **not** try to be Graphviz. It hands the DOT to Graphviz to get **one JSON**. Then we **traverse that JSON once** into our own model, and from the model we build:

1. **Derived CSS** — almost empty if DOT has no style; `Css.plus` folds it into `style.css`
2. **Layout HTML** — columns of node HTML
3. **SVG layer** — shells and connectors, drawn around the *measured* boxes

After the JSON, **we** own the picture.

Canvas skeleton — the named sinks each worker fills:

```html
<div id="shabnam-canvas">
  <div id="shabnam-main-html"><!-- layout + node HTML (zero inline styles) --></div>
  <svg id="shabnam-main-svg">
    <g id="shabnam-clusters"></g>
    <g id="shabnam-node-shells"></g>
    <g id="shabnam-connectors"></g>
  </svg>
  <div id="shabnam-annotation-html"></div>
  <style id="shabnam-theme-css"></style>
  <style id="shabnam-style-css"></style>
  <script id="shabnam-action-js"></script>
</div>
```

**Every id the app owns is prefixed `shabnam-`.** Node ids are DOT names (§3.1),
so the page's own ids and the diagram's ids share one space — and a diagram with
a node called `connectors` had its edge markup written into that node's `<div>`.
The prefix is the wall between the two namespaces. It is plumbing: derived CSS never
references a sink id, and neither should a theme.

The CSS cascade is two sinks:
1. `#shabnam-theme-css` — `theme/theme.css` (locked base, always first) plus the selected overlay from `theme/*.css`. Structural defaults (`.diagram`, `.column`, `.node`), tokens, mixins, keyframes.
2. `#shabnam-style-css` — `style.css` tab text: derived CSS plus user entries (`Css.plus`), `@apply` expanded against the theme. There is no derived sink.

Nodes have **two layers**: an HTML layer (`shape →` markup, in flow, measurable) and an SVG layer that draws a **shell** around the measured box, with icon and caption inside the shell.

The product is a **JSFiddle-style workbench**: one page, one canvas, editor tabs that inject into the sinks. Everything runs in the browser. There is never a second grammar.

If a proposed change requires reading DOT as a string — tokenize, recursive descent, `parseAst`, `parseStatements`, regex over statements — it is out of scope. Stop and come back to this document.

---

## 2. What Graphviz is for — and what it is not

`@viz-js/viz` (`instance()` then `renderJSON(dot)`) is the **only** thing that reads DOT.

| Job | Where it lives in the JSON | We do |
|---|---|---|
| Layout | `pos`, `rankdir` | Traverse. Group nodes into columns. |
| Style / identity | `fillcolor`, `color`, `fontname`, `fontsize`, `penwidth`, `style`, `bgcolor`, `label`, `shape`, subgraph `name`, edge `tail` / `head` | Traverse. Emit derived CSS. Put classes and ids on elements. |
| Custom keys | `icon`, `shell`, `caption` when present on the object | Read the field. Do not re-parse the source. |

There is no third job called "parse DOT ourselves." Defaults are already resolved onto objects. Subgraph names are already on subgraph objects. Cluster membership is the subgraph object's `nodes` index list.

Graphviz is **not** our renderer, our HTML, our CSS, or our geometry. We use its `pos` to decide *which column* a node is in, and nothing else — never its `_draw_` paths, never its pixel sizes.

viz.js is inlined in the page. Redraw calls `renderJSON` again on every run. That is Graphviz doing its one job repeatedly, not a second parser.

---

## 3. The shape of the design — one traversal, one model

The whole app is a short pipeline behind a few package interfaces.

```
DOT text
  │
  ├─ Vizer.render ────────► VizJson          the only DOT consumer
  │
  ├─ Diagram.bag ─────────► DiagramModel     the only VizJson consumer
  │
  ├─ Diagram.frame ───────► mainHtml         columns + node HTML
  ├─ Diagram.derived ─────► derived.css      almost empty if DOT has no style
  ├─ Css.plus(derived, style) ► style.css tab + #shabnam-style-css
  │
  │      ── inject, let the browser paint ──
  │
  ├─ Workbench.measure ────► Box[]
  ├─ Diagram.clusters / shells / connectors ► SVG sinks
  └─ Workbench.place ──────► annotation.html
```

Two rules make this hold together:

**One traversal, one model.** `Vizer` is the only caller of viz.js. `Diagram.bag` is the only reader of `VizJson`. Everything downstream works on `DiagramModel`. Graphviz's shape is quarantined in one file.

**Pure diagram workers, one DOM owner.** Files in `diagram/` are pure: data in, string out. They sit behind the `Diagram` facade. Only the workbench touches the live page.

One named exception: `css/` uses **CSSOM** — `new CSSStyleSheet()` and `replaceSync` — because the browser is our CSS parser (`Css.plus`). Off-document sheets; nothing is applied and nothing reflows. If CSSOM is missing, `Css.plus` throws. Do not concatenate strings as a fallback.

Hard rule: if a step is not "call viz", "traverse the JSON", or "emit HTML / CSS / SVG", it does not belong in this app.

### 3.1 `DiagramBagger` — the model

Bags the JSON into `DiagramModel`: nodes, edges, clusters, `rankdir`. This is where identity is decided, once, for everyone:

1. Every **subgraph name** becomes a CSS **class**, applied to member nodes and to nested subgraphs.
2. Each node carries its id and its class list (the subgraph names it belongs to).
3. Each edge carries its id and its class list.
4. `pos` is read into numeric `x` / `y` here. Downstream workers never see a `pos` string.

**Identity in CSS is identity in DOT. Nothing less, nothing more.**

This is the law of the styling surface. A person or an agent that can read the DOT can write the CSS without learning a second vocabulary, and can grep one for the other.

| Object | DOT | CSS |
|---|---|---|
| node | `lake` | `#lake` |
| subgraph | `subgraph cluster_source` | `.cluster_source` |
| edge | `lake -> runtime` | `#lake_runtime` (`_2`, `_3` … for parallel edges) |
| anonymous subgraph | `subgraph { … }` | `.subgraph_1`, `.subgraph_2` … by appearance order |

No prefix, no namespace, and **no `cluster_` stripping** — `cluster_source` is the name the DOT wrote, so it is the class. Nodes, edges, and clusters share one HTML id space and we accept that two of them can rarely want the same string; the acceptance is only safe because it is loud.

Sanitizing an id replaces every character outside `[A-Za-z0-9_-]` with `-`. Two different DOT ids that sanitize to the same string are a **collision: throw**. Silent id collapse produces a malformed page, and a malformed page is much harder to debug than a stack trace.

A corollary, and a test you can apply to any class in the output: **a class that is not a DOT name must be referenced by theme or style to exist at all.** `node`, `edge`, `column`, `label`, `shell`, `caption`, `badge`, `arrow` earn their place because the theme styles them. A grouping class nothing selects is noise on the element and gets deleted.

### 3.2 `CssBagger` — derived styling

Consumes the model, emits derived CSS text. Important attrs only — not comprehensive. Almost empty if DOT has no presentation.

Attribute-to-property translation is a registry, not scattered logic:

```
ATTR_CSS: Map<string, string>
  fillcolor → background-color
  bgcolor   → background-color
  color     → border-color
  fontname  → font-family
  fontsize  → font-size
  penwidth  → border-width
```

Unmapped attributes are skipped. `style` (`filled`, `dashed`, `invis`) is a value-to-declaration case and is handled by its own map when we need it — not in the first pass.

**Derived CSS never invents a colour.** Every colour traces to a DOT attribute or a `:root` variable. If the DOT declares four colours, four is what the reader should find.

**Selectors are flat and as short as they can be.** `.diagram .column` and `.column` identify the same place, because there is only one place a column can be, so the shorter one wins. There is no `.diagram { … }` wrapper block, and the SVG layer's `.shell` / `.caption` / `.edge` / `.arrow` carry no sink id in front of them — they are already unique. A subgraph block still nests, because that is what `&` needs.

How a **bag** is chosen: Graphviz has already applied `node [...]` / `edge [...]` defaults onto every object, so we recover the defaults statistically. For each style key, the **most common** value across all nodes becomes `.diagram .node`; likewise for edges. **Absence counts as a value** in that tally — one edge in eighteen carrying `penwidth=3` must not thicken the other seventeen, so when absence wins the key is skipped at class level and that one object gets an `#id` rule. **Ties break on the lexicographically smallest value** — derived CSS must be byte-identical for identical input, or every diff is noise. A subgraph block is emitted when **all** its members share a value that differs from the diagram default. An `#id` rule is emitted only when that one object still differs after class rules apply.

Required nesting:

```css
:root {
  --primary-color: blue;
  --secondary-color: green;
  --accent-color: orange;

  --main-font: sans-serif;
  --title-font: sans-serif;
  --base-font-size: 14px;

  --horizontal-gap: 1em;
  --vertical-gap: 1em;

  --raised-shadow: 0 6px 12px lightgrey;
  --flat-shadow: 0 0 2px lightgrey;
}

.node { /* bagged */ }
.edge { /* bagged */ }

.cluster_consumer {
  &.node { }
  &.edge { }

  &.inner_subgraph {
    &.node { }
    &.edge { }
  }
}

/* only when one object still differs */
#lake { }
#bq_cortex { }

/* the SVG layer (§3.4), in SVG properties */
.shell { }
.caption { }
.edge { }
.arrow { }
```

**Why `&` inside a subgraph block.** A subgraph name is a class on the node
element itself (§3.3) — `<div id="lake" class="node cluster_consumer analytics">`.
There is no wrapper element for a subgraph, so `.cluster_consumer { .node { } }`
would compile to the descendant selector `.cluster_consumer .node` and match
nothing. `&.node` compiles to `.cluster_consumer.node`, which is the intent:
*member nodes of this subgraph*. Nested subgraphs are `&.inner_subgraph`, giving
`.cluster_consumer.inner_subgraph.node`.

**There is no per-cluster `.graph` block, and no diagram-level one either.** A
cluster gets no element: the SVG layer paints above `#shabnam-main-html`, so a cluster
background drawn there would cover its own members. A block that styles an
element nobody draws is inert, and inert output is worse than absent output.

Classes first. `#id` last, and rare. The valuable output is that **every node already carries the right classes**, so hand-written `style.css` is trivial.

**Position Margins in `derived.css`**: When nodes across ranks have vertical (or horizontal) offsets in Graphviz's layout, `CssBagger` computes quantized slot steps from `pos` coordinates and emits explicit `#id` rules in `derived.css` (e.g. `#node_id { margin-top: calc(N * (var(--vertical-gap) + 2.5em)); }`). This preserves node alignment across columns while keeping all styling inspectable and editable in CSS.

### 3.3 `LayoutFramer` + `NodeShaper` — the HTML layer

Columns come from `x` / `y` plus `rankdir` (group on x if LR/RL, else y). Inside a column, sort on the other axis.

**Zero inline styles**: The generated HTML markup contains **no inline `style="..."` attributes or JavaScript**. All structure is expressed purely through DOM elements (`<div id="lake" class="node ...">`) and styled exclusively via stylesheets.

Graphviz positions are floats, so grouping uses a **tolerance of 2 points** — rank separation is at least 36 points, so this is unambiguous, and exact float equality would scatter one rank across several columns. Never write a test that chases the last decimal of a `pos`.

```
layout = [
  [n1, n2, n4],
  [n3, n5],
]
```

Node markup comes from the shape registry — a lookup, not a switch scattered through the framer:

```
SHAPE_HTML.get(node.shape) ?? SHAPE_HTML.get("box")
```

First implementation: `box` only. Unknown shape falls back to `box`. Adding a shape is adding one map entry.

`LayoutFramer` frames those strings into `#shabnam-main-html`:

```html
<div class="diagram">
  <div class="column">
    <div id="lake" class="node cluster_consumer analytics">…</div>
  </div>
</div>
```

- **id** — the DOT name, sanitized (§3.1)
- **class `node`** — always
- **one class per subgraph** the node belongs to

The subgraph class is the styling surface that matters. `#id` is left over for one-off overrides.

### 3.4 `Measurer` + `NodeSheller` + `EdgeDrawer` — the SVG layer

Once the browser has painted `#shabnam-main-html`, `Measurer` reads the real geometry into `Box[]`. Then:

- **`NodeSheller`** draws visual cluster bounding boxes (`clusters(...)`) under `#shabnam-clusters` around measured member nodes of `subgraph cluster_...` with cluster labels, and draws shells around each node box (`shells(...)`). Shell files live in `svg/`; `SHELL_SVG` maps `shell=` to a file, defaulting to `svg/box.svg`. Icon comes from `icon/` when `icon=` is set. Caption is `caption=`, falling back to `label`.
- **`EdgeDrawer`** draws connectors from **measured** box coordinates — never Graphviz `_draw_` paths — so edges keep following our boxes after CSS changes a gap, a font, or a width.

Measured geometry is the single source of truth for size and position. The model deliberately does **not** carry Graphviz's `width` / `height`; two sources of size would guarantee that someone eventually uses the wrong one.

Invisible clusters (`style=invis`) are not drawn. They still contribute a class to member nodes.

### 3.5 What we refuse

- A tokenizer or a recursive statement parser
- `DotAst`, `Token`, `parseAst`, `parseStatements`
- Regex that reconstructs DOT grammar
- A config object or a config tab
- A second geometry source alongside the measured boxes

Custom keys we care about (`icon`, `shell`, `caption`) are fields on the viz object. If Graphviz ever drops a key, we add **one** name→value map for that key — not a grammar.

---

## 4. Workbench tabs and injection

Tabs, in this order: **diagram.dot · theme.css · style.css · annotation.html · action.js**

Every tab is the same CodeJar editor (syntax highlight, wrap ~40em, current-line completer).

| Tab | Sink | Who writes it |
|---|---|---|
| diagram.dot | source for `renderJSON` | User. Seeded with a starter diagram. |
| theme.css | `#shabnam-theme-css` | Locked `theme/theme.css` first, then the selected overlay from `theme/*.css`. The base file is viewable, never overwritten. |
| style.css | `#shabnam-style-css` | `Css.plus(derived, style)` on Redraw. User types in the same file. `:root` first. |
| annotation.html | `#shabnam-annotation-html` | User. Cartesian `data-anchor` / `data-offset`. |
| action.js | `#shabnam-action-js` | User. Runs last. |

`@apply` is expanded on inject (`Css.expand`) against the theme sink.

**Redraw is when the tabs and the DOM are made to agree.** `style.css` is one file: `Css.plus(derived, style)` flattens both through CSSOM, overlays by selector, and emits `:root` first. Comments and formatting are not a contract. Load DOT clears the style tab so dead `#id` rules do not stick.

`theme/theme.css` is locked. Save / overwrite throws. Other `theme/*.css` files are overlays; the sink is base then overlay.

Every editor is the same CodeJar: wrap ~40em, current-line four-slot completer (selector → marker → property → value).

**File verbs and shortcuts.** `Cmd` on macOS, `Ctrl` elsewhere; the four the browser claims are `preventDefault`ed. The bindings are a `Map` registry (§0).

| Keys | Verb |
|---|---|
| `Cmd+Enter` | Redraw |
| `Cmd+O` / `Cmd+S` | Load / Save DOT |
| `⇧Cmd+O` / `⇧Cmd+S` | Load / Save Theme overlay |
| `Cmd+P` | Save PNG |
| `Cmd+E` | Export HTML |
| `Cmd+1` … `Cmd+5` | the five tabs |

**Save PNG** rasterizes the canvas with browser APIs only: HTML + annotation in one `<foreignObject>` with stylesheets inlined, SVG after it, then `Image` → `<canvas>` → `toBlob`.

There is no config model. Behavior that wants to be configuration goes to `:root` or to `action.js`.

**Export** writes the current canvas — skeleton, all sinks, inlined viz.js — as one standalone HTML file.

---

## 5. Runtime lifecycle

Everything runs in the browser. `index.ts` mounts the SolidJS workbench into `#root`; the canvas skeleton of §1 is part of the component tree, not a generated string. Offline exploration, batch evaluation, and prototype scripts live in `research-lab/`, never in `src/`.

`Workbench.redraw` is the conductor:

```
dot text
  → Vizer.render(dot)                         → json
  → Diagram.bag(json)                         → model
  → Diagram.derived(model)                    → derived css
  → Css.plus(derived, style)                  → style.css tab + #shabnam-style-css
  → inject theme.css (base + overlay)
  → Diagram.frame(model)                      → #shabnam-main-html
  → [ browser paints ]
  → Workbench.measure()                       → boxes
  → Diagram.clusters / shells / connectors    → SVG sinks
  → Workbench.place()                         → annotation.html
  → action.js last
```

Must complete in well under a second on a normal diagram.

**The one sanctioned catch.** `Vizer.render` is wrapped in a single `try` / `catch`, and nowhere else. Malformed DOT is the normal between-keystroke state. The catch shows the Graphviz message and leaves the last good picture standing. Everything downstream of a successful parse still follows: **throw or let it throw.**

---

## 6. Build order

Fresh start. Do these in order, stop after each for review.

1. **Skeleton.** Bun + SolidJS + TypeScript scaffold. `index.ts` mounts the workbench into `#root`. Five tabs, the canvas with all five sinks, the Redraw button, the starter DOT. Nothing renders yet.
2. **`Vizer` + `DiagramBagger`.** DOT in, `DiagramModel` out, dumped to the console. Namespaced sanitized ids, subgraph classes, numeric `x` / `y`. This is the step that proves we never need a parser.
3. **`LayoutFramer` + `SHAPE_HTML.box`.** `#shabnam-main-html` filled: boxes in the right columns, correct id and classes. Unstyled is fine.
4. **`Diagram.derived`.** Derived CSS per §3.2 folded into `style.css` by `Css.plus`. Byte-identical for identical input.
5. **`Measurer` + `NodeSheller` + `EdgeDrawer`.** `svg/box.svg` as the only shell, `icon/` when `icon=` is set, connectors from measured coordinates.
6. **Polish.** Load / Save Theme, Export HTML, status line for parse errors.

Out of this pass: every `shape=`, a second layout engine, float-precision tests treated as the product.

---

## 7. Decision log

Closed. Do not reopen in code without updating this file.

| Decision | Choice |
|---|---|
| Who reads DOT | Graphviz `renderJSON`, via `Vizer`, only |
| Who reads `VizJson` | `Diagram.bag`, only. Everyone else uses `DiagramModel`. |
| Who lays out columns | Graphviz `pos` + `rankdir`, bucketed within 2pt |
| Who owns size and position | `Workbench.measure`. Graphviz `width` / `height` / `_draw_` are unused. |
| Who draws | Us: HTML (`SHAPE_HTML`) + SVG (`svg/` shells, `icon/`) |
| Who touches the DOM | The workbench package, only. `diagram/` workers are pure. |
| How derived CSS is built | `Diagram.derived` on the model. Flat selectors, shortest that identifies. Classes first, `#id` last. Almost empty if DOT has no style. |
| CSS naming | Identical to DOT naming (§3.1). No prefix, no `cluster_` stripping. |
| A class that is not a DOT name | Exists only if theme or style selects it |
| Colour in derived CSS | Only from a DOT attribute or a `:root` variable. Never invented. |
| Anonymous subgraphs | `.subgraph_<n>` by appearance order |
| Cluster `.graph` blocks | None. No cluster element is drawn, so the block would be inert. |
| Subgraph selectors | `&.node` / `&.edge` — the class is on the node element, not a wrapper |
| style.css | `Css.plus(derived, style)`. `:root` first. Load DOT clears the tab. |
| Who parses CSS | **CSSOM.** Missing `CSSStyleSheet` throws. `css/` holds no regex parser. |
| Theme catalog | All files live in `theme/`. `theme/theme.css` is locked. Overlays add/overwrite. |
| Cascade | locked base, then selected overlay, then style.css |
| Attr → CSS property | `ATTR_CSS` registry |
| Bag ties | Lexicographically smallest value, for determinism |
| Bag absence | Counts as a value. Absence winning means no class rule for that key. |
| App-owned ids | Prefixed `shabnam-`, so they cannot collide with a DOT name |
| Ids | The DOT name, sanitized. Collision throws. |
| How nodes are styled | id + class `node` + one class per subgraph |
| How HTML varies by shape | `SHAPE_HTML` map. First entry: `box` |
| How shells vary | Files in `svg/`, via `SHELL_SVG`. First file: `box.svg` |
| How icons vary | Files in `icon/` (borrowed) |
| Custom attrs | Fields on the viz object |
| Config tab | Never existed. Behavior → `:root` or action.js |
| Workbench tabs | diagram.dot, theme.css, style.css, annotation.html, action.js |
| Shortcuts | A `Map` registry in `workbench/keys.ts`, not a switch |
| PNG export | `foreignObject` → `<canvas>` → `toBlob`. No rasterizer dependency. |
| UI library | SolidJS. Skeleton is JSX, not a string. |
| viz.js in the page | Inlined. Redraw calls it every run. |
| `try` / `catch` | Exactly one, around `Vizer.render` |

---

## 8. Structure

Allowed root folders — git tracks only these plus the named root files, see `.gitignore`:

```
shabnam/
  src/            all TS, TSX, CSS, HTML
  svg/            shells. first file: box.svg
  icon/           borrowed logos
  theme/          user / shipped themes
  test/           if needed
  docs/           documentation, project management, reports
  research-lab/   discovery, experiments, prototypes
  build/          build scripts / generated inputs to the bundler
  dist/           build output. never a source of truth
```

Inside `src/`, one package per stage of the design. A package is a subject expert; a file is a worker.

```
src/
  index.ts          mount the workbench into #root
  types.ts          all `type` data + all `interface` traits (not counted in the 7)

  diagram/          Diagram facade + private workers. data in, string out. no DOM.
    diagram.ts        Diagram        — bag / frame / derived / clusters / shells / connectors
    vizer.ts          Vizer          — the only viz.js caller
    diagram-bagger.ts the only VizJson reader
    css-bagger.ts     model → derived CSS
    layout-framer.ts  model → columns → #shabnam-main-html
    node-shaper.ts    SHAPE_HTML registry
    node-sheller.ts   boxes + nodes → shell SVG
    edge-drawer.ts    boxes + edges → connector SVG

  css/              CSS in, CSS out. CSSOM only — never the page (§3).
    css.ts            Css.plus / Css.expand
    expander.ts       @apply / @mixin

  workbench/        the only package that touches the live DOM (≤ 7 files)
    workbench.tsx     SolidJS shell: canvas + tabs
    tabs.tsx          five CodeJar tabs
    editor.tsx        CodeJar + highlighter + completer popup
    complete.ts       four-slot current-line suggestions
    engine.ts         Workbench: redraw / inject / measure / place
    files.ts          Files: DOT, theme catalog, export
    keys.ts           KEY_COMMAND registry
```

`css/` is the one package outside `workbench/` that touches a browser API, and §3 says why that is allowed and how far it goes. Missing CSSOM throws.

`node-shaper.ts` is a **registry, not a class** — a `Map` plus a lookup with a `box` fallback. Wrapping a map lookup in a class to satisfy "one class per file" is exactly the second-abstraction-for-one-call smell that `coding-rules.md` forbids. Same applies to `SHELL_SVG` and `ATTR_CSS`, which live with the workers that consult them.

Root files that are law: `app-architecture.md`, `coding-rules.md`, `AGENTS.md`, `CLAUDE.md`.

Never in this tree: a DOT parser, `input/`, `output/`, `local/`, `temp/`, `etc/`.

---

## 9. Soft limits of 7

An organization idea. Can be broken if needed — occasionally, not routinely.

| Rule | Soft 7 |
|---|---|
| Lines in a block | `{}` or `()` or `<>` — about 7 inside |
| Blocks in a function / method | about 7 |
| Methods on an `interface` | 7. A class implements an interface. |
| Code files per package | 7. Does **not** count `types.ts` or build / config (`.json`, lockfiles). |
| Major class per file | preferably **one**, plus a few helpers |
| Enums / `Map` entries | **no limit** |
| Folders / packages per app | **no limit** |

Extension goes to a registry entry first, a new package second, a bigger file never.

---

## 10. Types and traits

These are the core types, interfaces, and enums and some of their crucial public methods/fields. The implementaion might have more and slighly different.
The types.ts should closely follow this sesions (but with more proper signiture and details) and the rest of the source code files are basically the implementation of types.ts and relevant issues.

`type` = data. `interface` = methods. `Map` = value → function. All of this lives in `src/types.ts`. Interfaces describe packages.

```ts
type VizJson = unknown
type TabId = "dot" | "theme" | "style" | "annotation" | "action"
type SlotKind = "selector" | "marker" | "property" | "value"
type Slot = { kind: SlotKind; items: string[]; input?: "text" | "color"; prefix: string }

interface Vizer { render(dot: string): Promise<VizJson> }

interface Diagram {
  bag(json: VizJson): DiagramModel
  frame(model: DiagramModel): string
  derived(model: DiagramModel): string
  clusters(boxes: Box[], model: DiagramModel): string
  shells(boxes: Box[], model: DiagramModel): string
  connectors(boxes: Box[], model: DiagramModel): string
}

interface Css {
  plus(derived: string, style: string): string
  expand(css: string, theme: string): string
}

interface Workbench {
  redraw(): Promise<void>
  inject(sink: string, text: string): void
  measure(): Box[]
  place(boxes: Box[]): void
  suggestions(tab: TabId, line: string): Slot
}

interface Files {
  loadDot(text: string): void
  saveDot(): string
  listThemes(): string[]
  loadTheme(name: string): string
  saveTheme(name: string, css: string): void  // throw if name is theme.css
  exportHtml(): Promise<string>
  exportPng(): Promise<Blob>
}
```

`Node` / `Edge` / `Cluster` / `DiagramModel` / `Box` / `Layout` are unchanged. Registries (`SHAPE_HTML`, `SHELL_SVG`, `ATTR_CSS`) live with the workers that consult them.
