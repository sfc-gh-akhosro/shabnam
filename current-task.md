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

## Session 3 — decompose basic.css, once — **done**

**Goal.** `theme/basic-theme.json` exists and is committed.

**Did.** `build/decompose-theme.ts`, run once by hand, not wired into
`bun run build`. `theme/basic-theme.json` is tracked: 13 selectors, `:root, svg`
one key, the five mixins kept, `@apply` first property in each rule that has one.

**Two things the plan did not foresee.**

1. **CSSOM only exists in a browser** — `bun -e` has no `CSSStyleSheet`, the same
   limit debt S2 records. So the script serves a one-page harness on `:3100`; the
   page reads its own `<style>` back and `POST`s the result, and the script writes
   the JSON and stops. One hand-run, still no CSS parser in the repo.
2. **Do not enumerate `rule.style`.** Enumeration yields longhands, and a
   shorthand holding `var()` or `color-mix()` leaves every longhand empty — the
   first run produced `"background-color": ""` for `.paper` and `"row-gap": ""`
   for `.diagram`, silently losing the values. The script reports
   `rule.style.cssText` instead and splits that: browser-normalized output, one
   `;` per declaration, property before the first `:`.

**The `@apply` lift** is a text pass that rewrites `@apply .row .glass;` to a
custom property `--shabnam-apply`, which CSSOM keeps verbatim and in place; the
name is turned back into `@apply` when the JSON is written. That was simpler than
tracking rule boundaries in text, and it preserves order for free.

**Normalization to expect.** Values are CSSOM's serialization, not the source
text: `flex-direction: row; flex-wrap: nowrap` came back as `flex-flow: row`, and
`flex: 1` as `flex: 1 1 0%`. Equivalent, not identical — worth knowing when
session 5 compares pictures side by side.

**Handoff.** `bun test` 51 pass / 2 skip, unchanged. The 18 `tsc` errors from
session 2 still stand, as planned — this session touched only `build/` and
`theme/`. Next is session 4, the Stylist, which consumes this JSON.

## Session 4 — the Stylist — **done**

**Goal.** `src/stylist/` exists; `src/css/` is gone.

**Did.** `src/stylist/stylist.ts` — the class: three layers, `merged()`, and the
seven interface methods. `src/stylist/sheet.ts` — `resolve` / `serialize` /
`applyBound` as pure functions, plus a `Sheet` class holding the CSSOM side.
`src/css/` deleted, both files.

**Three calls the plan left open.**

1. **`feed()` is public on the class, not on the interface.** §8 lists `feed`
   among the Stylist's methods and §5 has the conductor calling it, but §10 caps
   the interface at seven and `feed` is not one of them. Public method, documented
   as the conductor's; the interface is untouched.
2. **No `attach()`.** An eighth verb for mount was avoidable: `Sheet` looks
   `#shabnam-style-css` up on first use, which is necessarily after mount, and
   throws if `.sheet` is null. The gotcha the memory file records is handled in
   one place instead of a method on the surface.
3. **`resolve` / `serialize` are pure and exported, and `Sheet` is thin.** That is
   what makes the interesting half testable headless — see below.

**The short path is real, with one correctness branch.** `addRule` /`removeRule`
do one `setProperty` / `removeProperty`. They fall back to a full `feed()` when
the property is `@apply`, or when the *selector being edited is named by some
`@apply`* (`applyBound`) — editing `.paper` has to reach every consumer that
applied it. `removeRule` also re-sets the property from the merged map when a
theme or derived layer still holds it, so removing a shadow reverts rather than
un-paints.

**`theme/basic-theme.json` is imported directly** (`assets.d.ts` gained a `*.json`
declaration; bun's loader gives the default export). `resolveJsonModule` in
`tsconfig.json` would have done the same, but that is a root file. The shape is
asserted at the single import, not in the declaration.

**`save()` has its own three-line `download`.** `workbench/files.ts` has a twin,
and importing it would drag the PNG plumbing into the stylist's module graph for
one helper. Collapse them in session 6, when `files.ts` is being cut anyway.

**Tested in a real browser, because there is no other way.** 21 checks in a
throwaway harness driven by headless Chrome (`--dump-dom`), since the browser
automation tool was unavailable: theme paints, `@apply` resolved, derived over
theme, a user row shadowing derived with no re-feed, a user-only property
un-painting on removal, a shadow reverting to derived, neighbours and rule count
untouched throughout, a mixin edit reaching its consumers, `rows()` ordered and
origin-tagged, `cleanup()` dropping an emptied selector. All 21 OK. Harness
deleted; the headless-Chrome trick is the reusable part.

**`test/stylist.test.ts`** covers the headless half: `@apply` in place, several
names, nesting, undefined throws, cycle throws, `applyBound`, the shipped theme
resolving whole, the file round trip, and `serialize`.

**Borrowed from session 8, to keep `bun test` green.** Deleting `src/css/` broke
two test files. `test/css-expander.test.ts` was deleted outright — its subject is
gone and `test/stylist.test.ts` covers the behaviour. `test/ui-integration.test.ts`
lost its `Css` / `expandCss` / `appliedSheet` imports and the five tests that used
them, two of which were the skipped CSSOM placeholders. **50 pass / 0 skip / 0
fail** — down from 51/2 because 12 tests left and 9 arrived.

**Still broken, as planned.** 18 `tsc` errors, same buckets (the `css.ts` error is
now engine's missing-module error). `bun run build` now fails too, on the same
import — it had been passing, because the file it wanted still existed. Sessions 5,
6, 7, 8 as written; nothing new is owed.

**Handoff.** The Stylist works and nothing calls it. Session 5 next: `CssBagger`
returns a map. Session 6 wires the conductor to `setDerived` + `feed` and is what
makes the app run again.

## Session 5 — CssBagger returns a map — **done**

**Goal.** `Diagram.derived(model): StyleRules`.

**Did.** `css-bagger.ts` returns `StyleRules`. `rules()` and `pad()` are gone,
replaced by `put()` (translate a bag into one map entry, create nothing for an
empty bag) and `own()` (get-or-create, because node overrides and position
margins both speak about `#id` and the second must not clobber the first). The
cluster recursion composes a flat path — `.cluster_outer.cluster_inner.node,
.cluster_outer.cluster_inner.record` — so `&` is gone and the empty wrapper rule
the old nesting needed is gone with it. `preamble()` returns a bag, keyed
`:root, svg`. `diagram.ts` signature updated.

**Two incidental cleanups.** The margin loop's duplicated if/else became
`slotsBefore()`, and `property` / `gapVar` are computed once instead of per node.

**Verified declaration-identical, not eyeballed.** The app does not compile until
session 6, so a side-by-side in the browser was not available. Instead a
throwaway script imported the old bagger from `git show HEAD:` alongside the new
one, flattened the old text (`&` composed against its parent), and diffed
selector | property | value across `example-1.dot`, a nested-cluster case, a bare
digraph, and an `rankdir=LR` fan. **All four identical, and in the same order** —
the only difference is the `:root` → `:root, svg` key, which is the latent-bug fix
this session was told to make. Script deleted.

**Borrowed from session 8 again, to keep `bun test` green.** `test/base-css.test.ts`
is rewritten against the map (it was all substring matching), plus two new tests:
tokens land on `:root, svg` and not `:root`, and a nested subgraph composes flat.
`test/ui-integration.test.ts` lost its two text assertions on the derived output
for map equivalents. **52 pass / 0 fail.**

**Still broken, as planned.** 18 `tsc` errors. `diagram.ts` left the list;
`engine.ts` gained one in its place (`StyleRules` not assignable to `string` at
the `lastDerived` assignment). Sessions 6, 7, 8 as written.

**Handoff.** Session 6 next, and it is the one that makes the app run again:
redraw becomes bag → `setDerived` → `feed` → frame → measure → SVG, and
`inject("style-css", …)` must die before it wipes the Stylist's rules.

## Session 6 — strip the old plumbing — **done**

**Goal.** Nothing left that moves CSS as text.

**Did.** All of the named deletions, plus the two sinks: `theme-css` and
`style-css` are both out of `SINK_WRITE`, so `inject` can no longer reach the
Stylist's sheet, and `#shabnam-theme-css` is gone from the canvas skeleton (§1).
Redraw is bag → `setDerived` → `feed` → frame → measure → SVG. `exportPng` takes
`stylist.serialize()`; `exportHtml` seeds `{ dot, action, annotation, styles }`.
**The tree compiles again — 0 `tsc` errors** — and `bun test` is 51 pass / 0 fail.

**Four calls the plan left open.**

1. **`loadDot` does not drop the derived layer, and `discardDerived` simply died.**
   The redraw that follows a load replaces the layer wholesale, so a discard verb
   would be a second way to say the same thing. §4's "dead `#id` rules cannot
   stick because nothing accumulated them" is now true by construction, not by a
   call.
2. **The export seed's user rows come from `rows()`, not a new getter.** `save()`
   downloads and the interface is capped at seven, so `files.ts` has a
   `userFile(rows)` that keeps `origin === "user"`. Restoring is the same shape in
   reverse: the workbench replays the seed through `addRule` in `onMount` —
   `Sheet` needs the element in the document, so it cannot be done at construction.
3. **Session 7's tab work was borrowed, because compiling required it.**
   `tabs.tsx` is four labels, `keys.ts` lost `load-theme` / `save-theme` /
   `tab-5`, and `⇧O` / `⇧S` are gone — they were never in §4's table. The styles
   tab renders **nothing** until `rows.tsx` lands: `textTab()` returns `undefined`
   for it and the `Show` collapses. `highlightCss` stays in `highlight.ts`, still
   exported and still tested; session 7 removes it.
   A **Save Styles** button now carries `stylist.save()`, so the verb has a caller.
4. **`theme/theme.css` and `theme/blueprint.css` deleted.** With the catalog gone
   nothing read them, and §8 says `theme/` holds `basic.css` and its decomposed
   JSON. `basic.css` stays as the source `build/decompose-theme.ts` reads.

**Verified in a real browser, the session-4 way** (headless Chrome `--dump-dom`,
the browser tool being unavailable again). Live page: 13 rules on the sheet — the
theme, with the derived tokens merged into its `:root, svg` key, which is why the
count is 13 and not 14 — `textContent` empty, no `@apply` left in any `cssText`,
`#shabnam-theme-css` absent, 3 nodes, 3 connectors, shells and the cluster rect
drawn, the annotation placed, four tab labels. Then Export HTML was driven through
its real `Cmd+E` path, the blob captured, and the file reloaded standalone: same
13 rules, same picture, seed keys exactly `dot` / `action` / `annotation` /
`styles`. Harnesses deleted.

**One pre-existing caveat, found not caused.** An exported file does **not** run
from `file://` — the page imports the app as a blob URL module, which an opaque
origin blocks. Over any HTTP server it paints. Untouched by this session; worth a
debt entry if we care.

**Handoff.** Session 7 next: `src/stylist/rows.tsx`, the tab that is currently
blank, and the `README.md` sync. Session 8 is only whatever session 7 breaks —
the seed literal it was holding is already fixed.

## Session 7 — four tabs and the rows UI

**Goal.** The tab you actually use.

`src/stylist/rows.tsx` is the rows table, ported from the prototype in
`research-lab/stylist/index.html` — native `input list=` for selector and
property so a compound selector like `.rank .node` can be typed, a value input
whose `type` follows the property, `×` to remove, `+` to insert. Rows are grouped
by origin. It goes where the styles tab currently renders nothing.

**Already done in session 6:** `tabs.tsx` is four, `keys.ts` is trimmed, and the
theme `<select>` / file picker are gone. What is left here is `rows.tsx` itself,
removing `highlightCss` from `highlight.ts` and `editor.tsx`, and deciding whether
Save Styles keeps its toolbar button or moves into the tab.

Sync `README.md` in this session — by now the code has actually moved.

**Done when.** Add a row and the picture changes with no Redraw. Remove it and it
reverts. Cleanup drops emptied selectors. Save writes `user-style.json` holding
user rows only.

## Session 8 — the tests

**Goal.** Tests assert the map, not the text.

`test/base-css.test.ts` and `test/css-expander.test.ts` were the two that asserted
CSS substrings, and both are already dealt with: the expander test was deleted in
session 4, the bagger test rewritten against the map in session 5.
`test/ui-integration.test.ts` has likewise already lost its `Css` / `appliedSheet`
imports and its two derived-text assertions. What is left here is whatever the tab
work in session 7 breaks, plus the seed literal that still carries `theme`.

Debt S2 in `docs/technical-debts.md` says `Css.plus` / `minus` cannot be tested
under `bun` for want of CSSOM. The same limit applies to the feed, so keep the
split: the map merge is testable headless, the feed is browser-only. Close S2 as
superseded and record why in the archive.

**Done when.** `bun test && bun run build` green, and the closing ceremony runs.
