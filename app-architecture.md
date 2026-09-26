# Shabnam — App Architecture

**CSS on DOT diagrams.** A DOT-in, HTML-out workbench. Graphviz is the only DOT consumer. We do not write a parser, a tokenizer, or an AST.

This file is the blueprint. It describes the app we are building from scratch. When this document and the code disagree, the document wins until we change the document together.

---

## 0. Stack

Bun (ESM packaging only) + viz.js + TypeScript + SolidJS + HTML + CSS.

**Target: Chromium.** Users are corporate and technical, and Chromium is what they
run. The rule this buys us is not "other engines are unsupported" — it is that
**no code in `src/` exists to accommodate them.** No fallbacks, no polyfills, no
feature detection, and no declining a platform feature because a non-Chromium
engine is slow to it. `<foreignObject>` export (§4.1) is exactly such a feature:
WebKit has rendered it badly for years, and that is not a debt on this list. A
browser-compatibility branch in `src/` is the thing this policy forbids.

A library means we accept its whole dependency tree. Adding, removing, or rescoping anything on this list is a conversation that lands here first.

**The stack is a lock, not carved stone.** "Discussed first" means *bring it up*, not *do without*. If a feature is genuinely better served by a library — a real parser instead of a hand-rolled scanner, a real AST instead of string surgery — say so, make the case, and we amend this section. Hand-rolling something a mature library does properly, in order to avoid a conversation, is the worse outcome: it is more code, less correct, and ours to maintain forever. The tab window is a plain `<textarea>` — CodeJar was on this list and was removed, because highlighting cost a library, a highlighter file, nine `hl-*` classes and a `contenteditable` div, and it bought nothing the diagram needs. What stays forbidden is a library that changes the *design* — a second DOT reader, a second layout engine, a second UI framework — and that ban is about the design, not about the dependency count.

Type-driven TypeScript, following Go / Rust:

- `interface` — methods only. No fields. Same role as a Go interface or a Rust trait.
- `type` — data only. No methods.
- `Map` (or a `Record` used as a map) — enum simulation: attribute value → function. First map: **shape → nodeHTML**.

Soft limits of **7** are in §9. Organization idea, not a wall. Break occasionally if the design forces it — not as the routine.

---

## 1. What the product is

Shabnam is **DOT semantics** + **viz.js parse and layout** + **CSS / HTML / JS** for look and interaction + **ready themes and effects** + **a fiddle** + **portable** (HTML now; SVG later). The end-user object is a **dotFiddler** (name still open): one page, four tabs, one canvas, export that runs without us.

The user authors a diagram in DOT — the same language already used for architecture diagrams. Shabnam does **not** try to be Graphviz. It hands the DOT to Graphviz to get **one JSON**. Then we **traverse that JSON once** into our own model, and from the model we build:

1. **Derived rules** — a `StyleBag`, almost empty if DOT has no style; absorbed into the one book at source `1`
2. **Layout HTML** — columns of node HTML
3. **SVG layer** — shells and connectors, drawn around the *measured* boxes

After the JSON, **we** own the picture.

Canvas skeleton — the named sinks each worker fills:

```html
<article id="diagram-canvas">
  <div id="diagram-html"><!-- layout + node HTML (zero inline styles) --></div>
  <svg id="diagram-svg">
    <g id="cluster-shells"></g>
    <g id="node-shells"></g>
    <g id="connector-paths"></g>
  </svg>
  <div id="annotation-html"></div>
  <style id="style-css"><!-- the Stylist's sheet. Never textContent. --></style>
  <script id="action-js"></script>
</article>
```

**Every id the app owns is two hyphenated words.** Node ids are DOT names (§3.1),
so the page's own ids and the diagram's ids share one space — and a diagram with
a node called `connectors` had its edge markup written into that node's `<div>`,
while one called `app` inherited `height: 100vh` from a chrome rule and stretched
its rank to the viewport. A DOT identifier is a bare word, so a hyphenated pair
is the wall between the two namespaces: `#diagram-canvas`, never `#canvas`. The
chrome's own boxes take the rule further and carry no id at all — `body > main`
and `body > aside` reach them, and the workbench renders straight into `body`
with no `#root`. It is plumbing: derived rules never reference a sink id, and
neither should a theme.

**There is one sheet and it is not text.** `#style-css` is owned by the
`Stylist`, which mutates `.sheet` through CSSOM — `insertRule`, `setProperty`,
`removeProperty`. Nothing writes its `textContent`. `sheet.ts`'s `serialize()` reads
it back for the picture exports only (§4.1), which have to carry the CSS inside the
file, and it is the single place CSS text is produced at all.

**Style parity.** The picture is exactly **one book of rules**, and every entry
carries who wrote it:

```
StyleRules: selector → property → (value, id, source)
source:     0 theme · 1 dot · 2 user
```

There are no layers and no merge step. `Stylist.addRule` is the one door in, and it
**refuses a write whose source is lower than the entry already there** — equal or
higher wins. That single guard is what the three layers used to be for: a redraw
feeds the DOT's rules at source `1` and cannot take a row back off the user at `2`.

1. **Load DOT** starts blank, absorbs `theme/basic-theme.json` at `0`, draws, then
   absorbs `Diagram.derived(model)` at `1`.
2. **Redraw** keeps the book and re-absorbs the derived bag at `1`.
3. **A row edit** writes at `2`.

**An accepted overwrite is destructive, immediately, by design.** The entry is
replaced and CSSOM is told. The value underneath is not kept anywhere, so deleting a
source-`2` row does not revert to the theme's value — the rule leaves the book and
stops being painted. (What *does* come back is anything `@apply` still supplies; see
below.) This is the reason the design is this small, and the reason there is no
merge buffer, no `plus` / `minus`, and no second map.

The trap worth stating, because it catches people who wrote the rule: a row you type on a key the theme already owns — `:root, svg` → `--primary-color`, say — does not sit *on top of* the theme's entry, it **becomes** it, at source `2`. Delete that row and the theme's value goes with it. Load DOT is the way back. Softening this would mean a second entry per key, which is the three layers returning, so it is a conversation about this section rather than a patch.

Because Redraw does not flush, a rule derived from a DOT you have since edited stays
in the book at source `1`. **Load DOT is the reset path**; meanwhile the stale rule is
a visible row with a delete button. There is no purge-by-source machinery.

A rule is `selector → property → value`, which is what the tab shows and what the
JSON holds — plus `source` on disk, and `id` only in memory.

`@apply` is a **property** whose value is a space-separated list of selectors that
are keys in the same map. It survives in the data and on disk, and is resolved only
when feeding CSSOM: the named keys' declarations are set at the position `@apply`
appears, so the selector's own later properties win. **Expansion is a read, never a
write** — an expanded declaration reaches the sheet and never becomes a book entry,
so there is no question of what source it would carry and the tab keeps showing
exactly what was actually said. An undefined name throws. A cycle throws.

Nodes have **two layers**, and **the HTML layer owns the visible node**: background, border and label are real CSS on a real div (`shape →` markup, in flow, measurable). The SVG layer draws a **shell** around the measured box — chrome *around* that rectangle, stroke-only, never filled — plus the icon and caption badges. The order in the skeleton makes this non-negotiable: `#diagram-svg` comes after `#diagram-html`, so a filled shell would hide the label it is decorating, and two text layers would print every node twice.

The same order has a consequence we accept: `#connector-paths` is the **last** child of `#diagram-svg`, so an edge can cross a caption. `paint-order: stroke` with a halo only masks siblings drawn earlier, which is why `NodeSheller` emits all shell groups and *then* all captions — that fixes shell-over-caption, and edge-over-caption is not fixable inside a two-group skeleton. Closing it would mean a third `<g>` here, i.e. changing this section. Living with it is the current position.

The product is a **dotFiddler**: one page, one canvas, four tabs, export that runs without us. There is never a second grammar.

If a proposed change requires reading DOT as a string — tokenize, recursive descent, `parseAst`, `parseStatements`, regex over statements — it is out of scope. Stop and come back to this document.

---

## 2. What Graphviz is for — and what it is not

`@viz-js/viz` (`instance()` then `renderJSON(dot)`) is the **only** thing that reads DOT.

| Job | Where it lives in the JSON | We do |
|---|---|---|
| Layout | `pos`, `rankdir` | Traverse. Group nodes into columns. |
| Style / identity | `fillcolor`, `color`, `fontname`, `fontsize`, `penwidth`, `style`, `bgcolor`, `label`, `shape`, subgraph `name`, edge `tail` / `head` | Traverse. Emit derived rules. Put classes and ids on elements. |
| Custom keys | `icon`, `shell`, `caption` when present on the object | Read the field. Do not re-parse the source. |

There is no third job called "parse DOT ourselves." Defaults are already resolved onto objects. Subgraph names are already on subgraph objects. Cluster membership is the subgraph object's `nodes` index list.

**A node object carries no rank.** Probed, so nobody looks for it again: the only `rank` keys in the JSON sit on *subgraph* objects, where the author's `rank=same` / `min` / `max` survives verbatim, alongside `nodes` and — for nesting — a `subgraphs` index list; anonymous subgraphs are named `%1`, `%2`. A node has `pos` and nothing else, which is why §3.3 recovers ranks by bucketing coordinates rather than reading a field. The *effect* of a local rank constraint is already baked into `pos`, so `rank=same` lands its members in one rank for free. The *declaration* surviving on the subgraph object is one of the few provenance islands in this output, and the one a future subgraph feature would build on (M4 in `current-task.md`).

Graphviz is **not** our renderer, our HTML, our CSS, or our geometry. We use its `pos` to decide *which column* a node is in, and nothing else — never its `_draw_` paths, never its pixel sizes.

viz.js is inlined in the page. Redraw calls `renderJSON` again on every run. That is Graphviz doing its one job repeatedly, not a second parser.

**This is today's answer, not the final one.** viz.js gives us layout for free and costs us provenance: Graphviz resolves `node [...]` defaults onto members at parse time, so no JSON format it offers can say *where* an attribute was written. The intended direction is to replace it with a real DOT **AST** plus our own **maths-based layout**, which would make the model say what was assigned rather than what was computed. Until that investigation happens, the rule above stands unchanged — the replacement is a deliberate future project, not a licence to hand-roll a parser now. See debt **M4**.

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
  ├─ Diagram.derived ─────► StyleBag         almost empty if DOT has no style
  │
  ├─ Stylist.addRule ×n ──► the book, at source 1 (refused where the user wrote)
  ├─ Stylist.feed ────────► #style-css .sheet   (CSSOM, @apply expanded here)
  │
  │      ── inject, let the browser paint ──
  │
  ├─ Workbench.measure ────► Box[]
  ├─ Diagram.clusters / shells / connectors ► SVG sinks
  └─ Workbench.place ──────► annotation.html
```

There is no CSS text anywhere on this path. A rule is data from the moment it is
bagged to the moment CSSOM receives it.

Two rules make this hold together:

**One traversal, one model.** `Vizer` is the only caller of viz.js. `Diagram.bag` is the only reader of `VizJson`. Everything downstream works on `DiagramModel`. Graphviz's shape is quarantined in one file.

**Pure diagram workers, one DOM owner.** Files in `diagram/` are pure: data in, data out. They sit behind the `Diagram` facade. Only the workbench and the `Stylist` touch the live page.

One named exception: `stylist/` owns `#style-css` and drives it through
**CSSOM** — `insertRule`, `deleteRule`, `setProperty`, `removeProperty` — because
the browser is the only CSS engine we want. This is a live, on-document sheet: that
is the point, since a property change must repaint without a redraw. If CSSOM is
missing, the `Stylist` throws. Do not fall back to writing `textContent`.

**There is no CSS parser, and no CSS algebra.** `Css.plus` / `Css.minus` are gone.
There is nothing to merge — one book, and a repeated key is an overwrite decided by
`source`. The only code that ever *read* CSS text was the one-shot decomposition in
`build/`, which produced `theme/basic-theme.json` and is not in the runtime.

Hard rule: if a step is not "call viz", "traverse the JSON", or "emit HTML / rules / SVG", it does not belong in this app.

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

A corollary, and a test you can apply to any class in the output: **a class that is not a DOT name must be referenced by theme or style to exist at all.** The allowed non-DOT classes are `diagram`, `rank`, `node`, `record`, `shell`, `edge`, `arrow`, `cluster_`, `cell`, `label`, `icon`, plus a path class on a cell (`._1`, `._2_1`). Mixins (`.paper`, `.glass`, `.row`, `.col`, …) exist only for `@apply` — they are never put on an element. A grouping class nothing selects is noise and gets deleted.

**One invented class, two at most.** An element carries one type class (`node` / `record` / `cell` / `rank` / `cluster_` / …). A second class is only a DOT name (subgraph membership, cell path). `.record` *is* the node (theme: `.record { @apply .paper; }`); it does not also say `.node`. `.cluster_` is the type class on the cluster SVG group; the DOT name stays the `id` (`#cluster_platform`). Every subgraph the object belongs to still lands as a class — those are DOT names, not invented.

### 3.2 `CssBagger` — derived styling

Consumes the model, emits a **`StyleBag`**. Important attrs only — not comprehensive. Almost empty if DOT has no presentation. It returns data, not text: there is no CSS string to build, indent, or re-parse. It mints no ids and sets no source; the `Stylist` stamps both as it absorbs the bag at source `1`.

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

**Derived rules never invent a colour.** Every colour traces to a DOT attribute or a `:root` variable. If the DOT declares four colours, four is what the reader should find.

**Selectors are flat, and as short as they can be.** `.diagram .rank` and `.rank` identify the same place, because there is only one place a rank can be, so the shorter one wins. There is no `.diagram { … }` wrapper, and the SVG layer's `.shell` / `.edge` / `.arrow` / `.cluster_` carry no sink id in front of them — they are already unique. **A subgraph does not nest either**: the map is keyed by one flat selector, so a subgraph's member rule is composed as `.cluster_consumer.node, .cluster_consumer.record`, and a nested subgraph as `.cluster_consumer.inner_subgraph.node`.

**`:root` tokens must also be on `svg`.** A stylesheet attached to the page is not guaranteed to resolve custom properties inside an SVG subtree from `:root` alone. Both the theme and the derived preamble key them on `:root, svg` so `.cluster_ { fill: var(--glass-background) }` and `@apply .glass` both work on the SVG layer.

How a **bag** is chosen: Graphviz has already applied `node [...]` / `edge [...]` defaults onto every object, so we recover the defaults statistically. For each style key, the **most common** value across all nodes becomes `.node, .record`; likewise for edges. **Absence counts as a value** in that tally — one edge in eighteen carrying `penwidth=3` must not thicken the other seventeen, so when absence wins the key is skipped at class level and that one object gets an `#id` rule. **Ties break on the lexicographically smallest value** — identical input must produce an identical map, or every diff is noise. A subgraph entry is emitted when **all** its members share a value that differs from the diagram default. An `#id` entry is emitted only when that one object still differs after class entries apply.

The shape, as selector keys:

```
:root, svg                                     tokens (--primary-color, --main-font, …)

.node, .record                                 bagged
.edge                                           bagged

.cluster_consumer.node, .cluster_consumer.record
.cluster_consumer.inner_subgraph.node, …        composed, never nested

#lake                                           only when one object still differs
#bq_cortex

.cluster_  .shell  .edge  .arrow                the SVG layer (§3.4), in SVG properties
```

**Why the selector is composed, not nested.** A subgraph name is a class on the node
element itself (§3.3) — `<div id="lake" class="node cluster_consumer">`. There is no
wrapper element for a subgraph, so the descendant selector `.cluster_consumer .node`
would match nothing; the intent is `.cluster_consumer.node`, *member nodes of this
subgraph*. Nested CSS with `&` used to express that. Now that a rule is a flat map
key, we write the composed selector directly and the `&` disappears with the text.
Both `.node` and `.record` are named so a record member is reached without also
wearing `.node`.

**There is no per-cluster `.graph` block, and no diagram-level one either.** A
cluster gets no element: the SVG layer paints above `#diagram-html`, so a cluster
background drawn there would cover its own members. A block that styles an
element nobody draws is inert, and inert output is worse than absent output.

Classes first. `#id` last, and rare. The valuable output is that **every node already carries the right classes**, so the handful of rows a user adds on top is trivial.

**Annotations, labels, icons and edges carry their classes and nothing else — on purpose.** The theme styles the node and the layer scaffolding, and says deliberately nothing about `.icon`, `.cluster_ .label`, or edge decoration. Two consequences are visible today: a markdown `.icon` has no size rule, so an image with a `viewBox` and no intrinsic width resolves against its container and fills the node; and a cluster label inherits the cluster group's `fill`, so it is legible only against white. Both are real, both are left alone, because a default chosen without a use case is a default someone has to fight later. **Do not "fix" these in passing.** They wait for a request that says what the right value is.

The class is the extension point, which is what makes waiting cheap: when the request arrives it is one theme entry, not a code change.

**No derived margins**: nothing about spacing is computed from `pos`. A node takes what the theme gives it, plus whatever the author wrote in the DOT and whatever a Stylist row says. From a node's position we take exactly two things — **which rank it is in, and its order within that rank** (§3.3) — and everything else about the picture is decoration: node, cluster and edge attributes bagged into CSS, and the theme's own layout.

Earlier iterations derived a per-node "weight" margin from the within-rank coordinate. It is gone: every formula tried read as a plausible proxy for isolation and none of them survived contact with real diagrams, and it was the only value in the pipeline that was computed rather than passed through. The pass-through law (§ attr values are passed through, never corrected) now holds with **no exception**.

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

**Every `shape=` is out of this pass, and `record` is the visible one.** A `record` node renders as a box whose label keeps its Graphviz source verbatim — `{Data \n Lake | {Batch | Columnar | Vectors}}` — because nothing splits on `|` and `{}` yet. That is why a record-heavy diagram looks busy, and it is a missing map entry rather than a bug. Note for whoever adds it: reading the already-resolved `label` field is not a DOT parser (§3.5); reading the DOT text would be.

The shell registry makes the same promise one level down — a new shell is a file in `svg/`, one `SHELL_SVG` entry, and its import — and that promise is **untested**: `svg/box.svg` is still the only shell, so the token vocabulary (`{{x}} {{y}} {{width}} {{height}}`) has never had to serve a second shape. Worth writing a second one before trusting the claim.

`LayoutFramer` frames those strings into `#diagram-html`:

```html
<div class="diagram">
  <div class="rank">
    <div id="lake" class="node cluster_consumer">…</div>
  </div>
</div>
```

- **id** — the DOT name, sanitized (§3.1)
- **one type class** — `node` for a box, `record` for a record (not both)
- **one class per subgraph** the node belongs to — two classes total is the special case

The subgraph class is the styling surface that matters. `#id` is left over for one-off overrides.

### 3.4 `Measurer` + `NodeSheller` + `EdgeDrawer` — the SVG layer

Once the browser has painted `#diagram-html`, `Measurer` reads the real geometry into `Box[]`. Then:

- **`NodeSheller`** draws visual cluster bounding boxes (`clusters(...)`) under `#cluster-shells` around measured member nodes of `subgraph cluster_...` with cluster labels, and draws shells around each node box (`shells(...)`). Shell files live in `svg/`; `SHELL_SVG` maps `shell=` to a file, defaulting to `svg/box.svg`. Icon comes from `icon/` when `icon=` is set. Caption is `caption=`, falling back to `label`.
- **`EdgeDrawer`** draws connectors from **measured** box coordinates — never Graphviz `_draw_` paths — so edges keep following our boxes after CSS changes a gap, a font, or a width. It attaches and renders; it does not decide the route.
- **`EdgeRouter`** decides the route: one shape, an **ortho snake**, and no modes.

**The snake, and why the corridors are free.** A route attaches **perpendicular to a box side** and then crawls through the gaps between nodes. It does not need to discover corridors from obstacle geometry, because the layout is already a grid of ranks and rows and therefore the empty space is already a set of lines: **vertical corridors are the gutters between ranks, horizontal corridors are the gaps between rows inside a rank.** A snake alternates between the two — out of a side, along a gutter, across a row gap, along the next gutter, into the destination side. A walk over those intersections preferring **fewest turns, then shortest** is a few dozen nodes on a real diagram, which is why this is a heuristic and not a search over an obstacle-edge visibility graph.

Attachment follows the rank relationship, and both cases are perpendicular to a side:

| pair | attaches on | first / last segment |
|---|---|---|
| different ranks | left / right | horizontal |
| same rank | top / bottom | vertical |

Same-rank is decided from the **measured x-overlap** of the two boxes, not from `pos`, because measured geometry is the single source of truth here. A side attachment for a same-rank pair would have to leave the right edge and loop back to the left to get in, which is worse than the vertical it would replace.

**Clearance is a preference with a floor, never a refusal.** Obstacles are every box except the edge's own two endpoints, inflated by `clearance`. A corridor narrower than the clearance stays *usable* but is ordered last, behind any roomier option. Arbitrary user CSS can always close a corridor, and an edge that declines to render is worse than a tight one.

**Bends are curvable, and that is the only knob.** The corner radius is a parameter: `0` is sharp ortho, a large value is a rounded snake. It is clamped to half the shorter adjacent segment, so a tight corridor cannot produce a corner that crosses itself.

`splines` is **not** consulted — not the graph attribute, not the per-edge override — and `line` / `straight` / `curved` / `spline` are not modes. There is one router. Radius `0` is the old sharp ortho and a large radius is close to the old curve, so nothing is lost but an author-visible attribute did go quiet.

Both numbers are **measured**, so they arrive as an argument the way the boxes do. `diagram/` is pure (§3): a worker that reached for `getComputedStyle` to find out how to draw would be reading the page it is supposed to be describing.

```ts
type ConnectorMetrics = { clearance: number; radius: number }
```

A caption is drawn **only when the DOT asked for one.** `caption` falls back to `label` in the model (§3.1), and that is the right place for the fallback — but the HTML layer owns the text, so rendering the fallback here would print every node's label twice. The model-level promise and the on-screen result differ on purpose, and this is the one place that is true.

Measured geometry is the single source of truth for size and position. The model deliberately does **not** carry Graphviz's `width` / `height`; two sources of size would guarantee that someone eventually uses the wrong one.

**Measured means measured once, not live.** Anything that reflows `#diagram-html` without a redraw — browser zoom, a window resize, a pane that changes width — moves the boxes while `#cluster-shells`, `#node-shells` and `#connector-paths` keep the coordinates they were measured at, so shells and connectors visibly displace until the next Redraw. This follows from the two-pass design rather than contradicting it. A `ResizeObserver` on `#diagram-canvas` would close it and would be the first reactive machinery in the app; weigh that against §5's single conductor before adding one.

Invisible clusters (`style=invis`) are not drawn. They still contribute a class to member nodes.

### 3.5 What we refuse

- A tokenizer or a recursive statement parser
- `DotAst`, `Token`, `parseAst`, `parseStatements`
- Regex that reconstructs DOT grammar
- A config object or a config tab
- A second geometry source alongside the measured boxes
- **A CSS parser, a CSS serializer on the paint path, or CSS algebra.** A rule is a map entry; CSSOM is the only thing that turns it into paint.
- **A CSS selector validator.** `Stylist.addRule` ends in `sheet.insertRule`, which throws on a selector CSSOM cannot parse. The rows tab keeps mid-typing state away from it — selector and property commit on `change`, not on keystroke — but a *finished* typo (`.`, `#`) reaches `insertRule` and takes the app down with a stack. That is the preferred failure (fail loud). If it ever becomes intolerable the honest fix is a browser-supplied probe, never a grammar of our own.

Custom keys we care about (`icon`, `shell`, `caption`) are fields on the viz object. If Graphviz ever drops a key, we add **one** name→value map for that key — not a grammar.

**Graphviz's node lists are declaration-scoped, and that is a boundary, not a gap.** A node belongs to whichever subgraph *declared* it, so a cluster written after the edges can come back with `nodes: []` — in `research-lab/example-1.dot`, `cluster_consumer` does, because its three members were already claimed by an earlier anonymous subgraph. That class then reaches no node and no rule is emitted for it. Fixing it would mean reading the DOT source to find out where the author wrote the cluster, which is the parser this section refuses. Author DOT accordingly: declare a node inside the cluster you want it classed by.

---

## 4. Workbench tabs and injection

Tabs, in this order: **diagram.dot · styles · annotation.html · action.js**

Four tabs, and one of them is not text. `SetTab` writes a **text tab** (load, seed, user edit, or a deliberate machine write). `inject` writes a **sink**. Those are different directions. The styles tab is neither: it is a view onto the `Stylist`'s rules, and it edits them through the `Stylist` API.

The coding window is **one `<textarea>`**, and it serves the three text tabs. `tabs.tsx` is a radio strip — four equal buttons, no editor, no store. Workbench owns `active`; when `active` is `styles` it paints the rows table instead of the textarea. No highlighting, no completion, no caret of ours, no component of ours: the textarea is written inline in `workbench.tsx`, because a component that wraps one element and forwards two props is a file for nothing.

**The chrome's own CSS is `src/app.css`, and it is deliberately small.** Tokens on `body`, then a skeleton reached by *element and position* — `body > main`, `body > aside`, `nav`, `textarea`, `aside > section` — rather than by a hook per box. The four core classes (`.paper` · `.glass` · `.row` · `.col`) are not here: they belong to the theme and arrive through the sink. The markup therefore carries almost no `class` or `id`: a hook is allowed when the layout needs it, when it is a sink the engine writes, or when a test drives it. Nothing is named for decoration, and the semantic element is preferred to a class — `main`, `aside`, `article`, `section`, `nav`, and `hidden` rather than a `.hidden`. The styles tab came from a ten-line prototype, less its toolbar (`.rows`, `.row`, `.sel`, `.prop`, `.val`, `#selector-list`, `#property-list`) because that prototype is ten lines of CSS, and being restylable in ten lines is the point. The diagram's styling never appears here — it lives in the sinks (§3).

**One toolbar, and it is `main`'s `nav`.** Every action the app has lives there — Redraw, Load / Save DOT, Save SVG, Save PNG, Export HTML, Save Styles. No panel carries buttons of its own, and there is no status line: a redraw that cannot parse its DOT throws rather than writing a message into a corner of the page.

`redraw` is sync with the DOT tab — the full draw. The styles tab does not need Graphviz: a row edit is a `setProperty` on a live sheet, so the picture repaints with no redraw and no reflow of anything else. The UI may still use one Redraw button that always runs the DOT path.

**A styles row is three columns in a narrow pane, and it clips.** The long property names (`--horizontal-gap`, `--raised-shadow`) run past the pane's width mid-word. Every box carries a `title`, so a clipped row is readable on hover; a wrapping grid or a resizable pane both cost more than the annoyance today.

| Tab | Sink | Who writes it |
|---|---|---|
| diagram.dot | source for `renderJSON` | User. Seeded with a starter diagram. |
| styles | `#style-css` via CSSOM | The `Stylist`. One book, fed by the theme at source `0`, the redraw's derived bag at `1`, and the user's rows at `2`. The tab shows the book, one row per entry, tagged with its source. |
| annotation.html | `#annotation-html` | User. Cartesian `data-anchor` / `data-offset`. |
| action.js | `#action-js` | User. Runs last. |

**Editing any row writes at source `2`.** There is one book, so the row *is* the
entry: the value is replaced in place and the row's id survives. Nothing clones, and
no row is read-only — a row has no layer beneath it to shadow. A subsequent redraw
feeds at `1` and is refused on that entry, which is how a typed row survives.

**There is no merge buffer and no merge step.** That was the cost of round-tripping
CSS text through a tab, and then of keeping three maps. `Css.plus`, `Css.minus` and
`lastDerived` no longer exist. Dead `#id` rules cannot stick because nothing
accumulates layers — though a rule derived from a DOT you have since edited does stay
until you delete the row or Load DOT (§1).

**`@apply` is expanded at feed time**, against the book — not in the file and not in
the tab. It stays visible as a property wherever the user or the theme wrote it, and
an expanded declaration never becomes a book entry.

There is exactly one shipped theme, `theme/basic-theme.json`, decomposed once from a `basic.css` that no longer ships — the JSON is the artefact, and the runtime has no CSS file in it. There is no locked base, no overlay, no dropdown, and no theme file verbs.

Autocomplete is not part of the fiddle. Do not put `suggestions` on `Workbench`.

**File verbs and shortcuts.** `Cmd` on macOS, `Ctrl` elsewhere; the four the browser claims are `preventDefault`ed. The bindings are a `Map` registry (§0).

| Keys | Verb |
|---|---|
| `Cmd+Enter` | Redraw |
| `Cmd+O` / `Cmd+S` | Load / Save DOT |
| `Cmd+P` | Save PNG |
| `Cmd+E` | Export HTML |
| `Cmd+Shift+E` | Save SVG |
| `Cmd+1` … `Cmd+4` | the four tabs |

**Save SVG and Save PNG are one path.** Both ask for the same `<foreignObject>`
snapshot (§4.1); PNG then rasterizes that string through `Image` → `<canvas>` →
`toBlob`. Nothing is translated on either.

### 4.1 The snapshot — HTML out as itself

A picture export is a **wrapper**, not a translation. `<foreignObject>` is SVG's
own escape hatch: it means *this region holds content from another language, go
ask that language's engine to render it*. So the file carries the cloned canvas
plus its stylesheets and contains **no shapes at all** — it is a pointer to a
renderer. Chromium opens it and lays it out with the engine that painted the
screen, which is why fidelity is structural rather than maintained: shadows,
`color-mix()`, gradients and subpixel text are all simply correct, and a CSS
feature nobody has thought of yet will be correct too.

That is the whole argument. A translator — boxes to `<rect>`, text to `<text>` —
is a **dictionary with one entry per CSS feature**, and it is never finished.
Shabnam ships a CSS editor, so its users can always reach a property the
dictionary lacks, and the export would then quietly disagree with the screen.
We built that translator and measured it; see `docs/archive.md`.

**The file must be self-contained, and it carries the book and nothing else.** An
SVG loaded through `<img>` — which is how PNG rasterizes — is sandboxed: no
network, no scripts. So icons travel as data URIs (they already do, §3.3), the
stylesheet is inlined rather than linked, and fonts come from the local machine. A
cross-origin reference would taint the canvas and make `toBlob` throw.

The inlined stylesheet is **the Stylist's sheet alone**, read back with `cssText`.
Everything the diagram needs is in the book — including the layer scaffolding
(`#diagram-svg { position: absolute; inset: 0 }` and friends), which lives in the
theme for exactly this reason. `src/app.css` is chrome, so it has no business in a
picture: inlining it shipped the export dialog's stylesheet inside the diagram, at
roughly four times the CSS. Asking CSSOM to serialize also means there is one
implementation of "the book as CSS" rather than two that can drift, and `cssText`
yields *declared* values, so `var()` and `color-mix()` survive and the file stays
re-themeable.

**The XML rule.** A `<foreignObject>` document is parsed as **XML**, where `<`
opens a tag. The cloned HTML is safe by construction because `XMLSerializer`
escapes it; the one place we splice raw text is the inlined CSS, and a style row's
value can hold a `<` — `content: "<"` is ordinary CSS. One `<` ends the `<style>`
element and the file renders as nothing.

So the CSS sits inside `<![CDATA[ … ]]>`. That is **how text enters XML**, in the
same family as `encodeURIComponent` on a URL — no branches, and not predicated on
anyone misbehaving. There is no validator around it and no guard after it: those
would be what-ifs, and `coding-rules.md` sends what-ifs here rather than into
`src/`.

**The size is the canvas's scroll size, and there is no crop.** `scrollWidth` and
`scrollHeight` rather than `getBoundingClientRect`, because the canvas is a scroll
container and the rect reports the *visible pane*: a diagram wider than the pane
came out cut off at whatever happened to be scrolled into view, and the same wrong
number clipped twice — once as the SVG viewport, once through `width="100%"` on the
`<foreignObject>`. The whole canvas is what a reader means by the diagram, and
whitespace around it is the theme's to give as padding, not the exporter's to invent.

An earlier version measured the ink instead and nested two boxes to clip to it. It
was deleted: the measurement was four selectors wide and each one was a chance to be
wrong, which it was four times over. See `docs/archive.md`.

**Transparency is one CSS rule, not a rect.** The dialog offers a single checkbox,
on by default, and when it is checked the snapshot appends
`#diagram-canvas { background: transparent }` after the book. A `<rect>` cannot do
this — it paints *behind*, and you cannot remove a background by painting behind it.
The background is a declaration, so overriding it is a declaration too.

There is no config model. Behavior that wants to be configuration goes to `:root` or to `action.js`.

**Export** writes the current canvas — skeleton, all sinks, inlined viz.js — as one standalone HTML file.

---

## 5. Runtime lifecycle

Everything runs in the browser. `index.ts` mounts the SolidJS workbench into `body` (§1 — there is no `#root`); the canvas skeleton of §1 is part of the component tree, not a generated string. Offline exploration and prototype scripts are not kept: `research-lab/` holds the DOT fixtures the tests load, nothing else.

`Workbench.redraw` is the conductor:

```
dot text
  → Vizer.render(dot)                         → json
  → Diagram.bag(json)                         → model
  → Diagram.derived(model)                    → StyleBag
  → Stylist.addRule(…, source 1) ×n           → into the book, refused at source 2
  → Stylist.feed()                            → CSSOM on #style-css
  → Diagram.frame(model)                      → #diagram-html
  → [ browser paints ]
  → Workbench.measure()                       → boxes
  → Diagram.clusters / shells / connectors    → SVG sinks
  → Workbench.place()                         → annotation.html
  → action.js last
```

`Files.loadDot` calls `Stylist.reset()` first: a new diagram starts on a blank book
holding only the theme. Redraw does not.

**One conductor means one trigger.** Redraw is a button and a keyboard shortcut, never a keystroke handler, so two overlapping calls cannot happen — which matters because `redraw` awaits a paint in the middle and interleaved calls would inject the SVG layer in either order. Nothing in the UI can cause that today. Anything that could — hot reload, a watcher, the `ResizeObserver` of §3.4 — has to bring a guard flag with it.

A row edit is the short path: `Stylist.addRule` / `removeRule` → one `setProperty` or
`removeProperty` → the browser repaints. No viz, no bag, no frame, no measure. The SVG
layer is drawn from measured boxes, so a row that changes a size needs a Redraw to move
the connectors; a row that changes a colour does not.

Must complete in well under a second on a normal diagram.

**The one sanctioned catch.** `Vizer.render` is wrapped in a single `try` / `catch`, and nowhere else. Malformed DOT is the normal between-keystroke state. The catch shows the Graphviz message and leaves the last good picture standing. Everything downstream of a successful parse still follows: **throw or let it throw.**

---

## 6. Build order

Fresh start. Do these in order, stop after each for review.

1. **Skeleton.** Bun + SolidJS + TypeScript scaffold. `index.ts` mounts the workbench into `#root`. Four tabs, the canvas with its sinks, the Redraw button, the starter DOT. Nothing renders yet.
2. **`Vizer` + `DiagramBagger`.** DOT in, `DiagramModel` out, dumped to the console. Namespaced sanitized ids, subgraph classes, numeric `x` / `y`. This is the step that proves we never need a parser.
3. **`LayoutFramer` + `SHAPE_HTML.box`.** `#diagram-html` filled: boxes in the right columns, correct id and classes. Unstyled is fine.
4. **`Diagram.derived` + `Stylist`.** Derived `StyleRules` per §3.2, merged as the middle layer and fed to CSSOM. Identical input, identical map.
5. **`Measurer` + `NodeSheller` + `EdgeDrawer`.** `svg/box.svg` as the only shell, `icon/` when `icon=` is set, connectors from measured coordinates.
6. **Polish.** Export HTML.

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
| Connector shape | One: an **ortho snake**. No modes. `splines` is not consulted, and neither is a per-edge override. Radius `0` is sharp ortho; a large radius is the old curve. |
| How a connector routes | Corridors are the layout's own gaps — gutters between ranks, row gaps within a rank — walked for fewest turns, then shortest. Not a visibility graph over obstacle edges: the connections are simple and the grid is already there. |
| Connector attachment | Perpendicular to a box side. Left/right across ranks, top/bottom within a rank, decided from measured x-overlap. No axis heuristic. |
| Connector clearance | A preference with a floor. A corridor narrower than the clearance is used last, not refused — user CSS can always close one, and a missing edge is worse than a tight one. |
| Connector metrics | `ConnectorMetrics = { clearance, radius }`, **measured** by the workbench and passed in. A `diagram/` worker never calls `getComputedStyle`. |
| Who touches the DOM | The `workbench/` package and the `Stylist` (its own sheet). `diagram/` workers are pure. |
| How derived rules are built | `Diagram.derived` on the model, returning a `StyleBag`. Flat selectors, shortest that identifies. Classes first, `#id` last. Almost empty if DOT has no style. |
| CSS naming | Identical to DOT naming (§3.1). No prefix, no `cluster_` stripping. |
| A class that is not a DOT name | Exists only if theme or a user row selects it |
| Colour in derived rules | Only from a DOT attribute or a `:root` variable. Never invented. |
| Anonymous subgraphs | `.subgraph_<n>` by appearance order |
| Cluster `.graph` blocks | None. No cluster element is drawn, so the block would be inert. |
| Subgraph selectors | Composed flat: `.cluster_x.node, .cluster_x.record`. The class is on the node element, not a wrapper, and the map key has no nesting. |
| Rank wrapper | `.rank` (Graphviz rank). Never `.column`. |
| SVG custom properties | Tokens keyed on `:root, svg`. `:root` alone is not enough for SVG fill. |
| Element classes | One invented type class, two at most. Mixins are `@apply` only. DOT membership classes all apply. |
| What a rule is | `selector → property → (value, id, source)`. A map entry. Not a line of CSS. |
| Rule id | A counter on the `Stylist`, minted on first sight of a `(selector, property)` and kept by an accepted overwrite. Live-DOM only: it ties a `.row`, a book entry and a declaration together, and is never written to a file. |
| Rule source | `0` theme, `1` dot, `2` user. `addRule` refuses a lower source; equal or higher wins. This replaces the three layers. |
| The style file | Two shapes, one grammar. A **document** is what Save Styles writes: `{ theme, style }`, where `style` holds only the user's rules — `{ selector: { property: { value, source } } }` — and `theme` names the theme they were laid over. A **bare file** is that inner shape alone: the theme, and the whole book an export seed carries. The reader tells them apart by `theme` holding a string. Map insertion order is row order. |
| What Save Styles leaves out | Everything at source `0` and `1`. A theme rule is already in the theme file and a derived rule is rebuilt by the next redraw, so saving either would freeze a copy of something meant to be regenerated. An export is the exception and carries the whole book, because it paints with no theme file to lean on. |
| CSSOM identity | One `CSSStyleRule` per selector. A property is `setProperty` / `removeProperty`, so no index is ever stored — `deleteRule` renumbers, which is why a *CSSOM* index was dropped. A rule id reaches a declaration through the book, as `(selector, property)`. |
| Layer merge | None. One book; a repeated key is an overwrite arbitrated by `source`. No `plus` / `minus`, no `lastDerived`, no merge buffer. |
| An accepted overwrite | Destructive and immediate. The value underneath is not kept, so delete is not revert — except for what `@apply` still supplies. |
| Load vs Redraw | Load DOT resets the book to the theme. Redraw keeps it and re-absorbs the derived bag at source `1`. No purge by source. |
| Editing a row | Writes at source `2`, in place, keeping the row's id. No shadow row, and no read-only row. |
| Tab vs sink | `SetTab` writes the three text tabs. `inject` writes sinks. The styles tab edits the `Stylist`. |
| Who parses CSS | **Nobody, at runtime.** CSSOM receives rules; it is never asked to read a sheet back. The one-shot decomposition lives in `build/` and is not shipped. |
| Who writes CSS text | Nobody — `sheet.ts`'s `serialize()` asks CSSOM for `cssText` off the Stylist's own sheet, for Save SVG and Save PNG only. It is a free function, not a `Stylist` method: the sheet module owns the sheet, so wrapping it on the class was a hop that carried nothing. Export HTML does not need it: it carries the book as data. |
| How the picture becomes a file | A `<foreignObject>` wrapper, not a translation. The file holds the cloned canvas and its CSS, and Chromium renders it with the engine that painted the screen. No `rect`/`text` translation, no dictionary to maintain. |
| Inlined CSS in the file | The Stylist's sheet alone, inside `<![CDATA[ … ]]>`. `app.css` is chrome and stays out. XML reserves `<`, and a style row's value may hold one — that is correct serialization at a boundary, not a guard, so there is no validator and no post-parse check. |
| PNG export | The same snapshot string → `Image` → `<canvas>` → `toBlob`, at 3x. No rasterizer dependency. |
| Target browser | Chromium (§0). Not a support matrix — a ban on compatibility code in `src/`. |
| Theme catalog | None. One shipped theme: `theme/basic-theme.json`. No dropdown, no locked base, no overlay, no theme file verbs. |
| Cascade | One live sheet, `#style-css`, driven by CSSOM. Conflicts resolve in the map, not the cascade. |
| `@apply` | A property whose value is selector keys in the same map. Expanded at feed time, in place, so own later properties win. Expansion is a read — never a book entry. Missing name throws. Cycle throws. |
| CSS text | Produced only by `sheet.ts`'s `serialize()`, only for the picture exports. |
| Attr → CSS property | `ATTR_CSS` registry |
| Attr values | **Passed through, never corrected.** Graphviz's number plus the unit it measured in, and nothing else. It clamps `height=0` to `0.02in` and `width=0` to `0.01in`; we emit `0.02in`, because laying out DOT is its job and a correction here would be a rule the author cannot see. If a value looks wrong, that is a thing to style in the styles tab, not to fix in the bagger. |
| Label escapes | `\N` becomes the node's own name and `\G` a cluster's, because `renderJSON` hands Graphviz's default label over unexpanded. Substitution on one parsed field, not a pass over DOT. |
| Shape | `record` is the one shape with a renderer and a class of its own (`.record`); every other shape is a `.node` that names itself in `data-shape`, verbatim, `box` included. `none`, `box3d` and the rest carry no meaning for us. A class per shape would put a bare DOT word in the class space, where a subgraph of the same name already lives (§3.1). |
| `style` | Each comma-separated word becomes a class — `style="invis,filled"` → `class="node invis filled"`, on nodes and on edges. What a word *means* is the theme's to say: `.invis { display: none }` lives in `basic-theme.json`, not in any bagger. |
| Waiting for layout | `painted()` races `requestAnimationFrame` against `setTimeout(0)`. The frame is what the Measurer wants, but `rAF` does not fire in a background tab or under a virtual clock, and waiting on it alone leaves a redraw unfinished. See `docs/archive.md`, iteration 13. |
| Bag ties | Lexicographically smallest value, for determinism |
| Bag absence | Counts as a value. Absence winning means no class rule for that key. |
| App-owned ids | Two hyphenated words, so they cannot collide with a DOT name |
| Ids | The DOT name, sanitized. Collision throws. |
| How nodes are styled | id + one type class (`node` or `record`) + one class per subgraph. Two classes at most. |
| How HTML varies by shape | `SHAPE_HTML` map. First entry: `box` |
| How shells vary | Files in `svg/`, via `SHELL_SVG`. First file: `box.svg` |
| How icons vary | Files in `icon/` (borrowed) |
| Custom attrs | Fields on the viz object |
| Config tab | Never existed. Behavior → `:root` or action.js |
| Workbench tabs | diagram.dot, styles, annotation.html, action.js |
| Shortcuts | A `Map` registry in `workbench/keys.ts`, not a switch |
| Tab editor | A bare `<textarea>`, inline in `workbench.tsx`. One instance, for the three text tabs. Radio strip selects. No highlighting, no completion. |
| The styles tab | A rows table, not an editor. Native `input list=` for selector and property. A `header` of three checkboxes hides rows by source — view state only, so nothing is written and nothing is fed. A hidden row keeps its place in the book: the edit verbs address a row by position, so the filter carries the book index with each visible row rather than renumbering them. |
| The waiting row | The list always ends with an untouched blank row, and `.rows` is `column-reverse`, so that blank sits at the **top** of the screen — a rule is added by typing, never by asking for a row first. Filling it in appends the next one. ➕ opens another blank after any row; a re-read settles back to exactly one. |
| ❌ | Out of the book, out of CSSOM, and then the element is only **hidden** — not spliced out. The book is the source of truth and the list is rebuilt from it on the next sync, where the row simply will not be. Removing the element as well would be the UI keeping a second opinion about what exists. |
| A row's id | Minted by the book on first sight of a `(selector, property)` and worn by the element from that moment — `addRule` returns it, so a rule is never live with no way to point at its element. |
| UI library | SolidJS. Skeleton is JSX, not a string. |
| viz.js in the page | Inlined. Redraw calls it every run. |
| `try` / `catch` | Exactly one, around `Vizer.render` |
| Tests | Two halves. Pure logic under `bun test`; the live sheet, the repaint and the rows tab under headless Chrome (`bun run test:browser`), because bun has no CSSOM. No test runner dependency — Chrome's `--dump-dom` is the driver. |

---

## 8. Structure

Allowed root folders — git tracks only these plus the named root files, see `.gitignore`:

```
shabnam/
  src/            all TS, TSX, CSS, HTML
  svg/            shells. first file: box.svg
  icon/           borrowed logos
  theme/          the shipped theme: basic-theme.json
  test/           if needed. `test/browser/` is the CSSOM half, run in real Chrome
  docs/           documentation, project management, reports
  research-lab/   DOT fixtures the tests load
  build/          build scripts / generated inputs to the bundler
  dist/           build output. never a source of truth
```

Inside `src/`, one package per stage of the design. A package is a subject expert; a file is a worker.

```
src/
  index.ts          mount the workbench into document.body (no #root, §3.1)
  types.ts          all `type` data + all `interface` traits (not counted in the 7)
  app.css           tokens + the chrome skeleton (the core classes live in the theme)
  index.html        the one page
  assets.d.ts       ambient types for the bundler's asset imports

  diagram/          Diagram facade + private workers. data in, data out. no DOM.
    diagram.ts        Diagram        — bag / frame / derived / clusters / shells / connectors
    vizer.ts          Vizer          — the only viz.js caller
    diagram-bagger.ts the only VizJson reader
    css-bagger.ts     model → derived StyleRules
    layout-framer.ts  model → rank + order within a rank → #diagram-html
    node-shaper.ts    SHAPE_HTML registry
    node-sheller.ts   boxes + nodes → shell SVG
    edge-router.ts    boxes + edges → the ortho snake's waypoints
    edge-drawer.ts    waypoints → connector SVG, with curvable bends

  stylist/          the book and the one live sheet. CSSOM only (§3).
    stylist.ts        Stylist        — addRule / removeRule / reset / cleanup / rows / save / feed
    sheet.ts          CSSOM handle: insertRule, setProperty, expand(@apply) at feed, serialize
    rows.tsx          the styles tab: a rows table, not an editor

  workbench/        the page shell (≤ 7 files)
    workbench.tsx     SolidJS shell: canvas + radio strip + one textarea
    tabs.tsx          four equal buttons. No editor. Workbench owns the window.
    engine.ts         Workbench: redraw / inject / measure / place
    files.ts          Files: DOT, export HTML, the picture snapshot (§4.1)
    export-dialog.tsx format, transparency, scale — in a native <dialog>, unstyled
    keys.ts           KEY_COMMAND registry
```

`stylist/` is the one package outside `workbench/` that touches a browser API, and §3 says why that is allowed and how far it goes. Missing CSSOM throws. It owns `rows.tsx` rather than `workbench/` because the rows *are* the rules — splitting the view from the data would put a fourth file in `workbench/`'s budget to no benefit.

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
| Code files per package | 7. Does **not** count `types.ts` or build / config (`.json`, lockfiles). `diagram/` deliberately runs over: routing a connector and drawing one are separate jobs, and merging them to hit the number would be the bigger file this table exists to prevent. |
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
type TabId = "dot" | "styles" | "annotation" | "action"

// the book: selector → property → (value, id, source). Insertion order is row order.
type Source     = 0 | 1 | 2                                     // theme · dot · user
type Rule       = { value: string; id: number; source: Source }
type StyleRules = Map<string, Map<string, Rule>>

// a producer's output — the derived bag. No ids, no source.
type StyleBag   = Map<string, Map<string, string>>

// what the JSON holds: { selector: { property: { value, source } } }
type StyleFile  = Record<string, Record<string, { value: string; source: Source }>>

// what Save Styles writes: the user's rules, and the theme they were laid over
type StyleDocument = { theme: string; style: StyleFile }

type StyleRow = { selector: string; property: string; value: string; id: number; source: Source }

interface Vizer { render(dot: string): Promise<VizJson> }

interface Diagram {
  bag(json: VizJson): DiagramModel
  frame(model: DiagramModel): string
  derived(model: DiagramModel): StyleBag
  clusters(boxes: Box[], model: DiagramModel): string
  shells(boxes: Box[], model: DiagramModel): string
  connectors(boxes: Box[], model: DiagramModel, metrics: ConnectorMetrics): string
}

interface Stylist {
  addRule(selector: string, property: string, value: string, source: Source): number  // the one door in; returns the entry's id, or REFUSED
  removeRule(selector: string, property: string): void
  reset(): void                         // blank book + theme. Load DOT, not Redraw.
  cleanup(): void                       // drop emptied selectors, re-feed
  rows(): StyleRow[]                    // the tab, source-tagged, in order
  save(): void                          // your rules + the theme's name → style-rules.json
}

interface Workbench {
  redraw(): Promise<void>
  inject(sink: string, text: string): void
  measure(): Box[]
  place(boxes: Box[]): void
}

interface Files {
  loadDot(text: string): void
  saveDot(): string
  exportHtml(): Promise<string>
  exportSvg(): string
  exportPng(): Promise<Blob>
}
```

`Node` / `Edge` / `Cluster` / `DiagramModel` / `Box` / `Layout` are unchanged. `ConnectorMetrics` (§3.4) is the measured pair the router needs, and it is data the workbench supplies — the same arrangement as `Box[]`, for the same reason. `TabText` covers the three text tabs only — the styles tab is not text. Registries (`SHAPE_HTML`, `SHELL_SVG`, `ATTR_CSS`) live with the workers that consult them.

The `Stylist` is seven methods, which is the budget. A new verb replaces one or
goes to a registry — it does not become the eighth.
