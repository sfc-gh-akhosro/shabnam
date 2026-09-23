# Shabnam

Read `AGENTS.md`, then `app-architecture.md`, then `coding-rules.md` before
touching anything. Where this file disagrees with the architecture, the
architecture wins.

---

# The story

## What it feels like to use

You open one page. On the left, a picture of a diagram. On the right, a small
stack of tabs. You type in the first tab, in DOT — the same language you would
use for any architecture diagram, `a -> b`, a `subgraph cluster_source`, a label.
You press Redraw. The picture appears.

That much is Graphviz's job, and Shabnam does not compete with it. What happens
next is the whole point. The diagram on screen is not an image. It is HTML boxes
and an SVG layer drawn on top, and **every part of it is addressable by the names
you already wrote**. The node you called `lake` is `#lake`. The subgraph you
called `cluster_source` is `.cluster_source` on each of its members. There is no
second vocabulary to learn and nothing to look up: if you can read your DOT, you
can style your diagram.

So you move to the **styles** tab. It is not a text editor; it is a list of rows.
Each row is three things — a selector, a property, a value — and that is all a
style rule has ever been. You pick `.node` from the selector box, `background`
from the property box, and a colour from the swatch. The picture changes as you
type. No Redraw, no flicker, no waiting: the row you edited became one
`setProperty` call on a live stylesheet, and the browser repainted the one thing
that changed.

The rows you see are not all yours. The list opens with the rows that came from
the **theme**, then the rows Shabnam **derived** from your DOT — if you wrote
`fillcolor=lightblue`, that is sitting there as a row you can read — and then
your own. Editing a theme row or a derived row does not damage either: it writes
a row of your own that shadows it. Your file only ever holds your rows, which is
why a redraw can throw away everything it derived last time and rebuild it
without touching a thing you typed.

Two more tabs: `annotation.html`, for the one kind of label DOT cannot express —
a note parked at a coordinate — and `action.js`, which runs last, for when you
want the picture to do something. Then you export. You get one HTML file that
paints the same diagram on a machine that has never heard of Shabnam.

## How it is built

The pipeline is short and each stage has exactly one owner.

**Graphviz reads the DOT, and nothing else does.** `Vizer.render` calls
`renderJSON` and hands back one JSON blob. That is the only DOT consumer in the
codebase — no tokenizer, no AST, no regex over statements. When DOT is malformed
mid-keystroke, one `try` / `catch` — the only one in the app — shows the message
and leaves the last good picture standing.

**`Diagram.bag` reads that JSON, and nothing else does.** It produces a
`DiagramModel`: nodes, edges, clusters, `rankdir`, with positions already turned
into numbers. Graphviz's peculiar shape is quarantined in one file. This is also
where identity is decided once for everybody — ids sanitized, subgraph names
turned into classes, a collision made loud instead of silent.

From the model, three workers build the picture, and they are all pure functions:
data in, data out, no DOM.

- `Diagram.frame` lays nodes into ranks and emits the HTML layer. It carries
  **zero inline styles** — just ids and classes, so it is measurable and stylable.
- `Diagram.derived` walks the model and returns `StyleRules` — the rules implied
  by your DOT attributes. It never invents a colour: every value traces back to
  something you wrote or a `:root` token.
- Once the browser has painted, `Workbench.measure` reads the **real** geometry,
  and `clusters` / `shells` / `connectors` draw the SVG layer around those
  measured boxes. Graphviz's own pixel sizes and paths are never used. This is why
  an edge keeps touching its boxes after you change a font or a gap.

**The `Stylist` owns style, and it owns one stylesheet.** It holds three layers —
theme, derived, user — and merges them per property, later winning. Then it feeds
them to CSSOM: one `CSSStyleRule` per selector, each property a `setProperty`.
There is no CSS text on this path. Nothing builds a string to paint with, and
nothing parses a sheet back to find out what is in it, because the map already
knows. `@apply` survives as a property whose value names other selectors, and it
is resolved at the moment of feeding, against the live map.

The one place a rule becomes text again is `Stylist.serialize()`, and only Export
HTML and Save PNG call it.

## The interfaces worth knowing

Seven of them, in `src/types.ts`. `interface` means methods; `type` means data.

```ts
interface Vizer   { render(dot) }                        // the only DOT reader
interface Diagram { bag, frame, derived, clusters, shells, connectors }
interface Stylist { addRule, removeRule, setDerived, cleanup, rows, save, serialize }
interface Workbench { redraw, inject, measure, place }   // the DOM owner
interface Files   { loadDot, saveDot, exportHtml, exportPng }
```

And the one data shape everything style-related agrees on:

```ts
type StyleRules = Map<string, Map<string, string>>   // selector → property → value
```

A rule is a map entry. The file on disk is the same thing as a nested object. The
row in the tab is the same thing with an origin tag. There is one representation,
which is the reason this design is smaller than the one it replaced.

## What we refuse, and why it keeps mattering

No DOT parser — Graphviz already is one. No CSS parser and no CSS algebra — CSSOM
already is one, and a rule that stays data never needs to be re-read. No second
layout engine, no config tab, no IDE. CodeJar is the tab window for the three text
tabs; it holds the caret and highlights, and it is not allowed to grow into an
editor.

Every one of those refusals has been tried in some form and written down in
`docs/archive.md` with the reason it lost. Read that before reopening one.

---

# Current task

**The Stylist rewrite.** Style stops being text. The `theme.css` and `style.css`
tabs collapse into one rows-based **styles** tab backed by a `Stylist` that talks
to CSSOM directly. `Css.plus` / `Css.minus`, the theme catalog, the locked base,
the overlay, and every CSS-string hop are deleted.

**One session per step. Stop after each for review.** Each step leaves the tree
compiling and `bun test` green. Architecture wins if this plan drifts. Update the
step when a session finishes, and move it to `docs/archive.md` when it is done.

## The decisions this plan rests on

Settled with the user before session 1. Do not improvise a different answer.

| | Decision |
|---|---|
| On disk | Nested object: `{ selector: { property: value } }`. Two files: `theme/basic-theme.json`, `user-style.json`. |
| `@apply` | Stays a **property** in the data and the JSON. Resolved only at feed time, against the merged map. |
| Derived | `Css.plus` / `minus` / `lastDerived` deleted. `CssBagger` returns `StyleRules`. |
| Theme | `basic-theme.json` only. No dropdown, no locked base, no overlay, no theme file verbs. |
| `cssom_id` | **Not stored.** `deleteRule` renumbers, so an index is stale on first removal. One `CSSStyleRule` per selector; a property is `setProperty` / `removeProperty`. The handle is runtime-only. |
| Layer order | theme ← derived ← user, per property, later wins. |
| Editing a theme or derived row | Writes a user row that shadows it. |

## Session 1 — the law learns about the Stylist — **done**

**Goal.** Amend the reference docs before any code moves, so the code has
something to be measured against.

**Did.** `app-architecture.md` §1 (canvas loses `#shabnam-theme-css`, gains the
three layers and the feed-time `@apply` rule), §2, §3 (`stylist/` replaces `css/`;
the CSSOM exception is now a live on-document sheet, deliberately), §3.2
(`CssBagger` returns `StyleRules`; **selectors composed flat**, `&` gone with the
text), §3.5 (we refuse a CSS parser and CSS algebra), §4 (four tabs, no merge
buffer, one shipped theme), §5 (redraw, plus the short path for a row edit), §6,
§7 (the log rewritten — roughly a dozen rows), §8 (tree: `stylist/` with
`stylist.ts` / `sheet.ts` / `rows.tsx`), §10 (`StyleRules`, `StyleFile`,
`StyleRow`, `Stylist`; `Css` gone; `TabId` down to four).
`coding-rules.md`: the Css-algebra line is replaced by "style is data".
Session C was archived on the way past — it had never been moved.

**Handoff.** The law now describes the app we are about to build, and nothing in
`src/` matches it yet. That is expected and is the whole point of doing this
first. Next is session 2.

**Note.** `README.md` still says five tabs and `Css.plus`. It documents the code,
which has not moved, so it is deliberately left stale until session 7.

## Session 2 — the types — **done**

**Goal.** `src/types.ts` says what §10 now says.

**Did.** `StyleRules`, `StyleFile`, `StyleOrigin`, `StyleRow`, and the seven-method
`Stylist` interface added. `Css` removed. `Diagram.derived` now returns
`StyleRules`. `Files` lost `listThemes` / `loadTheme` / `saveTheme`. `TabId` is
`"dot" | "styles" | "annotation" | "action"`; `TabText` is `Record<"dot" |
"annotation" | "action", string>` — keyed off `TabId` on purpose, because the
styles tab is not text — and `SetTab` takes `keyof TabText`. No new exported name
was invented for the text-tab union; it is inline in `TabText`.

**Nothing was stubbed.** Stubbing to green would have meant deleting the theme and
style tabs, `Css`, and the theme catalog — that is sessions 4, 6, and 7, and doing
it here would leave the app unable to style anything for three sessions with no
replacement. So the break stands, exactly where the plan expected it.

**The break: 18 `tsc` errors, 6 files.** `bun test` is still 51 pass / 2 skip —
bun does not typecheck, so the tests are honest but blind.

| File | Errors | Whose session |
|---|---|---|
| `src/css/css.ts` | `implements T.Css` gone | 4 (file deleted) |
| `src/diagram/diagram.ts` | `derived` returns `string` | 5 |
| `src/workbench/engine.ts` | reads `text.style` / `text.theme`, `setTab("style", …)` | 6 |
| `src/workbench/files.ts` | `setTab("style", …)`, `appliedSheet(… , T.Css)` | 6 |
| `src/workbench/tabs.tsx` | `"theme"` / `"style"` tab ids | 7 |
| `src/workbench/workbench.tsx` | starter text + seed keys, theme bar, `text[tab]` for `"styles"` | 7 |
| `test/ui-integration.test.ts` | seed literal has `theme` | 8 |

**Handoff.** Nothing else is required before session 3, which touches only
`build/` and `theme/` and so is unaffected by the break. The tree does not compile
again until session 7 lands.

## Session 3 — decompose basic.css, once

**Goal.** `theme/basic-theme.json` exists and is committed.

Write `build/decompose-theme.ts`. It reads `theme/basic.css` and writes the nested
JSON. Two sub-steps, in this order, because they have to be:

1. Lift `@apply` declarations out with a small text pass, recording each as an
   `@apply` property. CSSOM would silently drop them, so this cannot be skipped.
2. Hand the remainder to CSSOM and read `selectorText` plus each declaration.

Keep `:root, svg` as one key — the SVG layer needs those tokens (§3.2). Keep the
mixin rules (`.paper`, `.glass`, `.row`, `.col`, `.raised`): they are map keys
nothing puts on an element, and `@apply` resolves against them at feed time.

Run it once by hand. It is **not** wired into `bun run build` — the runtime never
parses CSS. `theme/basic.css` stays in the repo as the readable source of the JSON.

**Done when.** The JSON round-trips to the same declarations the browser computes
from `basic.css` today, and `git status` shows it tracked.

## Session 4 — the Stylist

**Goal.** `src/stylist/` exists; `src/css/` is gone.

`stylist.ts` is the class: the three layers, the merge, and the seven methods of
§10. `sheet.ts` is the CSSOM side — attach to `#shabnam-style-css`, `insertRule`
per selector, `setProperty` / `removeProperty` per property, `@apply` resolved in
place so the selector's own later properties win, plus `serialize()` for export.
An undefined `@apply` name throws. A cycle throws.

Delete `src/css/css.ts` and `src/css/expander.ts`. The regex expander does not
move — the map-based resolution replaces it outright.

**Watch.** The sheet is live and on-document, which is a deliberate change from
the old off-document `new CSSStyleSheet()`. A `<style>` element has no `.sheet`
until it is in the document, so attach on mount, not in the constructor.

**Done when.** A hand-built `StyleRules` paints a page, `@apply` resolves, and a
`removeRule` un-paints without disturbing its neighbours.

## Session 5 — CssBagger returns a map

**Goal.** `Diagram.derived(model): StyleRules`.

Drop `rules()`, `pad()`, and every string join in `css-bagger.ts`. The cluster
recursion **composes** its selector (`.cluster_x.node, .cluster_x.record`,
nested as `.cluster_x.inner.node`) instead of emitting `&`. `preamble()` becomes
a `:root, svg` entry — note it is `:root` alone today, which is a latent bug for
SVG tokens that this session fixes on the way past.

**Watch.** This is where a visual regression will hide. Determinism still matters:
identical input, identical map, same insertion order.

**Done when.** The starter diagram and `research-lab/example-1.dot` produce the
same picture as before, checked side by side in a browser.

## Session 6 — strip the old plumbing

**Goal.** Nothing left that moves CSS as text.

Delete `Css` use, `lastDerived`, `discardDerived`, `themeSheet`, `appliedSheet`,
`BASE_THEME`, `BASE_THEME_NAME`, `src/workbench/theme-catalog.ts`,
`build/theme-catalog.ts`, and `listThemes` / `loadTheme` / `saveTheme`. Redraw
becomes bag → `setDerived` → `feed` → frame → measure → SVG. `exportPng` and
`exportHtml` take `stylist.serialize()` where they read `textContent`; the export
seed carries the styles JSON.

**Watch.** `inject("style-css", …)` must go. It writes `textContent`, which would
wipe every rule the Stylist inserted.

**Done when.** No file imports `css/`, and export still paints standalone.

## Session 7 — four tabs and the rows UI

**Goal.** The tab you actually use.

`src/stylist/rows.tsx` is the rows table, ported from the prototype in
`research-lab/stylist/index.html` — native `input list=` for selector and
property so a compound selector like `.rank .node` can be typed, a value input
whose `type` follows the property, `×` to remove, `+` to insert. Rows are grouped
by origin. `tabs.tsx` drops to four; `keys.ts` loses `load-theme`, `save-theme`,
`tab-5`; the theme `<select>`, the theme file picker, and `highlightCss` come out.

Sync `README.md` in this session — by now the code has actually moved.

**Done when.** Add a row and the picture changes with no Redraw. Remove it and it
reverts. Cleanup drops emptied selectors. Save writes `user-style.json` holding
user rows only.

## Session 8 — the tests

**Goal.** Tests assert the map, not the text.

`test/base-css.test.ts` and `test/css-expander.test.ts` currently assert CSS
substrings, so they are rewritten rather than patched: map entries for the bagger,
map-based `@apply` for the expansion. Check `test/ui-integration.test.ts` for the
`Css` and `appliedSheet` imports it will have lost.

Debt S2 in `docs/technical-debts.md` says `Css.plus` / `minus` cannot be tested
under `bun` for want of CSSOM. The same limit applies to the feed, so keep the
split: the map merge is testable headless, the feed is browser-only. Close S2 as
superseded and record why in the archive.

**Done when.** `bun test && bun run build` green, and the closing ceremony runs.
