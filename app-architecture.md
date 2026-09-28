# Shabnam — App Architecture

**CSS on DOT diagrams.** A DOT-in, HTML-out workbench. A library reads DOT and a library lays it out; we never write a parser of our own, and after the parse the picture is entirely ours.

This is the formal half of [`user-story.md`](user-story.md). The story says what the app is and why; this file says what it therefore does, and what it refuses. When this document and the code disagree, the document wins until we change the document together. Signatures live in [`src/types.ts`](src/types.ts); craft practice lives in [`coding-rules.md`](coding-rules.md). None of the four repeats another.

---

## 0. Stack

Bun (ESM packaging only) + @ts-graphviz/ast + @dagrejs/dagre + markdown-it + TypeScript + SolidJS + HTML + CSS.

A library means we accept its whole dependency tree. Adding, removing, or rescoping anything on this list is a conversation that lands here first.

**The stack is a lock, not carved stone.** "Discussed first" means *bring it up*, not *do without*. If a feature is genuinely better served by a library — a real parser instead of a hand-rolled scanner — say so and we amend this section. Hand-rolling what a mature library does properly, to avoid the conversation, is the worse outcome: more code, less correct, ours forever. We did it once with markdown, and the six regexes' own comment called them "the second grammar we own".

What stays forbidden is a library that changes the *design*: a second DOT reader, a second layout engine, a second UI framework. That ban is about the design, not the dependency count — CodeJar was on this list and was removed, because highlighting cost a library, a highlighter file, nine `hl-*` classes and a `contenteditable` div, and bought the diagram nothing.

**Target: Chromium.** Not a support matrix — a ban on compatibility code in `src/`. No fallbacks, no polyfills, no feature detection, and no declining a platform feature because another engine is slow to it. `<foreignObject>` export (§4.1) is exactly such a feature: WebKit has rendered it badly for years, and that is not a debt on our list.

---

## 1. The product, and the contracts it rests on

One page, one canvas, four tabs, an export that runs without us. The user authors semantics in DOT; we parse it once into a tree, walk that tree once, and take three answers off it — the model, the style rules, and the points and arrows that layout turns into positions. From those we build the HTML and the SVG layer drawn around the *measured* boxes. After the walk, **we** own the picture. There is never a second grammar.

If a proposed change requires reading DOT as a string — tokenize, recursive descent, `parseAst`, regex over statements — it is out of scope. Stop and come back here.

### 1.1 The canvas skeleton

Named sinks, one per worker. Child order is load-bearing (§3.4).

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

**Every id the app owns is two hyphenated words**, because node ids are bare DOT names (§3.1) and the two namespaces share one space: `#diagram-canvas`, never `#canvas`. The chrome's own boxes take it further and carry no id at all — `body > main` and `body > aside` reach them, and the workbench renders straight into `body` with no `#root`. **A rule about diagram *content* never reaches through a sink id** — a node, an edge or a cluster is selected by its DOT name and its type class, never as `#diagram-html .node`. The sinks themselves are a different matter: the theme styles `#diagram-canvas`, `#diagram-svg` and `#annotation-html` directly, because the canvas is where tokens have to sit to resolve in both places (§4.3) and the annotation scaffolding has to travel with the picture (§4.2). A root graph attribute lands there too (§3.2).

**`#connector-paths` is last, and an edge can therefore cross a caption.** `paint-order: stroke` masks only siblings drawn earlier, which is why `NodeSheller` emits all shell groups and *then* all captions — that fixes shell-over-caption, and edge-over-caption is not fixable inside a two-group skeleton. Closing it means a third `<g>` here, i.e. changing this section. Living with it is the position.

### 1.2 One book of rules

```
StyleRules: selector → property → (value, id, source)
source:     0 theme · 1 dot · 2 user
```

No layers, no merge step, no `plus` / `minus`, no `lastDerived`, no merge buffer. `Stylist.addRule` is the one door in and it **refuses a write whose source is lower than the entry already there** — equal or higher wins. That single guard is what three layers used to be for: a redraw feeds derived rules at `1` and cannot take a row back off the user at `2`.

1. **Load DOT** starts blank, absorbs `theme/basic-theme.json` at `0`, draws, then absorbs `Diagram.derived(model)` at `1`.
2. **Redraw** keeps the book and re-absorbs the derived bag at `1`.
3. **A row edit** writes at `2`.

**An accepted overwrite is destructive, immediately, by design.** The entry is replaced and CSSOM is told; the value underneath is not kept anywhere. So a row you type on a key the theme owns does not sit *on top of* the theme's entry, it **becomes** it — delete that row and the theme's value goes with it. What does come back is anything `@apply` still supplies. Load DOT is the way back; softening this means a second entry per key, which is the three layers returning, so it is a conversation about this section rather than a patch.

Because Redraw does not flush, a rule derived from a DOT you have since edited stays in the book at source `1`, as a visible row with a delete button. **Load DOT is the reset path.** There is no purge-by-source machinery.

**There is one sheet and it is not text.** `#style-css` is owned by the `Stylist`, which mutates `.sheet` through CSSOM — `insertRule`, `setProperty`, `removeProperty`. Nothing writes its `textContent`. `sheet.ts`'s `serialize()` reads it back for the picture exports only (§4.1), and is the single place CSS text is produced at all.

### 1.3 `@apply`

A **property** whose value is a space-separated list of selectors that are keys in the same map. It survives in the data and on disk, and resolves only when feeding CSSOM: the named keys' declarations are set at the position `@apply` appears, so the selector's own later properties win. **Expansion is a read, never a write** — an expanded declaration reaches the sheet and never becomes a book entry, so there is no question of what source it would carry and the tab keeps showing exactly what was said. Undefined name throws. Cycle throws.

Mixins (`.paper`, `.glass`, `.row`, `.col`) exist only for `@apply`; they are never put on an element.

---

## 2. Who reads DOT, and who decides where things go

`@ts-graphviz/ast` is the **only** thing that reads DOT. `@dagrejs/dagre` is the **only** source of geometry. Each is visible inside exactly one class, and the class is named after it — `GraphvizAst`, `DagreLayout` — so the type list alone tells you where a dependency could leak from, and replacing one is a single file.

**We never write a parser.** `parse(dot)` returns a tree of `Graph`, `Subgraph`, `Node`, `Edge` and `AttributeList`, and we walk it once. A tokenizer, a recursive statement parser, or regex that reconstructs DOT grammar all stay refused (§7) — calling a maintained parser is the opposite of writing one.

**The `Ast` is a hub, not a stage in a chain.** One walk records what was written *and where*; three answers are pure readings of that record, because each one needs something the others throw away.

```
dot ──parse──▶ Ast ──┬──▶ DiagramModel     who exists, who connects, who belongs
                     ├──▶ DotStyles        appearance, at the branch it was written
                     └──▶ PointGraph ──layout──▶ Positions
```

**An attribute is either markup or appearance**, and every attribute falls on one side. `label`, `shape`, `icon` and `caption` decide what HTML we build, so they belong to the model. Anything `ATTR_CSS` recognises becomes a rule and belongs to the styles. Anything in neither is not our business and is dropped.

**Markup is resolved; appearance keeps its provenance.** This asymmetry is the whole reason an AST beats a laid-out JSON, so it is worth stating plainly. A node must know its own shape, so a `node [shape=record]` written on a cluster is pushed down onto every member as the model is built, innermost winning. A colour must **not** be pushed down, because the branch it sits on *is* the selector we want: `node [fillcolor=coral]` inside `cluster_a` becomes `.cluster_a.node, .cluster_a.record`, one rule, not three `#id` rules and a statistical guess at which value was the default.

That guessing is what this design deletes. The old pipeline received defaults already resolved onto leaves, so it recovered them by tallying the most common value per key, counting absence as a value, and breaking ties lexicographically. None of that is needed when the tree says where the author wrote it.

**Membership is cumulative and textual.** A node named inside two subgraphs belongs to both, and every enclosing scope becomes a class. There is no declaration-scope trap: the tree knows where each name appears, so a cluster written after its edges still collects its members.

**Layout is asked for the least we can.** It gets a `PointGraph` — nodes with no size and no shape, arrows with no weight — plus the two structural facts that genuinely are its business: which groups asked for one rank, and which clusters want boxing together. It answers with an integer `rank`, an integer `order` within that rank, and a rough `x, y`. Rough is the point: CSS decides real size, and the coordinates only ever tell us sequence.

**`rank=same` is the one thing dagre cannot express.** A numeric `rank` on a node is ignored, `rank: "same"` crashes it, and a zero `minlen` edge throws — all three probed. So `DagreLayout` **contracts** each group into one stand-in node, lays that out, and expands it: members inherit the stand-in's rank and spread across it. That is the worker's private business and no type above it knows. Verified against Graphviz on both example files: the rank partition matches exactly.

---

## 3. One walk, three answers

```
dot text
  │
  ├─ GraphvizAst ─────────► Ast              the only DOT reader
  │    ├─ .model()  ──────► DiagramModel     identity and connection, no coordinates
  │    ├─ .styles() ──────► DotStyles        appearance, at its branch
  │    └─ .points() ──────► PointGraph       no styles, no sizes, no weights
  │
  ├─ DagreLayout.place ───► Positions        rank, order, rough x/y
  │
  ├─ Diagram.frame ───────► mainHtml         ranks + node HTML
  ├─ Stylist.addRule ×n ──► the book, at source 1 (refused where the user wrote)
  ├─ Stylist.feed ────────► #style-css .sheet   (CSSOM, @apply expanded here)
  │
  │      ── inject, let the browser paint ──
  │
  ├─ Workbench.measure ────► Box[]
  ├─ Diagram.clusters / shells / connectors ► SVG sinks
  └─ Workbench.annotate ───► annotation rows → #annotation-html, then anchored
```

Two rules hold it together. **One walk, three answers:** the parsed tree never escapes `GraphvizAst`, so there is no opaque JSON passed around and nothing downstream knows a library exists. **Pure workers, one DOM owner:** files in `dot/` and `diagram/` are data in, data out; only the workbench and the `Stylist` touch the live page.

There is no CSS text anywhere on this path. A rule is data from the moment it is bagged to the moment CSSOM receives it. `stylist/` is the one package outside `workbench/` that touches a browser API, because the browser is the only CSS engine we want, and the sheet is live on purpose — a property change must repaint without a redraw. Missing CSSOM throws; do not fall back to `textContent`.

### 3.1 `GraphvizAst` + `model.ts` — the model

One walk records what was written and where; `model.ts` reads that record into `DiagramModel`: nodes, edges, clusters, `rankdir`. Identity is decided here, once, for everyone. Subgraph names become CSS classes on member nodes and nested subgraphs, and nodes and edges carry their id and class list. **The model holds no coordinates** — `Positions` owns those, and a model carrying both would be two sources of truth waiting to disagree.

**Identity in CSS is identity in DOT. Nothing less, nothing more.**

| Object | DOT | CSS |
|---|---|---|
| node | `lake` | `#lake` |
| subgraph | `subgraph cluster_source` | `.cluster_source` |
| edge | `lake -> runtime` | `#lake_runtime` (`_2`, `_3` … for parallel edges) |
| anonymous subgraph | `subgraph { … }` | `.subgraph_1`, `.subgraph_2` … by appearance order |

No prefix, no namespace, and **no `cluster_` stripping**. Nodes, edges and clusters share one HTML id space; that is safe only because it is loud. A name with a space gets `.replace(/ /g, "_")` and nothing more: a user who gave a node no real name was never going to select it later, so the only duty is that the code and the downstream arithmetic do not break.

**A class that is not a DOT name must be referenced by theme or style to exist at all.** The allowed invented classes are `diagram`, `rank`, `node`, `record`, `shell`, `edge`, `arrow`, `cluster_`, `cell`, `label`, `icon`, plus a path class on a cell (`._1`, `._2_1`). A grouping class nothing selects is noise and gets deleted.

**One invented class, two at most.** An element carries one type class; a second class is only a DOT name (subgraph membership, cell path). `.record` *is* the node — it does not also say `.node`. `.cluster_` is the type class on the cluster SVG group, and the DOT name stays the `id`.

Two values pass through verbatim rather than being interpreted. **An attr value is what the author typed, with one correction: a bare number gains `px`.** `height=0` is not clamped to `0.02in` the way the old reader would have, and a colour, a font name or anything else non-numeric is untouched. The `px` is owed because a DOT length is a bare number and `font-size: 12` is **invalid CSS** — a `<length>` needs a unit unless it is zero — so CSSOM refused those declarations outright and `#horizon`'s `fontsize=12` in `example-2.dot` had never once been painted. A rule nobody can see is worse than a rule that was adjusted, and one numeric test covers every length because no colour or font-family value is ever a bare number. Beyond the unit, a correction would be a rule the author cannot see; if a value looks wrong, style it in the styles tab. **`style`'s comma-separated words each become a class** — `style="invis,filled"` → `class="node invis filled"`, on nodes and edges — and what a word *means* is the theme's to say: `.invis { display: none }` lives in `basic-theme.json`, not in a worker.

**Label escapes are substitution on one parsed field**, not a pass over DOT: `\N` becomes the node's own name and `\G` a cluster's. A node that never named a label simply has none, and the model falls back to its id.

### 3.2 `styles.ts` — appearance, at its branch

Reads the walk's record, emits `DotStyles` — data, not text. Appearance only, and almost empty if the DOT has no presentation. It mints no ids and sets no source; the `Stylist` stamps both as it absorbs at source `1`.

Translation is a registry, not scattered logic: `ATTR_CSS` maps `fillcolor` and `bgcolor` to `background-color`, `color` to `border-color`, `fontcolor` to `color`, `fontname` to `font-family`, `fontsize` to `font-size`, `penwidth` to `border-width`, and `width` / `height` to themselves. Unmapped attributes are skipped, and being unmapped is the definition of not being appearance. A value on the way through gains `px` if it is a bare number (§3.1).

**A scope's own attributes name that scope, and the root names both.** A subgraph's are `.cluster_a` — the bare class, not the composed nesting a `node [...]` gets, because the attribute is about that subgraph rather than about its members. The root graph's are `:root, svg`, and the two forms agree: a bare `bgcolor="white"` and a `graph [bgcolor="white"]` produce the same rule, since both are the scope talking about itself.

**Derived rules never invent a colour** — and never invent anything else either. Every value traces to a DOT attribute the author wrote. If the DOT declares four colours, four is what the reader finds; if it declares none, the reader emits nothing and the theme does all the talking. `example-1.dot` is exactly that case: pure markup, not one derived rule.

That is stricter than it used to be, and deliberately. The old reader built a token preamble instead — `--primary-color`, `--main-font`, `--raised-shadow` and eight more — falling back to literal `"blue"`, `"green"`, `"orange"` and `"14px"` when the DOT said nothing, and reaching for the first node that happened to carry a `color` when it wanted a secondary. That is a value invented and a default recovered by position, both refused (§7). Worse, it wrote at source `1` onto the same canvas selector the theme owns at source `0`, so by §1.2's equal-or-higher guard every redraw **replaced** the theme's real palette with the invented one. The tokens are the theme's, all seventeen of them are in `basic-theme.json`, and a reader that may not invent a value cannot be the thing that supplies them.

**A rule comes from the branch, not from a tally.** A `node [...]` at the root is `.node, .record`; the same statement inside `cluster_a` is `.cluster_a.node, .cluster_a.record`; a node's own attributes are `#id`; a subgraph's own attributes are `.cluster_a`. Nothing is counted and nothing is inferred — the nesting the author wrote *is* the selector, which is the §2 asymmetry paying for itself.

**Selectors are flat, and as short as they can identify.** `.rank`, not `.diagram .rank`, because there is only one place a rank can be. There is no `.diagram { … }` wrapper, and the SVG layer's `.shell` / `.edge` / `.arrow` / `.cluster_` carry no sink id. A subgraph does not nest either: a member rule is composed as `.cluster_consumer.node, .cluster_consumer.record`, and a nested one as `.cluster_consumer.inner_subgraph.node`. The reason is that a subgraph name is a class on the node element itself — there is no wrapper element — so `.cluster_consumer .node` would match nothing. CSSOM has no nesting and there is one rule per selector, so the composed selector is written directly.

**A token block must be on the canvas, not on `:root`.** A sheet attached to the page is not guaranteed to resolve custom properties inside an SVG subtree from `:root` alone, so the theme keys them on `#diagram-canvas, svg` — the nearest ancestor of both layers, in the page *and* in an exported file. `:root` is the wrong anchor for a second reason, which is why **a root graph attribute is `#diagram-canvas`**: `:root` is `<html>` on screen and the `<svg>` element after export, so one rule would paint two different things, and a DOT `bgcolor` would tint the app's chrome rather than the diagram. The theme and a derived rule therefore name the same element, and the export cannot disagree with the screen about which one it was.

**No derived margins.** Nothing about spacing is computed from a coordinate. Earlier iterations derived a per-node "weight" margin from the within-rank coordinate; it is gone, because every formula read as a plausible proxy for isolation and none survived contact with real diagrams, and it was the only value in the pipeline computed rather than passed through. That law now holds with no exception.

**There is no per-cluster `.graph` block, and no diagram-level one.** A cluster gets no element — the SVG layer paints above `#diagram-html`, so a cluster background drawn there would cover its own members. A block styling an element nobody draws is inert, and inert output is worse than absent output.

**Annotations, labels, icons and edges carry their classes and nothing else, on purpose.** The theme says deliberately nothing about `.icon` or `.cluster_ .label`, and two consequences are visible: an `.icon` from markdown has no size rule, so an image with a `viewBox` and no intrinsic width fills its node; and a cluster label inherits the group's `fill`, so it is legible only against white. Both are left alone, because a default chosen without a use case is one someone has to fight later. **Do not "fix" these in passing** — they wait for a request that says what the right value is, and the class is the extension point that makes waiting cheap.

### 3.3 `LayoutFramer` + `NodeShaper` — the HTML layer

**Ranks arrive as integers, so there is nothing to recover.** `Positions` gives each node a `rank` and an `order` within it, and framing is group-and-emit. The old bucketing — a four-entry `rankdir` axis map, a 2-point tolerance, and a pass over coordinate-sorted nodes opening a new rank on each gap — is gone, along with the reason it existed: the old reader's node objects carried no rank, so one had to be inferred from a coordinate. Never write a test that chases the last decimal of a coordinate; there is no longer one in the path.

**Zero inline styles.** The generated markup has no `style="…"` and no JavaScript: structure is elements, appearance is stylesheets.

```html
<div class="diagram">
  <div class="rank">
    <div id="lake" class="node cluster_consumer">…</div>
```

Each node is the DOT name sanitized as `id`, **one** type class, and one class per subgraph it belongs to. The subgraph class is the styling surface that matters; `#id` is left over for one-off overrides.

Markup comes from the shape registry — `SHAPE_HTML.get(node.shape) ?? SHAPE_HTML.get("box")`. **`record` is the one shape with a renderer and a class of its own**; every other shape is a `.node` that names itself in `data-shape`, verbatim, `box` included. A class per shape would put a bare DOT word into the class space where a subgraph of the same name already lives (§3.1). A record's label currently keeps its DOT source verbatim — `{Data \n Lake | {Batch | Columnar}}` — because nothing splits on `|` and `{}` yet: a missing map entry, not a bug. Reading the parsed `label` field is not writing a parser; reading the DOT text would be.

The shell registry makes the same promise one level down — a new shell is a file in `svg/`, one `SHELL_SVG` entry, and its import — and that promise is **untested**, because `svg/box.svg` is still the only shell and the token vocabulary (`{{x}} {{y}} {{width}} {{height}}`) has never had to serve a second shape.

**Markdown is `markdown-it`, configured once** in `diagram/markdown.ts`: `renderInline()` for a label, because a label is a name and not a document, `render()` for an annotation, where paragraphs and lists are wanted. `html` · `breaks` · `linkify` on.

**A line break is `\n`** — a literal backslash and the letter `n` — for labels *and* annotations, one contract. A pre-pass turns `\n` / `\l` / `\r` into a real newline and `breaks: true` turns that into a `<br>`. It has to be typeable as visible characters, because both CommonMark mechanisms are unreachable from a single-line `<input>`: Enter inserts nothing and a two-space hard break cannot be seen. `\n` is already what a DOT author writes. Accepted: `\n\n` is a paragraph break in block mode, and a literal backslash-n is `\\n`.

**HTML in a label passes through**, because `html: true` — a deliberate widening, since the app already injects trusted HTML into its sinks and runs arbitrary `action.js`. **Images resolve through markdown-it's own `image` renderer rule**, overridden to emit `<img class="icon" src="…">` against the `ICONS` map, so `![star](star.svg)` becomes an inlined data URI. That is the library's documented hook; the parser's output is never post-processed. A remote image would make Redraw fetch, taint the PNG canvas, and cost Export HTML its standalone-ness.

### 3.4 `Measurer` + `NodeSheller` + `EdgeDrawer` — the SVG layer

Once the browser has painted `#diagram-html`, `Measurer` reads the real geometry into `Box[]`. **Measured geometry is the single source of truth for size and position**, and neither the model nor `Positions` carries a width or a height: two sources of size would guarantee someone eventually uses the wrong one.

- **`NodeSheller`** draws cluster boxes under `#cluster-shells` around measured members of `cluster_*` subgraphs with their labels, then shells around each node box. `SHELL_SVG` maps `shell=` to a file in `svg/`, defaulting to `box.svg`; `icon=` comes from `icon/`. Invisible clusters (`style=invis`) are not drawn, but still contribute their class.
- **`EdgeDrawer`** draws from measured coordinates, never `_draw_` paths, so edges keep following our boxes after CSS changes a gap, a font or a width. It attaches and renders; it does not decide the route.
- **`EdgeRouter`** decides the route: one shape, an **ortho snake**, no modes.

A **caption is drawn only when the DOT asked for one.** `caption` falls back to `label` in the model, which is the right place for the fallback — but the HTML layer owns the text, so rendering the fallback here would print every label twice. The model-level promise and the on-screen result differ on purpose, and this is the one place that is true.

**The corridors are free**, because the layout is already a grid: vertical corridors are the gutters between ranks, horizontal ones the gaps between rows. A walk over their intersections preferring **fewest turns, then shortest** is a few dozen nodes on a real diagram, which is why this is a heuristic and not a search over an obstacle-edge visibility graph.

| pair | attaches on | first / last segment |
|---|---|---|
| different ranks | left / right | horizontal |
| same rank | top / bottom | vertical |

Same-rank is decided from **measured x-overlap**, not `pos`. A side attachment for a same-rank pair would have to leave the right edge and loop back to the left to get in, which is worse than the vertical it replaces.

**Clearance is a preference with a floor, never a refusal** (the story does the arithmetic). Obstacles are every box but the edge's own two, inflated by `clearance`; a corridor narrower than that stays usable but is ordered last. Arbitrary user CSS can always close a corridor, and an edge that declines to render is worse than a tight one.

**Bends are curvable, and that is the only knob.** The radius is a parameter — `0` is sharp ortho, large is a rounded snake — clamped to half the shorter adjacent segment so a tight corridor cannot produce a corner that crosses itself. `splines` is **not** consulted, neither the graph attribute nor a per-edge override, and `line` / `curved` / `spline` are not modes. Radius `0` is the old sharp ortho and a large radius is close to the old curve, so nothing is lost but an author-visible attribute did go quiet.

Both numbers are measured, so they arrive as `ConnectorMetrics` the way the boxes do. A `diagram/` worker that reached for `getComputedStyle` would be reading the page it exists to describe.

**Measured means measured once, not live.** Anything that reflows `#diagram-html` without a redraw — browser zoom, a window resize, a pane that changes width — moves the boxes while the three SVG sinks keep the coordinates they were measured at, so shells and connectors visibly displace until the next Redraw. This follows from the two-pass design rather than contradicting it. A `ResizeObserver` on `#diagram-canvas` would close it and would be the first reactive machinery in the app; weigh that against §5's single conductor before adding one.

---

## 4. Tabs, sinks, and files

Tabs, in this order: **diagram.dot · styles · annotations · action.js**

Two of them are text and two are not. `SetTab` writes a **text tab**; `inject` writes a **sink**; those are different directions. The other two are **rows views** onto a model they edit directly — the styles tab onto the book, the annotations tab onto the annotation list.

| Tab | Sink | Who writes it |
|---|---|---|
| diagram.dot | source for the `Ast` | User. Seeded with a starter diagram. |
| styles | `#style-css` via CSSOM | The `Stylist`. One book: theme at `0`, derived at `1`, rows at `2`. |
| annotations | `#annotation-html` | The annotation list, rendered. |
| action.js | `#action-js` | User. Runs last. |

The coding window is **one `<textarea>`**, written inline in `workbench.tsx`, serving both text tabs — a component that wraps one element and forwards two props is a file for nothing. `tabs.tsx` is a radio strip of four equal buttons that knows nothing about contents. No highlighting, no completion, no caret of ours. **Autocomplete is not part of the fiddle**; do not put `suggestions` on `Workbench`.

**One toolbar, and it is `main`'s `nav`.** Every action lives there — Redraw, Load / Save DOT, Save SVG, Save PNG, Export HTML, Save Styles. No panel carries buttons of its own and there is no status line: a redraw that cannot parse its DOT throws rather than writing a message into a corner.

| Keys (`Cmd` on macOS, `Ctrl` elsewhere) | Verb |
|---|---|
| `Cmd+Enter` | Redraw |
| `Cmd+O` / `Cmd+S` | Load / Save DOT |
| `Cmd+P` · `Cmd+Shift+E` · `Cmd+E` | Save PNG · Save SVG · Export HTML |
| `Cmd+1` … `Cmd+4` | the four tabs |

Bindings are a `Map` registry in `workbench/keys.ts`, not a switch. The four the browser claims are `preventDefault`ed.

**The chrome's CSS is `src/app.css`, and it is deliberately small.** Tokens on `body`, then a skeleton reached by element and position — `body > main`, `nav`, `textarea`, `aside > section` — rather than a hook per box. The four core classes (`.paper` · `.glass` · `.row` · `.col`) are not here: they belong to the theme and arrive through the sink. A hook is allowed for the layout, for a sink the engine writes, or for a state a test drives — not for decoration — and the semantic element beats a class, including `hidden` over a `.hidden`. The styles tab's own CSS is ten lines, and being restylable in ten lines is the point.

### 4.1 The styles tab

A rows table, not an editor, with native `input list=` for selector and property. **A row commits on `change`, all three boxes, never on `input`** (§5). **The list always ends with an untouched blank row and `.rows` is `column-reverse`**, so that blank sits at the top of the screen: a rule is added by typing, never by asking for a row first. Filling it in appends the next one; ➕ opens another blank after any row; a re-read settles back to exactly one.

**An unsupported value is refused before the book, not marked after it.** `supported()` is asked *before* `addRule`, so the book and the sheet keep their last good value while the row carries the user's text plus `.invalid`. Writing first and marking afterwards — which the code did — meant a half-typed `0px0` reached CSSOM, was dropped in silence, and took the previous value down with it. The rekey `removeRule` still runs, so a refused row cannot leave a stale entry under its old name.

**❌ takes the rule out of the book and out of CSSOM, then only hides the element.** The book is the truth and the list is rebuilt from it on the next sync, where the row simply will not be; removing the element too would be the UI keeping a second opinion about what exists.

A `header` of three checkboxes hides rows by source — view state only, so nothing is written and nothing is fed. A hidden row keeps its place in the book: the edit verbs address a row by position, so the filter carries the book index with each visible row rather than renumbering.

**A row's id is minted by the book on first sight of a `(selector, property)`** and worn by the element from that moment — `addRule` returns it, so a rule is never live with no way to point at its element. It is live-DOM only and never written to a file. CSSOM keeps one `CSSStyleRule` per selector and a property is `setProperty` / `removeProperty`, so no index is ever stored: `deleteRule` renumbers, which is why a CSSOM index was dropped.

**A row is three columns in a narrow pane, and it clips.** Long property names run past the pane mid-word; every box carries a `title`, so a clipped row is readable on hover. A wrapping grid or a resizable pane both cost more than the annoyance.

**There is no CSS selector validator.** `addRule` ends in `sheet.insertRule`, which throws on a selector CSSOM cannot parse. Committing on `change` keeps mid-typing state away from it, but a *finished* typo (`.`, `#`) reaches `insertRule` and takes the app down with a stack. That is the preferred failure. If it ever becomes intolerable the honest fix is a browser-supplied probe, never a grammar of our own.

### 4.2 Annotations

**A row is the model; the mark is derived and never read back**, because parsing HTML into rows is the parser §3.5 refuses. The list is **ordered**, not keyed by selector — two marks may point at the same node and the second is not an overwrite.

Six columns wrapping into two lines out of one flex row: `❌ selector dx dy class ➕`, then the text across the full width, because the text box takes the whole width and everything before it is therefore line one. The list reads **top-down**, unlike the styles rows: a style row's neighbours mean nothing, so reversing that list costs nothing, while an annotation list's order is the order they were written in. Its ❌ removes the entry outright for the same reason — here the list *is* the model, so dropping an entry re-renders without it in the same turn, and a `gone` flag would be a second opinion.

**A row reaches the sink only when selector and text both say something.** `querySelectorAll("")` throws, so a half-filled row would take the next `place()` down. A blank offset or class is simply left off the element, so the theme's `var(--dx, 0px)` default applies rather than an empty declaration.

**`data-selector` is a CSS selector, run as one.** `place()` hands it to `querySelectorAll` against the whole document and publishes the centre of the box containing **every** match onto the mark as `--anchor-x` and `--anchor-y`. So a node is `#core`, and for no extra feature a rank is `.rank`, a cluster is `#cluster_source`, a class of nodes is `.node`, and the drawing's own frame is `#annotation-html`. A selector matching nothing throws, saying which; one that is not a selector throws from `querySelectorAll`, already naming itself. Marks are measured off the **annotation layer**, not the canvas, because the layer is what `left` / `top` are relative to: absolutely positioned inside a scroller, so it travels with the content and its corner *is* the origin. No scroll term, and no separate case for the canvas.

The theme spends those two numbers — and **the block has to live in `theme/basic-theme.json`, never `src/app.css`**, because §4.3 keeps chrome out of a picture export: a rule that positions annotations from there works on screen and then collapses every mark to the layer's corner in every exported SVG and PNG.

```css
#annotation-html > [data-selector] {
  position: absolute;
  left: calc(var(--anchor-x) + var(--dx, 0px));
  top:  calc(var(--anchor-y) + var(--dy, 0px));
  transform: translate(-50%, -50%);
}
```

**The offset is `--dx` / `--dy`, any length CSS accepts** — `200px`, `3em`, `50%`, `min(10vw, 4em)` — written in the row's own column or as a styles row. It is never parsed, added or validated here, because arithmetic on a length we did not parse is arithmetic we cannot do; `calc()` does it, and a malformed value is invalid at computed-value time, so CSS drops the declaration and the mark sits at the layer's corner. **Signs are CSS's: `--dy` grows downward**, and `%` resolves against the layer. Two things follow free — an offset restyles live with no redraw, and the mark's own centre lands on the point without anything measuring the annotation.

**There is no origin form, because it needs none.** The layer is a thing a selector can match, so `data-selector="#annotation-html"` with `--dx: calc(-50% + 1em)` is one em in from the drawing's corner. A branch in `place()` for "no anchor" would be a second way to say the same thing. Both starter marks are exactly these two cases, so the pair is under test on every run.

**Annotation text is block markdown** (`render()`), so a note gets paragraphs and lists, against a label's inline. One `\n` contract across both (§3.3).

### 4.3 Export — HTML out as itself

A picture export is a **wrapper, not a translation**. The file carries the cloned canvas plus its stylesheet and contains **no shapes at all**; Chromium lays it out with the engine that painted the screen, which is why fidelity is structural rather than maintained. The story makes the full argument, including the translator we built and deleted.

**Save SVG and Save PNG are one path.** Both ask for the same `<foreignObject>` snapshot; PNG then rasterizes that string through `Image` → `<canvas>` → `toBlob` at 3x. No rasterizer dependency, and nothing translated on either.

**The file must be self-contained, and it carries the book and nothing else.** An SVG loaded through `<img>` is sandboxed: no network, no scripts. So icons travel as data URIs (they already do), the stylesheet is inlined rather than linked, and fonts come from the local machine — a cross-origin reference would taint the canvas and make `toBlob` throw. The inlined sheet is **the Stylist's alone**, read back with `cssText`: everything the diagram needs is in the book, including the layer scaffolding, which lives in the theme for exactly this reason. `src/app.css` is chrome, so inlining it shipped the export dialog's stylesheet inside the diagram at roughly four times the CSS. Asking CSSOM to serialize also means one implementation of "the book as CSS" rather than two that drift, and `cssText` yields *declared* values, so `var()` and `color-mix()` survive and the file stays re-themeable. Export HTML does not need `serialize()` at all — it carries the book as data.

**The XML rule.** A `<foreignObject>` document is parsed as XML, where `<` opens a tag. The cloned HTML is safe by construction because `XMLSerializer` escapes it; the one place we splice raw text is the inlined CSS, and a style row's value can hold a `<` — `content: "<"` is ordinary CSS. So the CSS sits inside `<![CDATA[ … ]]>`. That is **how text enters XML**, the same family as `encodeURIComponent` on a URL: no branches, not predicated on anyone misbehaving, and therefore no validator around it and no guard after it.

**The size is the canvas's scroll size, and there is no crop.** `scrollWidth` / `scrollHeight`, not `getBoundingClientRect`, because the canvas is a scroll container and the rect reports the *visible pane*: a diagram wider than the pane came out cut off at whatever was scrolled into view, and the same wrong number clipped twice. The whole canvas is what a reader means by the diagram, and whitespace around it is the theme's to give as padding, not the exporter's to invent. An earlier version measured the ink and nested two boxes to clip to it; it was four selectors wide, each one a chance to be wrong, which it was four times over.

**Transparency is one CSS rule, not a rect.** The dialog offers a single checkbox, on by default, appending `#diagram-canvas { background: transparent }` after the book. A `<rect>` paints *behind*, and you cannot remove a background by painting behind it.

**Export HTML** writes the current canvas — skeleton, all sinks, the inlined bundle — as one standalone file. It no longer carries a WASM Graphviz, so the old 3.4 MB is gone.

There is no config model. Behaviour that wants to be configuration goes to `:root` or to `action.js`.

### 4.4 Theme and style files

Exactly one shipped theme, `theme/basic-theme.json`, decomposed once from a `basic.css` that no longer ships — the JSON is the artefact, and the runtime has no CSS file for the diagram. No catalog, no dropdown, no locked base, no overlay, no theme file verbs.

**Two shapes, one grammar.** A **document** is what Save Styles writes: `{ theme, style }`, where `style` holds only the user's rules and `theme` names the theme they were laid over. A **bare file** is that inner shape alone — the theme, and the whole book an export seed carries. The reader tells them apart by `theme` holding a string. Map insertion order is row order.

**Save Styles leaves out everything at source `0` and `1`**: a theme rule is already in the theme file and a derived rule is rebuilt by the next redraw, so saving either freezes a copy of something meant to be regenerated. An export is the exception and carries the whole book, because it paints with no theme file to lean on.

---

## 5. Runtime lifecycle

Everything runs in the browser. `index.ts` mounts the SolidJS workbench into `body`; the canvas skeleton is part of the component tree, not a generated string.

`Workbench.redraw` is the conductor:

```
dot text
  → new GraphvizAst(dot)                      → ast
  → ast.styles()                              → DotStyles
  → Stylist.addRule(…, source 1) ×n           → into the book, refused at source 2
  → Stylist.feed()                            → CSSOM on #style-css
  → DagreLayout.place(ast.points())           → positions
  → Diagram.frame(ast.model(), positions)     → #diagram-html
  → [ browser paints ]
  → Workbench.measure()                       → boxes
  → Diagram.clusters / shells / connectors    → SVG sinks
  → Workbench.annotate()                      → #annotation-html, then place()
  → action.js last
```

`Files.loadDot` calls `Stylist.reset()` first: a new diagram starts on a blank book holding only the theme. Redraw does not.

**One conductor means one trigger.** Redraw is a button and a shortcut, never a keystroke handler, so two overlapping calls cannot happen — which matters because `redraw` awaits a paint in the middle and interleaved calls would inject the SVG layer in either order. Nothing in the UI can cause that today. Anything that could — hot reload, a watcher, the `ResizeObserver` of §3.4 — has to bring a guard flag with it.

**So nothing repaints while you are typing, and that is law rather than an accident of the wiring.** Two halves, two mechanisms:

- **A text tab never live-updates.** `onInput` writes the store and does nothing else; the store is read at `redraw()`. The picture is exactly as stale as the last Redraw. An `onInput` that draws is the interleaving above, arriving one keystroke at a time.
- **A rows tab commits on `change`.** A row edit is the short path and would not interleave a draw — but it would make every intermediate state a `setProperty`, and the picture would flicker through `1`, `1p`, `1px`. The value box was bound to `onInput` until Session 4; that was a bug, not a feature.

**Two short paths.** A style row is `addRule` / `removeRule` → one `setProperty` → repaint: no parse, no walk, no frame, no measure. Because the SVG layer is drawn from measured boxes, a row that changes a size needs a Redraw to move the connectors; one that changes a colour does not. An annotation row is `annotate()` → the sink → `place()`, with no `await` — `place()` measures with `getBoundingClientRect`, which lays out synchronously, so it cannot interleave with the conductor and needs no guard flag. It re-anchors every mark, because the whole layer costs a handful of rects.

**Waiting for layout:** `painted()` races `requestAnimationFrame` against `setTimeout(0)`. The frame is what the Measurer wants, but `rAF` does not fire in a background tab or under a virtual clock, and waiting on it alone leaves a redraw unfinished.

**The one sanctioned catch** is around the parse, and nowhere else. Malformed DOT is the normal between-keystroke state; the catch shows the parser's message and leaves the last good picture standing. Everything downstream of a successful parse still follows: **throw or let it throw.**

A redraw must complete in well under a second on a normal diagram.

---

## 6. Structure

Allowed root folders — git tracks only these plus the named root files, see `.gitignore`:

```
shabnam/
  src/            all TS, TSX, CSS, HTML
  svg/            shells. first file: box.svg
  icon/           borrowed logos
  theme/          the shipped theme: basic-theme.json
  test/           `test/browser/` is the CSSOM half, run in real Chrome
  docs/           documentation, project management, reports
  research-lab/   DOT fixtures the tests load, and design documents
  build/          build scripts / generated inputs to the bundler
  dist/           build output. never a source of truth
```

Inside `src/`, one package per stage of the design. A package is a subject expert; a file is a worker.

```
src/
  index.ts          mount the workbench into document.body (no #root)
  types.ts          all `type` data + all `interface` traits
  app.css           tokens + the chrome skeleton (core classes live in the theme)
  index.html        the one page
  assets.d.ts       ambient types for the bundler's asset imports

  dot/            the only DOT reader, and the only geometry source. pure.
    graphviz-ast.ts   GraphvizAst — one walk; the parsed tree escapes nowhere
    model.ts          the record → DiagramModel (markup resolved)
    styles.ts         the record → DotStyles (provenance kept)
    points.ts         the record → PointGraph (everything stripped)
    dagre-layout.ts   DagreLayout — contract, lay out, expand → Positions

  diagram/          Diagram facade + private workers. data in, data out. no DOM.
    diagram.ts        frame / clusters / shells / connectors
    layout-framer.ts  model + positions → #diagram-html
    node-shaper.ts    SHAPE_HTML registry
    node-sheller.ts   boxes + nodes → shell SVG
    edge-router.ts    boxes + edges → the ortho snake's waypoints
    edge-drawer.ts    waypoints → connector SVG, with curvable bends
    markdown.ts       the configured markdown-it instance, and label rendering

  stylist/          the book and the one live sheet. CSSOM only.
    stylist.ts        addRule / removeRule / reset / cleanup / rows / save / feed
    sheet.ts          CSSOM handle: insertRule, setProperty, expand, serialize
    rows.tsx          the styles tab

  workbench/        the page shell
    workbench.tsx     SolidJS shell: canvas + radio strip + one textarea
    tabs.tsx          four equal buttons
    engine.ts         redraw / inject / measure / place
    files.ts          DOT, export HTML, the picture snapshot
    export-dialog.tsx format, transparency, scale — in a native <dialog>
    keys.ts           KEY_COMMAND registry
    annotations.tsx   the annotation list and its rows tab
```

`stylist/` owns `rows.tsx` rather than `workbench/` because the rows *are* the rules; splitting the view from the data would put a fourth file in `workbench/`'s budget to no benefit. `node-shaper.ts` is a **registry, not a class** — a `Map` plus a lookup with a `box` fallback — and so are `SHELL_SVG` and `ATTR_CSS`, which live with the workers that consult them.

**Tests are two halves.** Pure logic under `bun test`; the live sheet, the repaint and the rows tab under headless Chrome (`bun run test:browser`), because bun has no CSSOM. No test runner dependency — Chrome's `--dump-dom` is the driver.

Root files that are law: `user-story.md`, `app-architecture.md`, `src/types.ts`, `coding-rules.md`, plus `AGENTS.md` / `CLAUDE.md` which route to them.

Never in this tree: a DOT parser, `input/`, `output/`, `local/`, `temp/`, `etc/`.

---

## 7. What we refuse

- **Writing** a tokenizer, a recursive statement parser, `parseAst`, or regex that reconstructs DOT grammar. Calling `@ts-graphviz/ast` is the opposite of this (§2).
- **Recovering a default by statistics.** No most-common-value tally, no absence-as-a-value, no lexicographic tie-break. The branch says where it was written.
- **A CSS parser, a CSS serializer on the paint path, or CSS algebra.** A rule is a map entry; CSSOM is the only thing that turns it into paint, and it is never asked to read a sheet back. The one-shot decomposition that produced `basic-theme.json` lives in `build/` and is not shipped.
- A CSS selector validator (§4.1)
- A second geometry source alongside the measured boxes
- A second layout engine, a second theme mechanism, a config object or a config tab
- A code editor, formatter-on-type, autocomplete, or syntax highlighting
- **A "what if"** — code for a state nobody has observed. If it cannot happen the types say so and the check is deleted; if it can and we choose not to serve it, this file says so and the code is deleted. See `coding-rules.md`.

---

## 8. Delayed on purpose

Each is a real position, not an oversight. The story tells these too; here they carry their tags.

| | |
|---|---|
| **S10** | Deleting a row is not an undo; Load DOT is the reset (§1.2) |
| **S11** | A style document has a writer and a tested reader, but no verb loads it |
| **V10** | The picture exports are verified by eye; a harness cost more than it caught |
| — | Annotations, labels, icons and edges carry classes and no values until a request says what the values should be (§3.2) |
