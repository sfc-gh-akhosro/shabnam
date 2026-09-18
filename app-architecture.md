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

1. **Base CSS** — derived styling, keyed on classes and ids
2. **Layout HTML** — columns of node HTML
3. **SVG layer** — shells and connectors, drawn around the *measured* boxes

After the JSON, **we** own the picture.

Canvas skeleton — the named sinks each worker fills:

```html
<div id="shabnam-canvas">
  <div id="shabnam-main-html"><!-- layout + node HTML --></div>
  <svg id="shabnam-main-svg">
    <g id="shabnam-node-shells"></g>
    <g id="shabnam-connectors"></g>
  </svg>
  <div id="shabnam-annotation-html"></div>
  <style id="shabnam-base-css"></style>
  <style id="shabnam-my-style"></style>
  <script id="shabnam-my-js"></script>
</div>
```

**Every id the app owns is prefixed `shabnam-`.** Node ids are DOT names (§3.1),
so the page's own ids and the diagram's ids share one space — and a diagram with
a node called `connectors` had its edge markup written into that node's `<div>`.
The prefix is the wall between the two namespaces. It is plumbing: Base CSS never
references a sink id, and neither should a theme.

Nodes have **two layers**: an HTML layer (`shape →` markup, in flow, measurable) and an SVG layer that draws a **shell** around the measured box, with icon and caption inside the shell.

The product is a **JSFiddle-style workbench**: one page, one canvas, editor tabs that inject into the sinks. Everything runs in the browser. There is never a second grammar.

If a proposed change requires reading DOT as a string — tokenize, recursive descent, `parseAst`, `parseStatements`, regex over statements — it is out of scope. Stop and come back to this document.

---

## 2. What Graphviz is for — and what it is not

`@viz-js/viz` (`instance()` then `renderJSON(dot)`) is the **only** thing that reads DOT.

| Job | Where it lives in the JSON | We do |
|---|---|---|
| Layout | `pos`, `rankdir` | Traverse. Group nodes into columns. |
| Style / identity | `fillcolor`, `color`, `fontname`, `fontsize`, `penwidth`, `style`, `bgcolor`, `label`, `shape`, subgraph `name`, edge `tail` / `head` | Traverse. Emit Base CSS. Put classes and ids on elements. |
| Custom keys | `icon`, `shell`, `caption` when present on the object | Read the field. Do not re-parse the source. |

There is no third job called "parse DOT ourselves." Defaults are already resolved onto objects. Subgraph names are already on subgraph objects. Cluster membership is the subgraph object's `nodes` index list.

Graphviz is **not** our renderer, our HTML, our CSS, or our geometry. We use its `pos` to decide *which column* a node is in, and nothing else — never its `_draw_` paths, never its pixel sizes.

viz.js is inlined in the page. Redraw calls `renderJSON` again on every run. That is Graphviz doing its one job repeatedly, not a second parser.

---

## 3. The shape of the design — one traversal, one model

The whole app is a short pipeline of **workers**. Each worker has one job, one interface, and one class.

```
DOT text
  │
  ├─ Vizer ─────────────► VizJson          the only DOT consumer
  │
  ├─ DiagramBagger ─────► DiagramModel     the only VizJson consumer
  │
  ├─ CssBagger ─────────► baseCss          model → CSS text
  ├─ LayoutFramer ──────► mainHtml         model → columns + node HTML (via SHAPE_HTML)
  │
  │      ── inject, let the browser paint ──
  │
  ├─ Measurer ──────────► Box[]            live DOM → geometry
  ├─ NodeSheller ───────► shellsSvg        boxes + nodes → SVG (via SHELL_SVG)
  └─ EdgeDrawer ────────► edgesSvg         boxes + edges → SVG
```

Two rules make this hold together:

**One traversal, one model.** `Vizer` is the only worker that calls viz.js. `DiagramBagger` is the only worker that touches `VizJson`. Everything downstream works on `DiagramModel`, which is fully typed and ours. Graphviz's shape is quarantined in exactly one file.

**Pure workers, one DOM owner.** Every worker in `diagram/` is pure: data in, string out. No DOM, no globals, no I/O. Only the workbench touches the live page — it injects strings into sinks and it measures boxes. This is why the pipeline is testable and why Redraw is deterministic.

One named exception: `style/` uses **CSSOM** — `new CSSStyleSheet()` and `replaceSync` — because the browser is our CSS parser and normaliser (§4). It is a browser API, not the page: `style/` never reads the document tree, never touches a sink, and never reads layout. Its sheets are off-document, so nothing is applied and nothing reflows. The cost is honest and worth stating: this worker cannot be tested under `bun`, which has no CSSOM.

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

A corollary, and a test you can apply to any class in the output: **a class that is not a DOT name must be referenced by Base CSS to exist at all.** `node`, `edge`, `column`, `label`, `shell`, `caption`, `badge`, `arrow` earn their place because Base CSS styles them. A grouping class nothing selects is noise on the element and gets deleted.

### 3.2 `CssBagger` — derived styling

Consumes the model, emits Base CSS text. Important attrs only — not comprehensive.

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

**Base CSS never invents a colour.** Every colour in the output traces to a DOT attribute or to a `:root` variable. If the DOT declares four colours, four is what the reader should find — a hardcoded hex in a structural rule is the worker over-representing its input, and it is the one thing that makes derived CSS untrustworthy.

**Selectors are flat and as short as they can be.** `.diagram .column` and `.column` identify the same place, because there is only one place a column can be, so the shorter one wins. There is no `.diagram { … }` wrapper block, and the SVG layer's `.shell` / `.caption` / `.edge` / `.arrow` carry no sink id in front of them — they are already unique. A subgraph block still nests, because that is what `&` needs.

How a **bag** is chosen: Graphviz has already applied `node [...]` / `edge [...]` defaults onto every object, so we recover the defaults statistically. For each style key, the **most common** value across all nodes becomes `.diagram .node`; likewise for edges. **Absence counts as a value** in that tally — one edge in eighteen carrying `penwidth=3` must not thicken the other seventeen, so when absence wins the key is skipped at class level and that one object gets an `#id` rule. **Ties break on the lexicographically smallest value** — Base CSS must be byte-identical for identical input, or every diff is noise. A subgraph block is emitted when **all** its members share a value that differs from the diagram default. An `#id` rule is emitted only when that one object still differs after class rules apply.

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

Classes first. `#id` last, and rare. The valuable output of this worker is not pretty CSS — it is that **every node already carries the right classes**, so hand-written My Style is trivial.

### 3.3 `LayoutFramer` + `NodeShaper` — the HTML layer

Columns come from `x` / `y` plus `rankdir` (group on x if LR/RL, else y). Inside a column, sort on the other axis.

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

- **`NodeSheller`** draws a shell around each box. Shell files live in `svg/`; `SHELL_SVG` maps `shell=` to a file, defaulting to `svg/box.svg`. Icon comes from `icon/` when `icon=` is set. Caption is `caption=`, falling back to `label`.
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

Tabs, in this order: **DOT · Base CSS · My Style · HTML · JS**

| Tab | Sink | Who writes it |
|---|---|---|
| DOT | source for `renderJSON` | User. Seeded with a starter diagram on first load. |
| Base CSS | `#shabnam-base-css` | `CssBagger`, every Redraw — **and the user, in between.** Editable, applies on every keystroke, and a Redraw *rebases* rather than clobbers: see below. |
| My Style | `#shabnam-my-style` | User. Load / Save Theme act here only. Redraw only ever *adds* to it, by rebasing Base CSS edits into it. |
| HTML | `#shabnam-annotation-html` | User. Cartesian `data-anchor` / `data-offset`. |
| JS | `#shabnam-my-js` | User. Empty starter. |

No transformation on inject. The user types CSS / HTML / JS; it lands in the page.

**Redraw is when the tabs and the DOM are made to agree.** That is the principle the next two paragraphs serve. The app is not obliged to preserve how CSS was written — comments carry no function, formatting carries no function, and `RED` and `red` are the same colour. What it must not do is lose something that *does* something, or mistake notation for a change.

**Rebasing Base CSS edits.** Base CSS is derived, so a Redraw has to rewrite it — but a tab you can type into must not eat what you typed. So Redraw keeps the exact text `CssBagger` produced last time and reads the tab against it:

```
userEdits   = baseCssTab − lastDerived      // what the user actually changed
myStyle'    = canonical(myStyle + userEdits)
baseCssTab' = the freshly derived text
```

A rule the DOT legitimately dropped is in `lastDerived` too, so it cancels and never migrates. A rule the user typed is not, so it always survives — as My Style, where the user owns it and no Redraw takes it away. An untouched tab produces no edits and Redraw behaves as if the tab were still read-only. Load DOT clears the baseline: a fresh file starts afresh.

**The browser does the comparing.** Both sides are handed to CSSOM and read back, so every difference that is only notation has already collapsed before we look: whitespace, comments, `RED` against `red`, `#BBDEFB` against `rgb(187, 222, 251)`, and `border-width: 1px` against its four longhands. Those are the false triggers, and suppressing them is the requirement — a hand-written comparison would have to reimplement CSS value semantics to get there, which is why `style/` holds no parser of ours.

The unit of comparison is a rule, keyed by its nesting path, and the unit of *migration* is a declaration — change one property and one property moves. There is one fallback, and it exists for a reason found in the browser: `var()` on a **shorthand** is a pending-substitution value, so `border-color: var(--secondary-color)` enumerates four longhands that each read back as the empty string, and the value survives only in `cssText`. When any property fails to resolve, that rule is compared and carried whole. The same road serves every rule CSSOM does not give declarations for — `@media`, `@keyframes`, `@layer` — so nothing has to be modelled to survive. `research-lab/probe-cssom.ts` is the evidence.

My Style comes back in the browser's own notation, since that is the cheapest way to keep it in step with what the DOM actually holds. The Base CSS tab is **not** round-tripped: it is already the exact string the browser parsed, and canonicalising it would turn the DOT's `#BBDEFB` into `rgb(187, 222, 251)` — working against the one property that makes derived CSS readable, that its values trace to the DOT (§3.2).

Two consequences, neither hidden: a declaration CSSOM does not recognise — a typo, most likely — never appears in the comparison and so does not migrate, which is why the status line reports how many rules moved. And a rule that took the whole-rule fallback carries its structural declarations along, freezing them in My Style; it is visible in the tab and fixable by deleting a line.

**File verbs and shortcuts.** `Cmd` on macOS, `Ctrl` elsewhere; the four the browser claims are `preventDefault`ed. The bindings are a `Map` registry (§0), so adding one is adding an entry.

| Keys | Verb |
|---|---|
| `Cmd+Enter` | Redraw |
| `Cmd+O` / `Cmd+S` | Load / Save DOT |
| `⇧Cmd+O` / `⇧Cmd+S` | Load / Save Theme (My Style) |
| `Cmd+P` | Save PNG |
| `Cmd+E` | Export HTML |
| `Cmd+1` … `Cmd+5` | the five tabs |

**Save PNG** rasterizes the canvas with browser APIs only: the HTML and annotation layers go into one `<foreignObject>` with the three stylesheets inlined, the SVG layer follows it, and the result goes `Image` → `<canvas>` → `toBlob`. Icons and shells already travel as data URIs, so nothing is fetched and the canvas is never tainted.

There is no config model and no config tab. Behavior that wants to be configuration goes to `:root` variables or to My JS.

**Export** writes the current canvas — skeleton, all five sinks, inlined viz.js — as one standalone HTML file. This is the "HTML out" half of the product.

---

## 5. Runtime lifecycle

Everything runs in the browser. `index.ts` mounts the SolidJS workbench into `#root`; the canvas skeleton of §1 is part of the component tree, not a generated string. Offline exploration, batch evaluation, and prototype scripts live in `research-lab/`, never in `src/`.

`Redrawer` is the conductor. It owns the sequence and nothing else:

```
dot text
  → Vizer.render(dot)                       → json
  → DiagramBagger.bag(json)                 → model
  → CssBagger.bag(model)                    → derived css
  → StyleMerger.rebase(...)                 → Base CSS tab + My Style tab (§4)
  → LayoutFramer.frame(model)               → inject #shabnam-main-html   (SHAPE_HTML inside)
  → [ browser paints ]
  → Measurer.measure()                      → boxes
  → NodeSheller.shells(boxes, model)        ┐
  → EdgeDrawer.draw(boxes, model)           ┴ inject #main-svg
  → My Style / HTML / JS untouched
```

Must complete in well under a second on a normal diagram.

**The one sanctioned catch.** `Vizer.render` is wrapped in a single `try` / `catch`, and nowhere else in the app. A workbench sees malformed DOT between every keystroke — that is the normal state, not an exceptional one — and an uncaught throw would take down the page along with the user's unsaved My Style, HTML, and JS. The catch shows the Graphviz message in a status line and leaves the last good picture standing. Everything downstream of a successful parse still follows the rule: **throw or let it throw.**

---

## 6. Build order

Fresh start. Do these in order, stop after each for review.

1. **Skeleton.** Bun + SolidJS + TypeScript scaffold. `index.ts` mounts the workbench into `#root`. Five tabs, the canvas with all five sinks, the Redraw button, the starter DOT. Nothing renders yet.
2. **`Vizer` + `DiagramBagger`.** DOT in, `DiagramModel` out, dumped to the console. Namespaced sanitized ids, subgraph classes, numeric `x` / `y`. This is the step that proves we never need a parser.
3. **`LayoutFramer` + `SHAPE_HTML.box`.** `#shabnam-main-html` filled: boxes in the right columns, correct id and classes. Unstyled is fine.
4. **`CssBagger`.** Base CSS per §3.2 into `#shabnam-base-css`. Byte-identical output for identical input.
5. **`Measurer` + `NodeSheller` + `EdgeDrawer`.** `svg/box.svg` as the only shell, `icon/` when `icon=` is set, connectors from measured coordinates.
6. **Polish.** Load / Save Theme, Export HTML, status line for parse errors.

Out of this pass: every `shape=`, a second layout engine, float-precision tests treated as the product.

---

## 7. Decision log

Closed. Do not reopen in code without updating this file.

| Decision | Choice |
|---|---|
| Who reads DOT | Graphviz `renderJSON`, via `Vizer`, only |
| Who reads `VizJson` | `DiagramBagger`, only. Everyone else uses `DiagramModel`. |
| Who lays out columns | Graphviz `pos` + `rankdir`, bucketed within 2pt |
| Who owns size and position | The `Measurer`. Graphviz `width` / `height` / `_draw_` are unused. |
| Who draws | Us: HTML (`SHAPE_HTML`) + SVG (`svg/` shells, `icon/`) |
| Who touches the DOM | The workbench package, only. `diagram/` workers are pure. |
| How Base CSS is built | `CssBagger` on the model. Flat selectors, shortest that identifies. Classes first, `#id` last. |
| CSS naming | Identical to DOT naming (§3.1). No prefix, no `cluster_` stripping. |
| A class that is not a DOT name | Exists only if Base CSS selects it |
| Colour in Base CSS | Only from a DOT attribute or a `:root` variable. Never invented. |
| Anonymous subgraphs | `.subgraph_<n>` by appearance order |
| Cluster `.graph` blocks | None. No cluster element is drawn, so the block would be inert. |
| Subgraph selectors | `&.node` / `&.edge` — the class is on the node element, not a wrapper |
| Base CSS edits | Rebased into My Style on Redraw, against the last derived text (§4) |
| Who parses CSS | **CSSOM.** The browser is the parser and the normaliser; `style/` holds no parser of ours. |
| Comparison unit | A rule, keyed by nesting path. Migration unit: a declaration. |
| `var()` on a shorthand | Reads back empty, so that rule is compared and carried whole. Same road for `@media` / `@keyframes`. |
| My Style after a rebase | Rewritten in the browser's notation. Comments and formatting go; function does not. |
| Base CSS tab | Never round-tripped through CSSOM — it would lose the DOT's own value notation |
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
| Config tab | Never existed. Behavior → `:root` or My JS |
| Workbench tabs | DOT, Base CSS (editable, rebased), My Style, HTML, JS |
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
  redrawer.ts       the conductor — owns the pipeline sequence
  types.ts          all `type` data + all `interface` traits (not counted in the 7)

  diagram/          pure workers: data in, string out. no DOM.
    vizer.ts          Vizer          — the only viz.js caller
    diagram-bagger.ts DiagramBagger  — the only VizJson reader
    css-bagger.ts     CssBagger      — model → Base CSS
    layout-framer.ts  LayoutFramer   — model → columns → #shabnam-main-html
    node-shaper.ts    SHAPE_HTML     — registry: shape → node HTML
    node-sheller.ts   NodeSheller    — boxes + nodes → shell SVG
    edge-drawer.ts    EdgeDrawer     — boxes + edges → connector SVG

  style/            CSS in, CSS out. CSSOM only — never the page (§3).
    style-merger.ts   StyleMerger    — rebase Base CSS edits into My Style (§4)

  workbench/        the only package that touches the live DOM
    workbench.tsx     the SolidJS shell: canvas + tabs
    tabs.tsx          the five editors
    sinker.ts         Sinker    — inject text into a named sink
    measurer.ts       Measurer  — painted #shabnam-main-html → Box[]
    annotator.ts      Annotator — place `data-anchor` elements
    themer.ts         Themer    — the file verbs: DOT, Theme, PNG, HTML
    keys.ts           KEY_COMMAND    — registry: shortcut → verb
```

`style/` is its own package rather than an eighth file in `diagram/`, which is at
its seven. It is the one worker outside `workbench/` that touches a browser API,
and §3 says why that is allowed and how far it goes.

`diagram/` is at exactly seven workers, which is the intended pressure: the eighth capability should be a new package or a new registry entry, not an eighth file here.

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

`type` = data. `interface` = methods. `Map` = value → function. All of this lives in `src/types.ts`; every worker below implements exactly one interface.

```ts
// ---------------------------------------------------------------------------
// types — data only
// ---------------------------------------------------------------------------

type VizJson = unknown        // opaque. DiagramBagger is the only reader.

type Node = {
  id: string                  // the sanitized DOT name. also the HTML id
  classes: string[]           // subgraph names
  shape: string               // key into SHAPE_HTML
  shell: string               // key into SHELL_SVG, default "box"
  icon: string                // filename in icon/, or ""
  label: string
  caption: string             // caption=, falling back to label
  x: number                   // from pos, for column grouping only
  y: number
  attrs: Map<string, string>  // style keys CssBagger bags
}

type Edge = {
  id: string                  // `<from>_<to>`, suffixed when parallel
  from: string                // node id
  to: string
  classes: string[]
  attrs: Map<string, string>
}

type Cluster = {
  name: string                // the DOT subgraph name — the class, and the key
  label: string
  isInvis: boolean
  nodes: string[]             // member node ids
  clusters: string[]          // nested cluster ids
  attrs: Map<string, string>
}

type DiagramModel = {         // the one model. everything downstream reads this.
  rankdir: string
  nodes: Node[]
  edges: Edge[]
  clusters: Cluster[]
  attrs: Map<string, string>  // graph-level
}

type Layout = Node[][]        // columns of nodes

type Box = {                  // measured, the truth about geometry
  id: string
  left: number
  top: number
  width: number
  height: number
}

// ---------------------------------------------------------------------------
// interfaces — methods only (Go / Rust traits). One class implements each.
// ---------------------------------------------------------------------------

interface Vizer {
  render(dot: string): Promise<VizJson>
}

interface DiagramBagger {
  bag(json: VizJson): DiagramModel
}

interface CssBagger {
  bag(model: DiagramModel): string              // → #shabnam-base-css
}

interface LayoutFramer {
  columns(model: DiagramModel): Layout
  frame(model: DiagramModel): string            // → #shabnam-main-html, SHAPE_HTML inside
}

interface NodeSheller {
  shells(boxes: Box[], model: DiagramModel): string   // SHELL_SVG + icon/
}

interface EdgeDrawer {
  draw(boxes: Box[], model: DiagramModel): string     // measured coords only
}

interface Measurer {
  measure(): Box[]                              // reads painted #shabnam-main-html
}

interface Sinker {
  inject(sink: string, text: string): void
}

interface Themer {
  loadDot(text: string): void                   // → DOT, resets the rebase baseline
  saveDot(): string                             // ← DOT
  load(text: string): void                      // → My Style
  save(): string                                // ← My Style
  exportHtml(): Promise<string>                 // whole app, standalone
  exportPng(): Promise<Blob>                    // the canvas, rasterized
}

type StyleRebase = {      // what a rebase did
  myStyle: string         // the new My Style text, in the browser's notation
  moved: number           // how many rules migrated — for the status line
}

interface StyleMerger {
  // The Base CSS tab is editable and derived at once (§4). Whatever the user
  // changed against `derived` is merged into My Style; the tab goes back to
  // derived. CSSOM does the parsing and the normalising, so notation-only
  // differences never read as edits.
  rebase(derived: string, edited: string, myStyle: string): StyleRebase
}

interface Redrawer {
  redraw(dot: string): Promise<void>            // the sequence in §5
}

// ---------------------------------------------------------------------------
// registries — enum simulation. No class, no interface.
// ---------------------------------------------------------------------------

const SHAPE_HTML: Map<string, (node: Node) => string>
//   "box" → rectangle node HTML.  unknown shape → "box"

const SHELL_SVG: Map<string, string>
//   "box" → "svg/box.svg".        unknown shell → "box"

const ATTR_CSS: Map<string, string>
//   graphviz attribute → CSS property (§3.2). unmapped → skipped
```
