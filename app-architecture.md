# Shabnam — App Architecture

The decisions the story implies, stated so they can be checked. The story says
what and why (`user-story.md`); the types say the shapes (`src/types.ts`, and a
package's own `types.ts`); the craft is `coding-rules.md`. When this file and
the code disagree, this file wins until we change it together.

> The UI redesign is implemented; its reasons live in git history.

---

## 0. Stack

Bun (bundling and tests) · TypeScript · `@ts-graphviz/ast` ·
`@hpcc-js/wasm-graphviz` · `markdown-it` · HTML · CSS. **No UI framework**: the page is vanilla DOM and
`<template>`s.

**Layout is Graphviz `dot`, compiled to WebAssembly.** It replaced dagre, which
was purged because it **does not support `rank=same`**: a numeric `rank` is
ignored, `rank: "same"` crashes it, and a zero `minlen` throws. The workaround,
contracting each group to one stand-in, hid the members from crossing
minimisation, so they came out in first-mention order. example-2 had 6
crossings under dagre and 0 under `dot`; `test/dot-layout.test.ts` holds the 0.
What `dot` reads from 0×0 points was probed in a lab now in git history.
`ts-graphviz` could not replace it: its AST package only parses and prints, and
its adapter shells out to a `dot` binary, which a browser cannot run. The price
is about 630 KB gzipped, loaded once at boot.

Target is **Chromium**, and that is a ban on compatibility code, not a support
matrix: no polyfills, no fallbacks, no feature detection.

What stays forbidden is a library that changes the design: a second DOT reader,
a second layout engine, a UI framework, a CSS framework, a state manager.
Adding or removing anything here is a conversation that lands in this section
first.

---

## 1. Players and walls

| Player | Owns | Knows the DOM? |
|---|---|---|
| `Diagram` | the living state: dot, style book, notes, script; `draw()`, `place()` | writes the canvas sinks |
| `DotReader` | the only reader of DOT (walls `@ts-graphviz/ast`) | no |
| `GraphvizLayout` | the only source of geometry (walls `@hpcc-js/wasm-graphviz`) | no |
| `DiagramPainter` | model + ranks → HTML; measured boxes → SVG | no — returns strings |
| `Connectors` | placement → one path `d` per edge (`src/connectors/connectors-story.md`) | no — returns strings |
| `StyleBook` | the style rules and the one live CSSOM sheet | owns `#style-css` |
| `Workbench` | the page: pieces, bindings, verbs | owns the chrome |

`read/`, `layout/`, `paint/` and `connectors/` are pure: data in, data out, tested as plain
functions. Only `Diagram`, `StyleBook` and the `ui/` + `workbench/` packages
touch the page.

**We never write a parser.** Reading DOT as a string — a tokenizer, recursive
descent, regex over statements — is out of scope. The one grammar we own is the
record label split (`|` cells, `{}` flips the axis), and it reads the parsed
`label` field, never DOT text.

---

## 2. Draw

```
dot ─DotReader──┬─▶ model          who exists, connects, belongs — markup resolved
                ├─▶ styles         appearance, at the branch written — source 1
                └─▶ points         the parsed DOT, trimmed of size, printed
styles ─▶ styleBook.add(each)
points ─GraphvizLayout─▶ positions (x,y of 0×0 points) ─▶ ranks: NodeId[][]
model + ranks ─DiagramPainter─▶ #diagram-html
  [browser paints] ─▶ measure boxes ─Connectors.place─▶ placement
  placement ─Connectors─▶ d per edge
  boxes + d's ─DiagramPainter─▶ cluster, shell, connector SVG
notes ─▶ #annotation-html, placed;  script runs last
```

- **One parse, three answers.** The parse tree never leaves `DotReader`.
- **An attribute is markup or appearance.** `label`, `shape`, `icon`, `caption`,
  `shell`, `style` decide what we build and are resolved down onto nodes.
  Anything in the `ATTR_CSS` registry is appearance and stays at the branch it
  was written on — `node [fillcolor=coral]` inside `cluster_a` becomes one
  `.cluster_a.node, .cluster_a.record` rule. Anything else is dropped.
- **Derived styles never invent a value.** Every value traces to an attribute
  the author wrote; a bare DOT derives nothing and the theme speaks. The one
  correction: a bare number gains `px`.
- **Layout is given the author's own graph, trimmed to points.** After the walk,
  `DotReader` deletes every attribute in `SIZE` (labels, shape, width, height,
  font, margin, image…) wherever it sits, puts
  `node [shape=point width=0 height=0 label=""]` first, and prints the tree.
  `SIZE` is a deny-list on purpose: whatever `dot` reads — `rank=max`,
  `weight`, `minlen`, clusters, invisible edges, declaration order — reaches it
  untouched because we never took it out. Setting points without trimming is
  not enough: a node's own `shape=record` beats the default.
- **Ranks come from coordinates, exactly.** 0×0 points of one rank share one
  coordinate on the rank axis; order is the sort along the other. The x/y are
  never painted.
- **Measured geometry is the only size.** Neither model nor positions carry a
  width. Measuring is once per draw, not live: a reflow without a draw leaves the
  SVG where it was measured.
- **The one `try` / `catch`** wraps the parse. A bad parse `alert`s the parser's
  message and leaves the last good picture.

---

## 3. Identity

**Identity in CSS is identity in DOT.** Every id and every class but a handful
comes from the DOT, and that handful is closed.

**From the DOT**

| DOT | Becomes | On |
|---|---|---|
| node `lake` | `#lake` | the node's box |
| edge `lake -> runtime` | `#lake_runtime` | the edge's path |
| named subgraph `gcp`, `cluster_a` | `.gcp`, `.cluster_a` | every member node, and every edge written inside it |
| cluster `cluster_a` | `#cluster_a` | the cluster's box |
| `style="invis,filled"` | `.invis .filled` | the element written on |
| `shape=cylinder` | `data-shape="cylinder"` | the node's box |

A space becomes `_`, and that is the whole sanitizer. No prefix, no `cluster_`
stripping. Parallel edges share one id. An unnamed subgraph gives nothing: it is
there for `dot`, not for styling, so it is no scope and its statements belong to
the one around it. A subgraph worth styling is worth a name.

**Added by the app, at most one per group**

| Group | Classes | On |
|---|---|---|
| kind | `.node` · `.record` · `.edge` | node box · record box · edge path |
| membership | `.cluster` · `.subgraph` | in any cluster → `.cluster`; only in named non-cluster subgraphs → `.subgraph` |
| cluster box | `.cluster_` | the cluster's box |
| parts | `.rank` · `.label` · `.icon` · `.shell` · `.arrow` | rank row · label text · icon · SVG outline · arrowhead marker |

Nothing else is invented. A `.cluster` is a subgraph; it never also wears
`.subgraph`. Record fields carry no class: the markup is the selector —
`.record > span` a top-level field, `.record span` any field, `.record div` a
flipped group, `:nth-child()` a position. A record port (`<f0>`) gives nothing.

**Every id the app owns is two hyphenated words** (`#diagram-canvas`), because
node ids are bare DOT names and share the namespace. Selectors about diagram
content never reach through a sink id.

---

## 4. The canvas

```html
<article id="diagram-canvas">
  <div id="diagram-html"></div>      <!-- ranks + nodes. no inline appearance -->
  <svg id="diagram-svg">
    <g id="cluster-shells"></g>
    <g id="node-shells"></g>
    <g id="connector-paths"></g>
  </svg>
  <div id="annotation-html"></div>
  <style id="style-css"></style>     <!-- the StyleBook's sheet. never textContent -->
  <script id="action-js"></script>
</article>
```

Child order is load-bearing: SVG paints over HTML, so shells are stroke-only
chrome around the measured div, and the div owns background, border and label.

**Connectors** are one class, `src/connectors/connectors.ts`; the story is
`src/connectors/connectors-story.md`. It began as a DOM lab page and keeps
that page's names (`meet`, `stab`, `choose`, `place`, `rounded`, …).
`Diagram` measures the painted nodes and calls `new Connectors(rules)
.route(ranks, boxes, edges)`, which returns one path `d` per edge; the painter
draws them. Connectors never touch the DOM. The rank axis is read from the
boxes, never from `rankdir`. The rules are numbers, each a token on
`#diagram-canvas, svg` (§5): `--gap`, `--node-clearance`, `--connector-inset`,
`--connector-lane`, `--connector-radius`; `Diagram` reads them, `em` included.

- **Ports are points while choosing.** Directional ports are the centre of the
  face; the first and last node of a rank add their open side (three points
  in LR, one in TD), running out as far as needed, never closer than
  `--node-clearance`. Fewer bends, then directional, then shorter.
- **A shared bend is free.** Edges are chosen in DOT order; a corner an earlier
  edge already makes costs the next nothing. So DOT edge order can change the
  picture.
- **Polish may leave the point.** After the pick, a directional end gets its
  whole side back to slide along and avoid a lane.
- **Invisible is not there.** `Diagram` leaves out a node that does not paint
  (`.invis`, 0×0) and every edge that touches one, before routing.
- **No fallback.** With no clear port pair, `choose` throws.

**The arrow is SVG's default marker.** One `<marker class="arrow">`, with no
`markerUnits` / `markerWidth` / `markerHeight` of our own, so it is sized in
the edge's stroke width and grows with `.edge { stroke-width }`, per edge. The
theme styles its content: `fill` for colour, `transform: scale()` on
`.arrow path` for a size other than the default. One marker serves every edge,
so it has one colour.

**Notes** are ordered rows; the mark is derived and never read back.
`data-selector` is a real selector run with `querySelectorAll`; the centre of
everything it matches is published as `--anchor-x` / `--anchor-y`, and the
theme positions the mark with `calc(var(--anchor-x) + var(--dx, 0px))`. That
positioning rule lives in the theme, not `app.css`, so it travels with exports.

Labels and notes are markdown through one configured `markdown-it`: inline for
labels, block for notes. `\n` is a line break in both. Images resolve to inline
data URIs through markdown-it's own image rule.

---

## 5. The style book

- A style is `selector · property · value · source` (0 theme, 1 DOT, 2 user).
  One entry per selector + property.
- **`styleBook.add(style)` is the only way in.** It asks CSSOM first and returns
  `false` for a refused value, which never enters the book. It refuses a lower
  source over a higher one; equal or higher overwrites, destructively.
- The sheet is driven through CSSOM only — `insertRule`, `setProperty`,
  `removeProperty`. The only CSS text is `serialize()`, for export.
- **`@apply`, minimal.** Its value is one or more class selectors separated by
  spaces: `.card { @apply: .paper .row }`. The book keeps it as written; feeding
  CSSOM expands it in place, so the selector's own later properties win, and a
  mixin may apply another. **It may only name a selector the book already
  has** — sources arrive in order (theme, DOT, user) and the theme lists its
  mixins first. **It may nest at most 3 deep** (`.node → .brand → .paper →
  .glass`); deeper is refused, and so is a loop, which nests forever. The
  check is a trial expansion inside `admits`, before anything is stored.
  Naming an unknown selector is refused like an invalid value: `add` returns
  `false`. Changing a mixin re-feeds everything that applies it. Chromium has no
  native mixins yet; when it does, only the feed changes.
- **Mixins never reach CSSOM.** A selector that something applies is expanded
  where used and never fed to the sheet alone. The chrome can then use the same
  four classes (`.row .col .paper .glass`) safely.
- Tokens sit on `#diagram-canvas, svg`, never `:root`, so they resolve in both
  layers and in an exported file. A root graph attribute styles
  `#diagram-canvas`.
- A draw re-adds the DOT's styles at source 1 and never flushes; opening a DOT
  makes a new `Diagram` with a new book seeded from the theme. That is the reset.

One theme ships: `theme/basic-theme.json`. **Save** writes a project,
`{ theme, dot, "user-styles" }`: the theme by name, the DOT as text, and the
user's source-2 rules only. **Open** reads a project back; **Load DOT** reads a
bare DOT over the theme alone. An export carries the whole book.

---

## 6. The page

`index.html` is the skeleton: `main` (toolbar, canvas, pin) beside `aside` (tab
strip, four tab sections), plus the export `<dialog>` and one `<template>` per
repeated part. Code fills what repeats; it never builds the frame.

| Piece | Native core | Used for |
|---|---|---|
| `Radios<K>` | `label > input[type=radio]` | tabs, export format |
| `Checks<K>` | `label > input[type=checkbox]` | style filter, transparency, pin |
| `RowList<R>` | `.row`s of inputs; a `Map` of row kinds | style rows, note rows |
| `DialogAsk<A>` | `<dialog>`, answered by `await` | export |
| `Topic<T>` | — a typed value: `value`, `pub`, `sub` | shared state |

Toolbar, textareas and canvas are plain HTML with one listener each.

**How they talk — one mechanism per situation:**

| Situation | Mechanism |
|---|---|
| owner tells a piece what to show | method call |
| the user touched a piece | native event, bubbling; a custom event only when native says too little |
| two parts share a fact | a `Topic` |
| waiting for an answer | `await` |
| a verb | `COMMANDS: Map<Command, () => void>`, shared by toolbar and chords |

Rules:

- A topic holds a fact, never a verb. Topics: `diagram.dot`, `diagram.notes`,
  `diagram.script`, `view.tab`, `view.pinned`, `view.shown`. The style book
  publishes nothing: the styles tab re-reads it (below).
- A subscriber that throws, throws. Nothing is unmounted — tabs flip `hidden` —
  so there is no `unsub`.
- **Nothing draws while you type.** Text panes publish on `input`, but only
  `draw()` reads them. Rows commit on `change`. Draw has one trigger, the verb,
  so two draws never interleave.
- A style row commits with `styleBook.add`; `false` marks the row `.invalid`.
  The styles list is `column-reverse` with one blank row on top; the notes list
  reads top-down.
- **`RowList.render` patches in place.** Rows are reused by position and only
  added or trimmed at the end, so committing one box never takes the caret out
  of the next. A row wears its key as `data-selector` / `data-property`; there
  is no row id.
- **The styles list is the tab's own between re-reads.** It re-reads the book
  when the tab is shown, after a draw, and on Open. Until then a refused row
  keeps its text and its `.invalid` while the book keeps the last good value.
  ❌ removes the style from the book and the row from the list at once.
- The notes list is the model and is published whole, a half-typed row and the
  waiting blank included; `placed` (selector and text both set) is what gates a
  mark.
- Open makes a new `Diagram` and the workbench *adopts* it: the textareas are
  set once, the note tab follows its `notes`, the style tab reads its book.
- Keys: `Cmd+Enter` draw · `Cmd+O` / `Cmd+S` open / save project · `Cmd+L` load DOT · `Cmd+P` / `Cmd+E`
  export picture / HTML · `Cmd+1…4` tabs. The browser-claimed ones are
  `preventDefault`ed.

**CSS.** `app.css` is chrome only: tokens on `body`, the skeleton by element
and position, the surfaces `.row .col .paper .glass`, then one block per piece
(`.radios`, `.checks`, `.rows`, `.rows.notes`, `.invalid`). A chosen radio
sinks (`inset --flat-shadow`); a checked check rises and glows. `:has(:checked)`
is the state — there is no `.active`. A chrome hook exists for layout, a sink,
or a tested state, never decoration.

---

## 7. Export

A wrapper, not a translation. **SVG** is the canvas cloned into a
`<foreignObject>`, sized by the canvas's scroll size, with the book's
`serialize()` inlined inside `<![CDATA[…]]>`. `app.css` is never inlined.
**PNG** is that SVG through `Image` → `<canvas>` → `toBlob` at 3×.
**Transparency** is one appended rule, `#diagram-canvas { background:
transparent }`. **Export HTML** writes a standalone page carrying the
skeleton, the book and the document as data; the skeleton is `body`'s
non-script children as `index.html` wrote them, captured before any piece
filled them, so the exported page boots the same app over the same frame.
Everything a file needs travels inside it: icons as data URIs, no remote
references. The layout's wasm is inlined in the app bundle, so an exported
page lays out offline; the price is about 1.6 MB per exported HTML.

---

## 8. Structure

```
src/
  index.html   skeleton + templates        index.ts   new Workbench(document.body)
  app.css      chrome only                 types.ts   the story's types
  diagram/     Diagram, files (export), notes (the marks)
  read/        DotReader, model, styles, points
  layout/      GraphvizLayout
  paint/       DiagramPainter, framer, shaper, sheller, drawer, markdown
  connectors/  Connectors — one class, one file
  style/       StyleBook, sheet
  ui/          topic, radios, checks, row-list, dialog-ask
  workbench/   workbench, commands, style-tab, note-tab, export-dialog
svg/  icon/  theme/  test/  build/  docs/  research-lab/  dist/
```

Imports point one way: `workbench → ui, diagram` · `diagram → read, layout,
paint, connectors, style` · `connectors → types` only · `ui → types`. A `ui/` piece never imports the diagram.
Registries (`SHAPE_HTML`, `SHELL_SVG`, `ATTR_CSS`, `ROW_KINDS`, `COMMANDS`) live
with the code that consults them.

Tests are two halves: pure under `bun test`, CSSOM and DOM under
`bun run test:browser` in headless Chrome. The browser harness serves the real
`src/index.html` with its error collector and the checks spliced in around the
app's script, so the checks drive the skeleton the user gets.

---

## 9. Refused, and delayed

**Refused:** writing a DOT parser; recovering defaults by statistics; a CSS
parser or CSS text on the paint path; a CSS selector validator (a finished typo
throws from `insertRule`, and that is preferred); a second geometry source; a
config tab; a code editor; any "what if".

**Delayed on purpose:**

- Deleting a row is not an undo; opening the DOT again is the reset.
- A saved style document has a writer and a reader, but no verb loads it.
- Picture exports are verified by eye.
- `.icon`, cluster labels and edges carry classes but no theme values until a
  request says what they should be.
- A `ResizeObserver` to re-measure on reflow would be the first reactive
  machinery; not until it is needed, and it would need a guard against
  overlapping draws.
- Edges may cross captions: fixing it needs a third SVG group.
