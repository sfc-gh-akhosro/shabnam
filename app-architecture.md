# Shabnam — App Architecture

The decisions the story implies, stated so they can be checked. The story says
what and why (`user-story.md`); the types say the shapes (`src/types.ts`, and a
package's own `types.ts`); the craft is `coding-rules.md`. When this file and
the code disagree, this file wins until we change it together.

> **Migration in progress.** This describes the redesign approved in
> `research-lab/ui-redesign/design-story.md`. The code reaches it through the
> sessions in `current-task.md`; until then `src/` still has the old package
> names `dot/` and `diagram/` and a SolidJS workbench. `style/` (`StyleBook`)
> and `ui/topic.ts` have landed.

---

## 0. Stack

Bun (bundling and tests) · TypeScript · `@ts-graphviz/ast` · `@dagrejs/dagre` ·
`markdown-it` · HTML · CSS. **No UI framework**: the page is vanilla DOM and
`<template>`s.

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
| `DagreLayout` | the only source of geometry (walls dagre) | no |
| `DiagramPainter` | model + positions → HTML; measured boxes → SVG | no — returns strings |
| `StyleBook` | the style rules and the one live CSSOM sheet | owns `#style-css` |
| `Workbench` | the page: pieces, bindings, verbs | owns the chrome |

`read/`, `layout/` and `paint/` are pure: data in, data out, tested as plain
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
                └─▶ bare graph     sizeless points and arrows
styles ─▶ styleBook.add(each)
bare graph ─DagreLayout─▶ positions: integer rank, integer order, rough x/y
model + positions ─DiagramPainter─▶ #diagram-html
  [browser paints] ─▶ measure boxes ─DiagramPainter─▶ cluster, shell, connector SVG
notes ─▶ #annotation-html, placed;  script runs last
```

- **One walk, three answers.** The parse tree never leaves `DotReader`.
- **An attribute is markup or appearance.** `label`, `shape`, `icon`, `caption`,
  `shell`, `style` decide what we build and are resolved down onto nodes.
  Anything in the `ATTR_CSS` registry is appearance and stays at the branch it
  was written on — `node [fillcolor=coral]` inside `cluster_a` becomes one
  `.cluster_a.node, .cluster_a.record` rule. Anything else is dropped.
- **Derived styles never invent a value.** Every value traces to an attribute
  the author wrote; a bare DOT derives nothing and the theme speaks. The one
  correction: a bare number gains `px`.
- **`rank=same`** is the one thing dagre cannot say: `DagreLayout` contracts each
  group to one stand-in node, lays out, and expands.
- **Measured geometry is the only size.** Neither model nor positions carry a
  width. Measuring is once per draw, not live: a reflow without a draw leaves the
  SVG where it was measured.
- **The one `try` / `catch`** wraps the parse. A bad parse `alert`s the parser's
  message and leaves the last good picture.

---

## 3. Identity

**Identity in CSS is identity in DOT.**

| DOT | CSS |
|---|---|
| node `lake` | `#lake` |
| edge `lake -> runtime` | `#lake_runtime` (`_2`, `_3` for parallels) |
| `subgraph cluster_source` | `.cluster_source` on every member |
| anonymous subgraph | `.subgraph_1`, `.subgraph_2` by order |
| `style="invis,filled"` | classes `invis filled` |

A space becomes `_`, and that is the whole sanitizer. No prefix, no `cluster_`
stripping.

**Every id the app owns is two hyphenated words** (`#diagram-canvas`), because
node ids are bare DOT names and share the namespace. Selectors about diagram
content never reach through a sink id.

Invented classes are few: `rank`, `node`, `record`, `shell`, `edge`, `arrow`,
`cluster_`, `cell`, `label`, `icon`, and a record cell's path (`._2_1`). An
element carries one invented class; further classes are DOT names. Other shapes
name themselves in `data-shape`.

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

**Connectors** are an ortho snake along the rank gutters and row gaps,
preferring fewest turns, then shortest. Clearance is a preference with a floor:
try with clearance, then touching, then a plain dog-leg. An edge always draws.
Bends round by one radius, clamped to half the shorter segment. Same-rank pairs
attach top/bottom, decided by measured overlap.

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
  mixins first — so a load in order writes no cycle and there is no cycle check.
  **Open:** a later edit can still close one (`.b` applies `.a`, then `.a`
  applies `.b`); the expansion then overflows the stack and every paint
  throws until the next Open. Unfixed until we choose a rule (`current-task.md`).
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

One theme ships: `theme/basic-theme.json`. **Save styles** writes
`{ theme, style }` with the user's source-2 rules only. An export carries the
whole book.

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
  `diagram.script`, `styleBook.changed`, `view.tab`, `view.pinned`,
  `view.shown`.
- A subscriber that throws, throws. Nothing is unmounted — tabs flip `hidden` —
  so there is no `unsub`.
- **Nothing draws while you type.** Text panes publish on `input`, but only
  `draw()` reads them. Rows commit on `change`. Draw has one trigger, the verb,
  so two draws never interleave.
- A style row commits with `styleBook.add`; `false` marks the row `.invalid`.
  The styles list is `column-reverse` with one blank row on top; the notes list
  reads top-down.
- Keys: `Cmd+Enter` draw · `Cmd+O` / `Cmd+S` open / save DOT · `Cmd+P` / `Cmd+E`
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
transparent }`. **Export HTML** writes a standalone page carrying the book and
the document as data. Everything a file needs travels inside it: icons as data
URIs, no remote references.

---

## 8. Structure

```
src/
  index.html   skeleton + templates        index.ts   new Workbench(document.body)
  app.css      chrome only                 types.ts   the story's types
  diagram/     Diagram, files (open, save, export)
  read/        DotReader, model, styles, graph
  layout/      DagreLayout
  paint/       DiagramPainter, framer, shaper, sheller, router, drawer, markdown
  style/       StyleBook, sheet
  ui/          topic, radios, checks, row-list, dialog-ask
  workbench/   workbench, commands, style-tab, note-tab, export-dialog
svg/  icon/  theme/  test/  build/  docs/  research-lab/  dist/
```

Imports point one way: `workbench → ui, diagram` · `diagram → read, layout,
paint, style` · `ui → types`. A `ui/` piece never imports the diagram.
Registries (`SHAPE_HTML`, `SHELL_SVG`, `ATTR_CSS`, `ROW_KINDS`, `COMMANDS`) live
with the code that consults them.

Tests are two halves: pure under `bun test`, CSSOM and DOM under
`bun run test:browser` in headless Chrome.

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
