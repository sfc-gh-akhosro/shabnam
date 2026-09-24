


# Archive — how Shabnam was built

The record of finished work: what was built, what was decided, and what turned
out wrong. Iterations 1–5 were the original build plan, which lived in
`current-task.md` until it was done; 6 and 7 came after. Open debts are **not**
here — they live in `docs/technical-debts.md`.

**Status: iterations 1–7 all done, each verified in a browser. The as-is → to-be
plan (sessions A–D) is closed. CodeJar is accepted. The Stylist rewrite
(sessions 1–8) is closed: style is data, the styles tab is rows, and the CSSOM
half has a browser test that runs on demand.**

## Session 1 — the law learns about the Stylist

What shipped: `app-architecture.md` and `coding-rules.md` amended for the Stylist
rewrite, before any code moved. §1 loses `#shabnam-theme-css` and gains the three
rule layers; §3 replaces the `css/` package and its algebra with `stylist/`; §3.2
has `CssBagger` returning `StyleRules` with **composed flat selectors** instead of
nested `&.node`; §4 is four tabs with no merge buffer; §7, §8, §10 follow.

What was decided, and is the reason the doc changed before the code:

- **`cssom_id` cannot exist.** `deleteRule(i)` renumbers every later rule, so a
  stored index is stale after any removal. It was also at the wrong level: with one
  `CSSStyleRule` per selector, a property is `setProperty` / `removeProperty` and
  there is no index to keep. The value stays a plain string on disk; the rule handle
  is runtime-only.
- **`@apply` stays a property**, in the data and in the JSON, resolved only when
  feeding CSSOM. Mixins therefore remain keys in the map that nothing puts on an
  element — the same contract as before, now as data rather than text.
- **Nesting goes with the text.** A flat map key cannot hold `&`, so a subgraph rule
  is composed as `.cluster_x.node, .cluster_x.record`.

`README.md` still describes five tabs and `Css.plus` — it documents the code, which
has not moved yet, so it is synced in session 7, not here.

---

## Session 2 — the types

`src/types.ts` says what §10 says. `StyleRules`, `StyleFile`, `StyleOrigin`,
`StyleRow`, and the seven-method `Stylist` interface in; `Css` out;
`Diagram.derived` returns `StyleRules`; `Files` loses the theme verbs; `TabId` is
four ids and `TabText` is keyed off the three *text* tabs on purpose, because the
styles tab is not text.

**Nothing was stubbed, deliberately.** Stubbing to green meant deleting the theme
and style tabs three sessions before their replacement existed, so the break was
left standing: 18 `tsc` errors across 6 files, each one assigned to the session
that would fix it. `bun test` stayed green throughout, which is honest and blind
— bun does not typecheck.

---

## Session 3 — decompose basic.css, once

`theme/basic-theme.json` is tracked: 13 selectors, `:root, svg` one key, the five
mixins kept, `@apply` first in each rule that has one. `build/decompose-theme.ts`
was run once by hand and is not wired into the build.

Two things the plan did not foresee, and both are reusable knowledge:

- **CSSOM only exists in a browser.** So the script serves a one-page harness on
  `:3100`, the page reads its own `<style>` back and `POST`s the result. One hand
  run, and still no CSS parser in the repo.
- **Do not enumerate `rule.style`.** Enumeration yields longhands, and a shorthand
  holding `var()` or `color-mix()` leaves every longhand empty — the first run
  silently produced `"background-color": ""`. The script reports
  `rule.style.cssText` and splits that instead.

The `@apply` lift is a text pass that rewrites it to `--shabnam-apply`, which
CSSOM keeps verbatim and in place, and the name is turned back on write. Values
are CSSOM's serialization, not the source text: `flex-direction` + `flex-wrap`
came back as `flex-flow`, `flex: 1` as `flex: 1 1 0%`. Equivalent, not identical.

---

## Session 4 — the Stylist

`src/stylist/stylist.ts` — three layers, `merged()`, the seven interface methods.
`src/stylist/sheet.ts` — `resolve` / `serialize` / `applyBound` as pure functions
plus a thin `Sheet` holding the CSSOM side. `src/css/` deleted.

Three calls the plan left open:

- **`feed()` is public on the class, not on the interface.** The conductor calls
  it once per draw; §10 caps the interface at seven and `feed` is not one of them.
- **No `attach()`.** A `<style>` has no `.sheet` until it is in the document, so
  `Sheet` looks the element up on first use — necessarily after mount — and throws
  if it is null. One place, instead of an eighth verb on the surface.
- **The pure half is exported and the DOM half is thin,** which is what makes the
  interesting half testable without a browser.

**The short path is real, with one correctness branch.** `addRule` / `removeRule`
do one `setProperty` / `removeProperty`, and fall back to a full `feed()` when the
property is `@apply` or when the *selector being edited is named by* some `@apply`
— editing `.paper` has to reach every consumer that applied it. `removeRule` also
re-sets the property from the under-layer, so removing a shadow reverts rather
than un-paints.

Verified with 21 checks in a throwaway harness driven by headless Chrome
(`--dump-dom`), the browser tool being unavailable. That trick is the part that
outlived the harness — session 8 made it a permanent test.

---

## Session 5 — CssBagger returns a map

`Diagram.derived(model): StyleRules`. `rules()` and `pad()` gone, replaced by
`put()` (translate a bag into one entry, create nothing for an empty bag) and
`own()` (get-or-create, because node overrides and position margins both speak
about `#id` and the second must not clobber the first). The cluster recursion
composes a flat path, so `&` is gone and the empty wrapper rule the old nesting
needed is gone with it.

**Verified declaration-identical, not eyeballed.** The app did not compile yet, so
a throwaway script imported the old bagger from `git show HEAD:` alongside the new
one, flattened the old text, and diffed selector | property | value across four
graphs. All four identical and in the same order — the only difference being
`:root` → `:root, svg`, which was the latent-bug fix the session was told to make.

---

## Session 6 — strip the old plumbing

Nothing left that moves CSS as text. Both sinks (`theme-css`, `style-css`) are out
of `SINK_WRITE`, so `inject` can no longer reach the Stylist's sheet, and
`#shabnam-theme-css` is gone from the skeleton. Redraw is bag → `setDerived` →
`feed` → frame → measure → SVG. **The tree compiled again.**

Four calls the plan left open:

- **`discardDerived` simply died.** The redraw that follows a load replaces the
  layer wholesale, so a discard verb was a second way to say the same thing. §4's
  "dead `#id` rules cannot stick" is now true by construction.
- **The export seed's user rows come from `rows()`,** filtered by
  `files.ts`'s `userFile(rows)`, rather than an eighth interface method. Restoring
  is the same shape in reverse: the workbench replays the seed through `addRule` in
  `onMount`, because `Sheet` needs the element in the document.
- **Session 7's tab work was borrowed,** because compiling required it: four
  labels, `keys.ts` down to `tab-1`–`tab-4`, and the styles tab rendering nothing
  until `rows.tsx` landed.
- **`theme/theme.css` and `theme/blueprint.css` deleted** — with the catalog gone,
  nothing read them.

Verified live and then through a real `Cmd+E` export reloaded standalone: same 13
rules, same picture, seed keys exactly `dot` / `action` / `annotation` / `styles`.
**One pre-existing caveat, found not caused:** an exported file does not run from
`file://`, because the page imports the app as a blob URL module and an opaque
origin blocks it. Over any HTTP server it paints.

---

## Session 7 — four tabs and the rows UI

`src/stylist/rows.tsx` — one `Rows` component, `Index` over a snapshot of
`Stylist.rows()`, native `input list=` for selector and property, and a header
carrying `+ Row` / `Cleanup` / `Save Styles`. `highlightCss` and its three `.hl-`
classes are gone; nothing else used them.

Five calls the plan left open:

- **Selector and property commit on `change`; the value commits on `input`.** The
  value is the point — one `setProperty`, picture follows the caret. A selector is
  different: `addRule` ends in `insertRule`, which *throws* on a selector CSS
  cannot parse, and every mid-word state of `.node` is one. Committing on blur
  keeps the half-typed states away from CSSOM without writing a validator.
- **Theme and derived rows are value-editable only.** Editing the value writes a
  user row that shadows it, so the rule then shows twice — which is honest, both
  layers really are still there. Renaming a theme row's selector would have meant
  "a user row that shadows nothing", and `+` already says that.
- **`×` exists only on user rows.** Removing a theme or derived row is not a thing
  the three-layer model can express.
- **The swatch is conditional.** `type=color` only speaks six-digit hex; pointed at
  `var(--paper)` it would show black and mean nothing. The text box is the truth.
- **`Save Styles` lives in the tab header,** not the toolbar: the toolbar is the
  file-and-diagram verbs.

**A `stamp` prop, because a redraw replaces a layer under the tab.** `Workbench`
bumps a counter after every `engine.redraw()` and `Rows` re-syncs on it. Three
lines, against a stale derived list.

**One real bug found by the browser pass, and fixed.** `removeRule` looked the
under-layer value up in the *unresolved* map, so a `background` arriving through
`@apply .paper` came back `undefined` and removing a shadow *cleared* the property
instead of reverting it — boxes went transparent rather than back to lavender. It
now resolves first, which is exactly what `feed` paints. Pre-existing from session
4, on the short path only, which is why a Redraw always healed it and session 4's
harness missed it.

---

## Session 8 — the tests, and a real browser one

The text-asserting tests were already gone: the expander test was deleted in
session 4, the bagger test rewritten against the map in session 5, and
`ui-integration.test.ts` had already lost its `Css` imports and its derived-text
assertions. What was actually owed was the other half — the one bun cannot reach.

**`test/browser/` is now a permanent test, not a harness.** `run.ts` serves the
real app on `:3101`, spawns the already-installed Chrome with `--headless=new
--dump-dom`, and reads one base64 JSON report back out of the dumped DOM;
`checks.ts` runs inside the page. 20 checks: the app mounts, four tabs named as §4
names them, the starter diagram draws with its SVG layer and annotation, the sink
carries **no** CSS text, no `@apply` survives the feed, the theme paints, derived
tokens reach `:root`, every layer is listed and origin-tagged, a theme row is
value-editable only, **a user row repaints live with no redraw and no re-layout**,
removing a shadow reverts to the layer under it, an `@apply` row re-feeds cleanly,
`Cleanup` drops a blank row, Redraw still draws, and no console or uncaught error
happened anywhere along the way.

**Decided with the user: headless Chrome, no dependency.** Playwright was the
other option and it would give real pointer events and retries, but it is a large
dev dependency and a second runner for a page we can drive from inside. The
checks touch **no app internals** — they set a box, dispatch the event the
component listens for, and read `getComputedStyle` and the live sheet — so the
test cannot pass by agreeing with the Stylist about something wrong.

Four things learned building it, all of them the kind that cost an hour twice:

- **No `try` / `catch`, so the report is published after every stage.** If a stage
  throws, the page stops and the dump carries out whatever was already recorded;
  the driver prints the last stage reached and fails. An `unhandledrejection`
  listener flushes rather than swallows.
- **`btoa` only speaks Latin-1.** A detail string holding `→` threw *inside*
  `publish`, which looked exactly like a hung check: the stage attribute advanced
  and the report did not. The JSON is UTF-8 encoded first.
- **Do not wait on `requestAnimationFrame` under `--virtual-time-budget`.** Frames
  stop being produced once the page settles, so an rAF-based tick hangs forever
  while a timer tick keeps working.
- **Wait for the connectors, not the nodes.** The SVG layer is injected a frame
  after the HTML, so waiting on a node reads the picture half-drawn — which showed
  up as an empty shell layer only after the time budget was raised.

**One real bug found, and fixed.** `keyed()` in `rows.tsx` asked only for a
selector and a property, so filling a row in the natural order committed the rule
while the value box was still empty. For `@apply` that is fatal — an empty value
splits to `[""]`, and `flatten` throws `@apply : not defined`, taking the app down
mid-typing. A row now reaches the Stylist only when all three boxes say something,
which also gives clearing the value box its natural meaning: the rule is removed.

**Debt S2 is closed as superseded** — its own reasoning is below. The split it
described still holds and is now load-bearing: the map merge and `@apply`
resolution are pure and tested under bun, the feed is browser-only and tested by
`bun run test:browser`. The browser half stays a separate command on purpose; it
costs seconds and a Chrome launch, and `bun test` is the one that runs constantly.

---

## Session C — Workbench.redraw matches the type

What shipped: `Engine.redraw()` lost its theme argument. Engine builds the sheet
itself via `themeSheet(this.text.theme)` — locked base, then the theme-tab overlay
when the tab is not the base. Type, Engine, and the Redraw button finally agree,
and one Redraw still always takes the DOT path.

Superseded by the Stylist rewrite: `themeSheet`, the locked base, and the overlay
are all removed in session 6 of the plan that replaced this one. The lasting part
is the shape — `redraw()` takes no arguments — which the Stylist keeps.

---

## Session D — CodeJar accepted

What shipped: CodeJar is stack, not an experiment. §0 list, §7 “Tab editor”,
the memo table, and the coding-rules dependency note. Still not an IDE and
still not a formatter. Completer stays in `temp/completer/` (S6).

---

## Session B — Css algebra matches the law

What shipped:

- `Css` matches architecture §10: `plus(style, derived)`, `minus(style, take)`,
  `expand`. Author keys win. Missing CSSOM still throws.
- Flatten keys on CSSOM `selectorText`, so nested `&.node` and a later flat
  `.cluster.node` are the same rule. Without that, `minus` cannot subtract the
  previous bag.
- `Engine` keeps `lastDerived` and does `minus` then `plus`. Style tab emit is
  one declaration per line, `:root` first. `Css` owns the newlines.
- Browser: redraw twice does not stack. Author `#core { background-color: pink }`
  beats DOT `#ddffdd`. `bun test && bun run build` green.

What turned out wrong: treating `cssText` as a stable identity for `minus`.
CSSOM rewrites hex to `rgb()` and nests to a compound selector. Identity is
the resolved `selectorText` plus the CSSOM-canonical property value.

§7 now names the flatten identity (`selectorText`). Next is C —
`Engine.redraw(themeSheet)` still disagrees with `Workbench.redraw()`.

---

## Session — CodeJar, park completer, radio strip

What shipped after the facade/CodeJar workbench commit (`b6dc348`):

- Real `codejar` package. Homemade caret/innerHTML editor gone. Highlight lives
  in `highlight.ts` so tests do not import `window`.
- Completer parked, not deleted: untracked `temp/completer/`. `Slot` /
  `suggestions` off `Workbench`. `bun test` scoped to `test/` (`bunfig.toml`).
- Coding window: `tabs.tsx` is a radio strip (equal buttons, inset
  `--raised-shadow` on the active one). Workbench owns one CodeJar.
- Law files state **to-be**. Code still as-is on Css algebra and
  `Engine.redraw(themeSheet)`.

What turned out wrong: treating Completer as delete-and-forget; treating
pretty-print as CodeJar's job; five hidden CodeJars as “tabs.”

Next session is B — see `current-task.md`.

---

> **On the names below.** Iterations 1-7 were developed against a fixture that
> modelled a specific Snowflake/GCP integration, so the notes quote node ids like
> `bq`, `gcs` and `horizon`, and icons named after products. When the project
> moved to its own public repo the fixture was replaced with a neutral one of
> identical structure (`lake`, `blobs`, `core`; `chart.svg`, `bucket.svg`,
> `star.svg`). The reasoning is unaffected; only the names changed.

Each iteration is one session. Each one ends with a product you can open in a browser and use — narrower than the last one's ambition, never broken. Do **one** iteration, then stop and report.

Before touching anything, read `AGENTS.md`, then `app-architecture.md`, then `coding-rules.md`. This file does not repeat them. Where this file and the architecture disagree, the architecture wins — say so instead of following this file.

The worker roster, the interfaces, and the folder layout are in architecture §8 and §10. Use them. Nothing below re-specifies a file list.

Fixture: `research-lab/example-1.dot`. Every iteration is verified against it.

---

## Iteration 1 — Scaffold — **done**

The "Done when" list was checked in a browser, item by item. What got settled, because iterations 2–5 inherit it:

- **Build story.** Three scripts in `build/`. `bundle.ts` owns the one bundler config; `dev.ts` serves it; `build.ts` writes `dist/`. Dev server is `Bun.serve` on port 3000, bundling `src/index.ts` on every request for `/index.js` — no watcher, no HMR, reload the page.
- **Solid's JSX compiler.** Hand-rolled Bun `onLoad` plugin in `build/bundle.ts` over `@babel/core` + `@babel/preset-typescript` + `babel-preset-solid`, all dev deps. Preset order is load-bearing: TypeScript first, Solid second, or Babel 8 will not parse `.tsx`. `bun-plugin-solid` was tried and dropped — it ships the broken order.
- **Where tab text lives.** One `createStore<TabText>` in `workbench.tsx`, keyed by `TabId` (`"dot" | "base-css" | "my-style" | "html" | "js"`). `workbench.tsx` is the sole owner; it hands the accessor and setter to `<Tabs>`. `TabId` and `TabText` are in `types.ts`. Later iterations read and write through that store — do not add a second home for editor text.
- **The canvas skeleton** is JSX in `workbench.tsx`, matching architecture §1 element for element.
- **Base CSS read-only** is `readOnly` on the textarea plus a `.derived` class that greys it.
- **Housekeeping.** Fixture moved to `research-lab/example-1.dot`. `input/`, `output/`, and the stale `test/` (which imported the old `dot-parser.ts` design) are gone. `git status` is clean — the canary ignores `node_modules/` and `.snowflake/`.

Left inert on purpose: the Redraw button has no handler, `#status` is empty, and every sink is empty. Iteration 2 wires them.

One architecture note: §10 writes the registries as `const SHAPE_HTML: Map<…>` inside the types listing, but §8 also says they live with the workers that consult them. `types.ts` therefore declares their *types* (`ShapeHtml`, `ShellSvg`, `AttrCss`) and leaves the actual maps to `node-shaper.ts` and friends. §8 wins; no file needs changing.


---

## Iteration 2 — Workbench end-to-end — **done**

The "Done when" list was checked in a browser: the dump renders with namespaced ids, subgraph classes and numeric coordinates; malformed DOT puts `Error: syntax error in line 1` in `#status` and leaves the previous dump standing; `VizJson` appears only in `types.ts` and `diagram/`. Built: `diagram/vizer.ts`, `diagram/diagram-bagger.ts`, `workbench/sinker.ts`, `redrawer.ts`, and the Redraw handler.

What got settled, because iterations 3–5 inherit it:

- **Graphviz JSON shape, learned the hard way.** `objects` holds `_subgraph_cnt` subgraphs first, then every node; `nodes` / `subgraphs` / `tail` / `head` are indices into `objects` (= `_gvid`). Two traps, both found by a wrong first answer in the browser:
  - **Graph-level attrs are on the top-level JSON, not on `objects[0]`.** `objects[0]` only carries what a `graph [...]` block set, so reading `rankdir` from it silently returns `TB` for `digraph { rankdir=LR; … }`.
  - **The root graph is not reliably `objects[0]`.** It appears in `objects` only when the DOT contains an anonymous subgraph, and then Graphviz names it `%1`. Slicing index 0 off dropped a real `cluster_a`. Filtering `%`-prefixed names is the rule, and it excludes the root for free.
- **Anonymous subgraphs (`%3`, `%5`) are not identity.** They carry `rank=same` and nothing else. They contribute no class and produce no `Cluster`. Only named subgraphs do.
- **`cluster_` is stripped for the class and the id**: `cluster_consumer` → class `consumer`, id `c-consumer`, per the CSS in §3.2. Note the side effect — `cluster_a` becomes the one-letter class `a`.
- **Identity, per §3.1.** `sanitize` = `[^A-Za-z0-9_-]` → `-`. One `ids` map across all three namespaces; re-registering an id under a different DOT name throws (verified: `"a.b"` and `"a b"` both want `n-a-b`). Parallel edges are counted per from/to pair and suffixed `-2`, `-3`, so they do not trip the collision check.
- **What the model carries.** Presentational keys only, via `STYLE_KEYS` in `diagram-bagger.ts` — `fillcolor`, `bgcolor`, `color`, `fontname`, `fontsize`, `penwidth`, `style`. Graphviz has already resolved defaults onto every object, so what is there is the effective value. No `width` / `height` / `_draw_` / `bb`: geometry is the Measurer's, per §3.4. `pos` becomes numeric `x` / `y` and the string never leaves this file.
- **`Sinker`** is a `Map` of sink id → writer: markup sinks get `innerHTML`, style / script / status sinks get `textContent`. Unknown sink throws. `status` is a sink like any other — that is how `Redrawer` stays DOM-free.
- **The one catch** is a private `parse` helper in `redrawer.ts` wrapping only `Vizer.render`; it returns `null` on failure so its inferred return type keeps `VizJson` out of the file. `bag` is deliberately *outside* the try — a bagger throw is a bug and must reach the console.

Known Graphviz behaviour, not a bug of ours: in `research-lab/example-1.dot`, `cluster_consumer` comes back with **no** `nodes`, because `ge` / `spcs` / `agents` were all already declared inside earlier subgraphs. The JSON's node lists are declaration-scoped. So on that fixture the only interesting named cluster contributes no classes. Iteration 3 should style the fixture knowing this; fixing it would require reading DOT, which we do not do.

Still inert: `#base-css`, `#my-style`, `#annotation-html`, `#my-js`, and both SVG groups are empty.

---

## Iteration 3 — Draw layout — **done**

The "Done when" list was checked in a browser: the fixture renders as four columns of styled boxes matching its four ranks; the inspector shows `n-bq [node a]`, `n-runtime [node b]`, `n-engine [node]` and so on; two consecutive Redraws produce byte-identical Base CSS (1314 chars both times); typing in My Style recolours the boxes with no Redraw, and a Redraw after that re-derives Base CSS while leaving My Style intact; malformed DOT still puts `Error: syntax error in line 1` in `#status` and leaves the picture standing; the iteration 2 dump is gone. Built: `diagram/node-shaper.ts`, `diagram/layout-framer.ts`, `diagram/css-bagger.ts`, rewired `redrawer.ts` and `workbench.tsx`.

What got settled, because iterations 4–5 inherit it:

- **A subgraph class is on the node element, so a subgraph block needs `&`.** §3.2 writes `.consumer { .node { } }`, which compiles to the descendant selector `.diagram .consumer .node` — and there is no wrapper element, because §3.3 puts the subgraph class on the node itself. Found in the browser: `cluster_a`'s green never applied and `n-bq` stayed `#BBDEFB`. Inside a subgraph block we therefore emit `&.node` / `&.edge`; the outermost block stays a plain class because `.diagram` *is* a real ancestor. Nested clusters are `&.b`, giving `.diagram .a.b.node`. **This is the one place the code reads differently from the architecture text — §3.2's example should be updated to `&.node`.** A cluster's own `.graph` block is left as a descendant selector: it describes a cluster background, and the element that would carry it arrives with the shells in iteration 4.
- **Absence is a value when bagging.** Literal "most common present value" made one edge's `penwidth=3` the default for all eighteen edges. Counting absence in the tally fixes it: absence is the majority, the key is skipped at `.edge` level, and `#e-horizon-runtime` gets the `border-width` instead. Ties still break on the lexicographically smallest value, and `ATTR_CSS`'s insertion order is the declaration order — those three together are what makes the output byte-identical.
- **Base CSS carries a fixed preamble as well as the bagged rules.** The `:root` contract of §3.2, plus the structural rules that make a column of divs read as a diagram (`.diagram.columns` flex, `.column` flex, `.node` border / padding, `.label` `white-space: pre-line`). Both are derived output that every Redraw rewrites, so neither belongs in My Style, which the user owns.
- **Base CSS reaches the page through the store, not through `Sinker`.** Base CSS is tab text, and iteration 1 settled that the store is its one home. So `Redrawer` takes a `setBaseCss` callback, and `workbench.tsx` runs one `createEffect` per style sink. That is also why My Style restyles the picture on every keystroke with no Redraw — it is the same mechanism, not a second one.
- **Column bucketing.** One pass over position-sorted nodes; a node opens a new column when it is more than 2 points from the column it would otherwise join. `AXES` is a `Map` on `rankdir` holding the grouping axis, the column direction and the in-column direction — Graphviz's y grows upward, so "first" is the larger y. Unknown `rankdir` falls back to `TB`. No float-equality test anywhere.
- **`SHAPE_HTML` is a `Map` plus a `shapeHtml` lookup with a `box` fallback**, as §8 demands. Every `shape=record` node in the fixture therefore renders as a box, and the label keeps its record braces verbatim — `{GCP \n Services | {Managed Spark | …}}`. Readable, and correct for this iteration; a `record` entry is one map entry away when we want it.

Still inert: `#annotation-html`, `#my-js`, and both SVG groups are empty. `Cluster.isInvis`, `Node.shell`, `Node.icon` and `Node.caption` are bagged but unused until iteration 4.

One housekeeping note, unchanged from before this session: in the enclosing git repo the whole `yad/` folder is still untracked (`?? ./`), so `git status` cannot yet act as a canary for individual files. The ignore rules themselves are correct — `git check-ignore` confirms `src/diagram/css-bagger.ts` is un-ignored by `!*/**/*.ts`. Worth an initial commit before iteration 4.

---

## Iteration 4 — Draw SVG — **done**

The "Done when" list was checked in a browser, item by item, on `research-lab/example-1.dot`: 13 boxes, 13 shells each a uniform 4px outset on all four sides (`n-bq` box `[14,14,132,122]`, shell `[10,10,140,130]`); 5 icon badges for the 5 `icon=` nodes; 2 caption strips for the 2 `caption=` nodes; 12 connectors, all with arrowheads, none with a NaN or empty coordinate, no endpoint detached from a box. The gap test passed: `--horizontal-gap: 6em` in My Style plus a Redraw moved the column pitch from 146/158/146 to 216/228/216 and every shell was still within 1px of its box, with all 12 connectors still joined. No cluster element is drawn anywhere. `digraph {` still puts `Error: syntax error in line 1` in `#status` and leaves the picture standing. Zero console errors throughout. Built: `svg/box.svg`, `src/assets.d.ts`, `diagram/node-sheller.ts`, `diagram/edge-drawer.ts`, `workbench/measurer.ts`, rewired `redrawer.ts`, `build/bundle.ts`, `app.css`, `css-bagger.ts`.

**The layering question §1 does not answer, and the answer we chose.** §1 says the HTML layer is "in flow, measurable" and the SVG layer draws a shell "with icon and caption inside" — but `#main-svg` comes *after* `#main-html` in the skeleton, so a filled shell hides the HTML label, and two text layers print every node twice because `caption` falls back to `label`. Settled with the user: **the HTML layer owns the visible node** — its background, border and label are real CSS on a real div, exactly as iteration 3 left it. The shell is *chrome around* that rectangle: stroke-only, so it cannot cover anything. **§1 should say so** rather than leaving "inside the shell" to be guessed at.

What got settled, because iteration 5 inherits it:

- **The coordinate contract, stated once** in the header of `node-sheller.ts` and again in `app.css`: every number in the SVG layer is CSS pixels in the **padding-box space of `#canvas`**. `#canvas` is the positioned ancestor, `#main-svg` is `position: absolute; inset: 0` inside it, and every element between a node and the canvas is statically positioned — so `offsetLeft` / `offsetTop` already accumulate to that origin, and they are scroll-independent, so the two layers stay registered however far the canvas scrolls. `#main-svg` has **no viewBox** (one user unit = one pixel) and **`overflow: visible`**, without which the UA's default `overflow: hidden` clips every shell past the visible box.
- **Connector anchoring.** Midpoints of the two facing shell edges, on whichever axis separates the box centres more. A straight line, one shared `<marker>` in a `<defs>` inside `#connectors`. No routing, no orthogonal splines, no overlap avoidance — the fixture's `splines=ortho` is ignored, which is correct for this pass. `SHELL_PAD` is exported from `node-sheller.ts` and imported by `edge-drawer.ts` so "where the shell is" has one definition.
- **Clusters get no element, and the per-cluster `.graph` block is gone.** The SVG layer paints *above* `#main-html`, so a cluster background drawn there would cover its own members — there is nowhere for a cluster element to go under the layering we chose. `CssBagger.cluster` no longer emits `.graph`, and no longer takes the graph bag. `style=invis` is satisfied for free: nothing is drawn for any cluster, invisible or not, and member classes are untouched (`n-bq` is still `class="node a"`). **§3.2's nested `.graph` inside a subgraph block should come out of the document.** The diagram-level `.diagram .graph` block is still emitted because §3.2 mandates it — it is inert for the same reason, and worth raising.
- **Paint order beats halos.** `paint-order: stroke` with a white stroke only masks siblings painted *earlier*. The first cut grouped each caption with its own shell, and the next node's dashed shell struck the caption through. `NodeSheller` now emits all 13 shell groups and *then* both captions, so `#node-shells` is 13 `<g>` followed by 2 `<text>`. Confirmed in the browser: the shell line no longer crosses "Cloud Storage". **`#connectors` still paints over captions** — "Snowflake Horizon" is crossed by an edge — and nothing inside the two-group skeleton can fix that. Leave it or give captions a third group, but that is a §1 change.
- **A caption is drawn only when the DOT asked for one.** `caption` falls back to `label` in the model (§3.1), so rendering it unconditionally prints every label twice now that the HTML layer owns the text. Rule: *the shell shows a caption when `caption=` was set; otherwise the label already said it.* This is the one place the Done-when list ("caption falls back to label") is satisfied at the model level rather than on screen — say so if that is not what was meant.
- **Assets are text imports, not fetches.** `loader: { ".svg": "text" }` in `build/bundle.ts`, plus `src/assets.d.ts` so TypeScript agrees. `SHELL_SVG` maps a shell name to the *markup* of a file in `svg/`; `ICON_SVG` maps an `icon=` filename to a logo's markup, inlined as a `data:image/svg+xml,` href. So a new shell is a file plus one entry plus its import line, and iteration 5's Export has nothing to chase at runtime. A shell file is deliberately an SVG **fragment** with `{{x}} {{y}} {{width}} {{height}}` tokens, not a standalone document — `NodeSheller` supplies the group that carries the node's classes.
- **`Redrawer` waits one frame before measuring.** Base CSS reaches the page through the tab store, whose Solid effect runs on a later microtask, so measuring in the same tick sizes the boxes against the *previous* redraw's CSS. One `requestAnimationFrame` flushes the effect and the layout it causes. That is §5's "[ browser paints ]" step, and it is why the gap test passes.
- **Measured numbers are rounded to the half pixel** in the emitted markup. Enough precision to look right, and it keeps two identical redraws producing identical strings.

Known gaps, for iteration 5 to decide on rather than discover — all of them now written up in `docs/technical-debts.md`, which is the ledger from here on:

- **`ATTR_CSS` is HTML-only** (debt R1). It maps `penwidth` → `border-width` and `color` → `border-color`, which mean nothing on a `<line>` or a `<rect>`. So `#e-horizon-runtime`'s `penwidth=3` and the fixture's edge colours do not reach the connectors, which take their look from the preamble instead. An SVG twin of `ATTR_CSS` (`stroke`, `stroke-width`) is the obvious fix and is a registry, not a redesign.
- The `icon/` files are crude placeholder glyphs — a generic info circle for `chart.svg`, a plus square for `bucket.svg` (debt V4). They render correctly; they just are not real artwork. (These two were named `bigquery.svg` and `gcs.svg` at the time; see the note at the top of this file.)
- Browser zoom below 100% reflows the HTML layer without redrawing the SVG, so shells drift until the next Redraw (debt V3). Expected under this design — geometry is measured, not live — but worth knowing before someone reports it as a bug.

Housekeeping, unchanged: in the enclosing git repo the whole `yad/` folder is still one untracked `?? ./`, so `git status` cannot act as a per-file canary yet. The rules themselves are right — `git check-ignore -v` confirms `src/diagram/node-sheller.ts`, `src/assets.d.ts` and `svg/box.svg` are un-ignored by `!*/**/*.ts` and `!*/**/*.svg`, and `node_modules/` is ignored. Still worth an initial commit.

The fixture gained five `icon=` attributes (`gcs`, `bq`, `horizon`, `spcs`, `ml`) and two `caption=` attributes (`gcs`, `horizon`), because without them two Done-when items could not be looked at.

Still inert: `#annotation-html` and `#my-js`. `Cluster.isInvis` is now bagged and deliberately unread — §10 mandates the field and no cluster is drawn, so the rule that satisfies it is "draw nothing", not a branch.

---

## Iteration 5 — Finish up — **done**

The "Done when" list was checked in a browser, item by item, with `browser_evaluate` reading real values rather than by reasoning:

- **Export**: `yad.html`, 3,396,258 bytes, zero external `src` / `href`. Opened from `file:///` with no server: it mounts, draws 13 nodes / 13 shells / 5 badges / 2 captions / 12 connectors, reports `13 nodes, 12 edges — redrawn in 36 ms`, carries the My Style and HTML tabs it left with, and its own Redraw and Export both work. An export of an export is byte-identical.
- **Theme round trip**: typing in My Style restyles with no Redraw (`rgb(200, 230, 201)` before any click); Save Theme wrote `my-style.css` with exactly the tab's text; clearing returned the boxes to `#BBDEFB`; loading the file back through the real file input restored both colours. `theme/blueprint.css` loads too — shell stroke went orange, the dash went away, and `--horizontal-gap: 2.5em` moved the column gap to 32.5px while every shell stayed 4px off its box.
- **Annotations**: `data-anchor="n-horizon"` put the annotation's centre at x 224 against the node's centre x 224, 52px below it as asked; `data-anchor="200,80"` landed its centre at exactly 200,80.
- **JS runs**: `window.__jsRan` incremented once per Redraw and the script's DOM write stuck. `#my-js` is a live `SCRIPT` element.
- **Speed**: the fixture redraws in **6–20 ms**. Two orders of magnitude inside §5's budget.
- **Tests**: 9 tests, 42 assertions, `bun test` green. Error path unchanged — `digraph {` gives `Error: syntax error in line 1` with all 13 nodes and 12 connectors still standing. No console errors.

Built: `workbench/themer.ts`, `workbench/annotator.ts`, `test/model-identity.test.ts`, `test/base-css.test.ts`, `theme/blueprint.css`; rewired `sinker.ts`, `redrawer.ts`, `workbench.tsx`, `css-bagger.ts`, `edge-drawer.ts`, `app.css`, `index.html`, `types.ts`.

What got settled, because whatever comes next inherits it:

- **What "standalone" means.** An exported file depends on **nothing but a browser** — no server, no network, no CDN, no sibling files. It carries the chrome CSS inline, the whole bundle (viz.js inside it) inline, and the five tab texts as a `#yad-seed` JSON. So it is not a picture of a diagram, it is *the workbench with a seed*: it redraws, restyles, and re-exports offline. That is what makes "can still redraw" true rather than aspirational.
- **The export's self-reference trap, and why the bundle rides as base64.** An inline `<script>` ends at the first `</script` the **HTML parser** sees — and the bundle contains `themer.ts`, including the template that writes `</script>`. The first export therefore produced a page that died on `Uncaught SyntaxError: Unexpected identifier 'digraph'`, because the parser closed the script early and started reading the starter DOT as JavaScript. Escaping it in the source as `<\/script>` did **not** work: Bun normalised the escape away on the way out. The fix is to stop relying on source form — the bundle rides in a `<script type="text/plain" data-encoding="base64">` and a three-line bootstrap imports it as a blob module. Base64 has no `<` in its alphabet, so the question cannot come up again. Cost: the export is ~3.4 MB rather than ~2.5 MB. Worth it.
- **A theme is My Style text and nothing else.** Base CSS is derived, so a theme that carried it would go stale on the next Redraw. `Themer.load` writes the My Style tab and lets the existing store effect reach the sink — the same mechanism that restyles on a keystroke, not a second one. Nothing in the theme path touches Base CSS, the DOT, or the model.
- **Anchor semantics, which §4 names but does not define.** `data-anchor="n-bq"` is the centre of that node's *measured* box; `data-anchor="120,40"` is a literal point; `data-offset="dx,dy"` is added to either, +x right and +y down. Both are Cartesian in the padding-box space of `#canvas` — the same coordinate contract `node-sheller.ts` states — so an annotation and a shell agree on where a node is, at any scroll position. The anchor point is the annotation's **own centre**, done with `transform: translate(-50%, -50%)` in `app.css` so nothing has to measure the annotation. Elements without `data-anchor` are left in flow. **§4 should say all of this**; "Cartesian `data-anchor` / `data-offset`" is not a spec.
- **The JS tab runs by element replacement, and it goes last.** Writing `textContent` on a `<script>` the parser has already passed does nothing, so the `my-js` sink *replaces* the element with a fresh one — that is what executing means here. It is injected as the final step of §5, after the status line, so the user's script sees a finished canvas and can have the last word on any sink. The first cut injected status *after* the JS and made the user's own status write look like a failure.
- **`ATTR_CSS` got its SVG twin (debt R1 closed).** `ATTR_SVG` maps `color` → `stroke` and `penwidth` → `stroke-width`, keyed on the same bags, emitted nested under `#connectors`. Verified: `#e-horizon-runtime` computes to `stroke-width: 4px` against `1.2px` for every other edge. Exactly the registry the architecture pointed at — no worker changed shape, `rules()` just takes which registry to speak.
- **One arrow size, whatever the line weight.** SVG markers default to `markerUnits="strokeWidth"`, so the moment DOT `penwidth` started reaching the connectors the 3pt edge grew an arrowhead three times everyone else's. Fixed to `userSpaceOnUse`. The shared marker takes its colour from `fill: context-stroke`, so one `<marker>` still serves every edge colour — confirmed rendering, not just computing.
- **`#status` now reports the number.** `13 nodes, 12 edges — redrawn in 7 ms`. §5's "well under a second" was previously a claim nobody could check; now it is on screen, and it doubles as the thing that clears the last parse error.

Known gaps, all recorded in `docs/technical-debts.md`:

- **My Style cannot override an `#id` rule that Base CSS emitted** (new debt V5). Under the fixture, `.diagram .node { background-color: … }` recoloured every node *except* the six that carry `#n-… { background-color: #ddffdd }`. Specificity, working exactly as CSS says. It is the first real limit on "hand-written My Style is trivial" (§3.2), and it deserves a decision rather than an `!important`.
- The two inert `.graph` blocks (debt D3) are **still emitted**, unchanged. Removing them is a §3.2 edit, and root documents are not changed without your approval.
- `docs/technical-debts.md` D1, D2, D3, V1, V3, V4, R2, R3, M1, M2, M3, P1 are untouched by this iteration. P3 (no tests) is closed.

Housekeeping, unchanged: the whole `yad/` folder is still one untracked `?? ./` in the enclosing repo, so `git status` still cannot act as a per-file canary (P1). `git check-ignore -v` confirms `src/workbench/themer.ts`, `src/workbench/annotator.ts`, `test/base-css.test.ts` and `theme/blueprint.css` are all un-ignored by the right rules. Still worth an initial commit.

One process note, because it cost this session real time: the browser verification was first handed to a subagent, which turned one pass into hundreds of individual click approvals for you. Driving the browser directly with bulk `browser_evaluate` reads — a dozen calls, each returning a JSON blob of measured values — is both faster and quieter. Do it that way.

---

## Iteration 6 — CSS naming is DOT naming

### Closed

- **The `n-` / `e-` / `c-` prefixes are gone.** An id is the sanitized DOT name,
  an edge is `from_to`, a subgraph is its own name with `cluster_` intact. The
  inert diagram-level `.graph` block and the inert HTML-space `.edge` rules went
  with them: a cluster has no element and an edge is a `<line>`, so a background
  and a border on those were output that did nothing.
- **Base CSS no longer invents colour.** `#52606d`, `#ffffff`, `#555555` and
  `var(--primary-color)` on the shell are gone from the preamble; the shells and
  connectors take their pen from the node and edge bags. `example-1.dot` declares
  four colours and Base CSS now names exactly those four, which is the property
  `test/base-css.test.ts` asserts rather than a number anyone has to recount.

### Found in the browser

- **Dropping the prefix put node ids in the same space as the page's own ids,**
  and `example-1.dot` has a node called `connectors`. `Sinker.inject("connectors",
  …)` wrote twelve edges into that node's `<div>`: two `<defs>`, fourteen
  `<line>`s, and a diagram that still looked almost right. Fixed by prefixing
  every app-owned id with `shabnam-` (§1) — the diagram's namespace is DOT's, and
  the app stays out of it. Base CSS references no sink id at all now, which is
  both shorter and one less thing to keep in step.
- **`innerHTML` cannot serialize the SVG layer for the PNG.** It drops the SVG
  namespace, so `<svg>` came back as an unknown XHTML element: the first PNG had
  boxes and labels but no shells, no icons, no connectors, and the caption text
  flowed at the top-left corner. `XMLSerializer` emits the namespaces and fixes
  all of it. The wrapper also has to carry the canvas's computed `font`, or the
  annotation layer renders in the browser's serif default.
- **The root graph is not in `renderJSON`'s `objects`.** The code believed it was
  at index 0 and skipped that entry, which would have dropped example-1's first
  anonymous subgraph — the one carrying `fillcolor="#ddffdd"` for six nodes.
  `research-lab/probe-subgraphs.ts` is the check.
- **`edges` is absent, not empty, when a DOT has none.** A first diagram of
  nothing but boxes crashed on `raw.edges.map`.


## Iteration 7 — CSSOM is the CSS parser

### Closed

- **The hand-rolled brace scanner and `normalize()` are gone.** CSSOM parses and
  normalises, so every notation-only difference collapses before we compare:
  whitespace, comments, `RED` against `red`, `#BBDEFB` against
  `rgb(187, 222, 251)`, and `border-width: 1px` against its four longhands. All
  four were false triggers before; all four were checked in the browser.
- **Migration is per declaration, not per block.** Editing one colour moves one
  declaration instead of the whole rule with its structural padding attached.
- **PostCSS was evaluated and rejected on the merits,** not on dependency count.
  Its one advantage over CSSOM is preserving the user's bytes exactly, which this
  app does not want — Redraw is where the tabs and the DOM are made to agree. What
  remained was a parser that deliberately does not normalise, leaving us to
  hand-write the CSS value semantics the browser already ships.

### Found in the browser

- **`var()` on a shorthand is a pending-substitution value.**
  `border-color: var(--secondary-color)` enumerates four longhands and every one
  of them reads back as the empty string; the value exists only in
  `style.cssText`. The first design read longhands, which would have silently
  emptied `theme/blueprint.css`'s `border-color` and our own preamble's `gap` and
  `padding`. Hence the whole-rule fallback, which doubles as the road every
  non-style rule takes. `research-lab/probe-cssom.ts` is the record.
- **Appending to My Style grows it without bound.** The cascade made the picture
  correct, so this looked fine — but editing one colour across three Redraws left
  three `.node` rules behind. Rules are now merged by selector path.
- **Merging into a whole-rule fallback has to go through CSSOM too.** Replacing
  blueprint's coarse `.node` with a one-declaration edit would have taken its
  border, radius and shadow with it. Both sides are handed to a scratch
  declaration and the later one wins, which is what the cascade would have done.
- **A conditional group was counted twice.** `@media print { .node { … } }` was
  stored both as its own text and as its child, so it would have been emitted
  twice. A group contributes its children only; `@keyframes` stays a leaf and is
  carried verbatim.

## Iteration 8 — Visual Clusters, Smart Connectors, 1:1 Workbench Parity & CodeJar

### Built & Shipped
- **Visual Subgraph Cluster Boxes (`NodeSheller.clusters`)**: `subgraph cluster_...` definitions are measured from member nodes and rendered as SVG bounding boxes with padding, rounded corners, and uppercase `.cluster-label` text under `<g id="shabnam-clusters">`.
- **Smart Connector Routing (`EdgeDrawer`)**: SVG `<path>` connector paths supporting `spline` (cubic Bézier), `ortho` (rounded step), and `line` (straight) modes, controlled via `--connector-style` / `--connector-type`, graph `splines=`, or per-edge `splines=`.
- **1:1 Workbench Parity**: Removed legacy hidden `derived-css` and `effects-css` sinks. Derived CSS is rebased directly into `style.css` via `StyleMerger.rebase` so all `:root` variables, `#node { margin-top: ... }` slot margins, and overrides are visible and editable in `style.css`.
- **Compact Visual 5-Element Style Grid**: Replaced raw textarea with an interactive 5-column grid (`[ ✕ ] [ Target ] [ Property ] [ Value ] [ + ]`) using native `<datalist>` autocomplete, native `<input type="color">` swatch, and positional blank row insertion.
- **CodeJar Micro-Editor**: Integrated zero-dependency CodeJar with token-based syntax highlighting for `theme.css` (editable), `diagram.dot`, `action.js`, `annotation.html`, and Raw CSS mode.
- **Simplified Gap Spacing**: Set `--horizontal-gap: 2em;` and `--vertical-gap: 2em;` in `:root`, with container rules using `calc(2 * var(--gap))`.

---

## Iteration 9 — Types, facades, CodeJar workbench

Killed the style-grid experiment (`css-helper.tsx`, `parseCss`). Types describe packages, not one-method workers: `Vizer`, `Diagram`, `Css`, `Workbench`, `Files`.

Workbench is seven files (`workbench` / `tabs` / `editor` / `complete` / `engine` / `files` / `keys`). Five CodeJar tabs, order **dot · theme · style · annotation · action**. Completer is current-line, four slots. Wrap ~40em.

`Css.plus` is CSSOM flatten + overlay, `:root` first; missing CSSOM throws. `theme/theme.css` is locked and always first; other `theme/*.css` are overlays. No `#shabnam-derived-css` sink.

Law files (`app-architecture` §1/§3/§4/§5/§7/§8/§10, `current-task`, `README`) match. 50 tests pass; `Css.plus` skipped under bun.

---

## Closed debts — kept for the reasoning

### S2. ~~`Css.plus` / `Css.minus` cannot be tested under `bun`~~ — **closed by
session 8, as superseded**

The original entry: `bun test` has no CSSOM, so both throw there by design;
session B verified them in the browser, the expander still ran under Bun, and a
DOM shim would be worse than no test.

`Css` no longer exists, so the subject is gone — but the limit it recorded is
permanent and now shapes the suite. The pure half (`resolve`, `serialize`,
`applyBound`, the merge) is tested under bun in `test/stylist.test.ts`; the feed,
the live repaint, and the rows tab are tested in a real browser by
`test/browser/`. The debt asked for "a browser-run harness, when regression tests
earn their place" — they earned it, and it found two bugs on the way in.

These were paid. They live here rather than in `docs/technical-debts.md`, which
holds only open debts. Their ids are retired, not reused. Anything written below
describes the state at the time it was closed — `#e-x` style ids, for instance,
predate the naming law in §3.1.

### D2. ~~§3.2's subgraph block writes `.node`, the code emits `&.node`~~ — **closed in iteration 6**

§3.2 now writes `&.node`. The reasoning below is why.

A subgraph name is a class on the node element itself (§3.3), so there is no
wrapper element. `.consumer { .node { } }` compiles to the descendant selector
`.diagram .consumer .node` and matches nothing. Found in a browser in
iteration 3: `cluster_a`'s green never applied.

§3.2 has since been updated with the `&` explanation, but its **example block
still shows a nested `.graph`** inside a subgraph — see D3.

**Cost to close:** delete the nested `.graph` from §3.2's example.

### D3. ~~Two `.graph` blocks in Base CSS have no element to style~~ — **closed in iteration 6**

Both are gone. A block that styles an element nobody draws is inert, and §3.2 now
says so outright. The history below is why the diagram-level one survived a
round longer than the per-cluster one.

Iteration 4 decided clusters get **no element of their own**: the SVG layer paints
above `#main-html`, so a cluster background drawn there would cover its own
members. `CssBagger.cluster` no longer emits a per-cluster `.graph` block.

The **diagram-level** `.diagram .graph` block is still emitted, because §3.2
mandates it — and it is inert for exactly the same reason. `bgcolor` on the graph
has nowhere to land.

Open question for whoever touches this: does the diagram get a background element
(a `<rect>` first in `#node-shells`, or a class on `.diagram.columns`), or does
`.graph` come out of §3.2 entirely? Either is defensible. Emitting dead CSS is
not, under `coding-rules.md`'s "no covering code."

**Cost to close:** one decision, then either one rule removed or one element added.

### R1. ~~`ATTR_CSS` is HTML-only~~ — **closed in iteration 5**

`ATTR_SVG` (`color` → `stroke`, `penwidth` → `stroke-width`) is keyed on the same
bags and emitted nested under `#connectors`, so `#connectors #e-x` outranks the
preamble. `rules()` takes which registry to speak; no worker changed shape. One
map per output space beat one map with two columns — the bagging never had to
know there were two.

Verified in a browser: `#e-horizon-runtime` computes to `stroke-width: 4px`
against `1.2px` for every other edge, and `test/base-css.test.ts` asserts the
rule is emitted.

It did surface one thing — SVG markers scale with `stroke-width` by default, so
the thick edge grew a triple-size arrowhead until `EdgeDrawer` pinned
`markerUnits="userSpaceOnUse"`.


## Iteration 13 — the browser suite stopped being a coin flip

For four iterations `bun run test:browser` failed perhaps one run in three with
`no report in the dumped DOM`, and the standing advice (debt S9) was "do not wait
for anything": reach for a synchronous path, or assert only on what runs before
`await painted()`. That advice treated the symptom. The cause was one line in the
engine:

```ts
function painted(): Promise<void> {
  return new Promise((done) => requestAnimationFrame(() => done()));
}
```

`rAF` is the right way to ask "has the browser laid this out yet", and the
Measurer (§3.4) genuinely needs the answer before it reads geometry. But `rAF` is
a promise the browser does not always keep. It does not fire in a background tab,
and — the part that cost the cycles — it does not reliably fire under
`--virtual-time-budget`, because a virtual clock advances timers without
necessarily producing a compositor frame. When it did not fire, `await painted()`
never resolved: the SVG layer was never injected, `mounted()` polled until it gave
up, and the page died before publishing a single check. Hence "no report", and
hence a *different* stage on each run — it was never really about which stage.

Two changes, and the run went to 45 pass / 0 fail on every attempt:

- `run.ts` passes `--run-all-compositor-stages-before-draw`, which is what makes
  Chrome finish a frame under a virtual clock. (`--enable-begin-frame-control`
  looks related and makes it strictly worse: frames then wait for an explicit
  BeginFrame over DevTools, which nothing sends.)
- `painted()` races the frame against `setTimeout(0)` instead of waiting on it.
  Layout is synchronous by the time a macrotask runs, so the fallback measures the
  same boxes; it is a floor under the frame, not a substitute for it.

The second one is a real fix, not a test accommodation: without it, a Redraw
started in a hidden tab never finishes, and the diagram stays half-drawn until the
user presses Redraw again.

**The lesson that replaces the old rule of thumb.** "Never wait" was scar tissue.
The harness can wait now — what it must not do is wait on something the platform
only *usually* provides. If a test hangs under virtual time, suspect a frame, not
a timer.

---

## Iteration 14 — the derived margin is gone

Graphviz `pos` bought a node a per-node margin for several iterations. It no
longer buys anything but **rank membership and order within the rank**.

Three formulas were tried in one session, each an honest attempt at the real
goal — give an isolated node a little "puff" without pinning it:

1. **Offset within the rank, normalised per rank.** The lightest node of *every*
   rank weighed nothing, so no rank could be heavier than another. Rejected: it
   reads as "how far down the rank are you", so in a tidy stack the fifth node
   got the most margin purely for being fifth.
2. **Same, normalised against the diagram's minimum.** Fixes the per-rank
   flattening and keeps a rank's offset. Same defect, plus a new one: it is
   origin-dependent, and under LR (where Graphviz's y grows upward) the
   *visually bottom* node is the light one.
3. **Nearest-gap sharing.** Per rank, the gaps between consecutive nodes, minus
   the tightest gap anywhere, each node taking half the net gap before it and
   half after. Closest to the intent — it measures neighbour distance, and the
   tightest pair emits nothing so the theme stays in charge. Still wrong in
   practice: the leading node's gap is measured from coordinate zero, which is
   a distance to the origin and not to a neighbour, so the top node of each rank
   collected puff for being near the top.

**The conclusion is the interesting part.** Every candidate was a proxy for
"isolation" reverse-engineered from coordinates that were never computed to
express it. Graphviz spaced those nodes to route edges, not to signal that a
node stands alone, so any reading of the spacing is a guess about intent. The
guess is cheap to write and expensive to keep: it was the only value in the
whole pipeline that was *computed* rather than passed through, and it needed a
named exception in the architecture to exist at all.

So it was deleted rather than tuned a fourth time. Puff, if it is wanted, is a
theme concern — CSS can space a rank, and a row can space one node.

What left with it: `nodeWeightMargins` and `leadingGaps` from `css-bagger.ts`,
`calculateStep` (a 19-line delta heuristic) from `layout-framer.ts`, and
`test/weight-margin.test.ts`. `AXES`, `Axes`, `TOLERANCE` and `bucket` stopped
being exports and are now private to `layout-framer.ts` — `css-bagger.ts` no
longer imports from it at all, so the bagger and the framer are fully
decoupled. The pass-through law in `app-architecture.md` now holds with **no
exception**, and debt M4 shed one of the coordinate heuristics it owed a
replacement for.

The test that replaced the suite asserts the inverse: derived CSS must contain
no `margin*` property at all. 79 pure + 52 browser, green.
