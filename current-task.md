
Always read these files in each session:
- [describe the app](./user-story.md)
- [how to design and develop](./coding-rules.md)
- [what have been decided](./app-architecture.md)

# Current task

**Replace viz.js with `ts-graphviz` + `dagre`.** The design is proven in
[`research-lab/ast/readme.md`](research-lab/ast/readme.md) — story, types, and a
working CLI over both example files. This plan brings it into `src/`.

The prize is not the swap, it is what the swap deletes: the statistical recovery
of DOT defaults, the coordinate bucketing, and a 2.5 MB WASM payload.

```
today                          after (Session 1 actuals, comments included)
  vizer.ts            16         (deleted)
  diagram-bagger.ts  239         graphviz-ast.ts   130
  css-bagger.ts      275         styles.ts          71  + model.ts 88
  layout-framer.ts    63         layout-framer.ts  ~35   (bucketing dies)
                                 points.ts          41
                                 dagre-layout.ts    96
  ─────────────────────          ─────────────────────
                     593                           426 + ~35
  dist/index.js     2.5 MB       expect < 300 KB
```

The two walls came in slightly over the projection, all of it comment: §3.1's
parallel-edge ids and label escapes were missing from the lab and had to be
written (see the archive).

**Architecture and types are already rewritten to the target**, so the document
leads the code for the length of this task — which is the intended direction, not
drift. Session 4 closes the gap and re-checks every claim.

---

**Session 1 is done** — `src/dot/` holds both walls and their three readings,
unwired, and `src/types.ts` holds the new shapes. The record, the two decisions it
settled and the bug it found are in [`docs/archive.md`](docs/archive.md).

---

## Session 2 — redraw changes hands

- `Workbench.redraw` builds a `GraphvizAst`, then asks it for the three answers
  and hands the `PointGraph` to `DagreLayout`.
- Delete `vizer.ts`, `diagram-bagger.ts`, `css-bagger.ts` — and with them
  `VizJson`, `Node`, `Edge`, `Cluster`, `VizModel`, `VizLayout` and the `Vizer` /
  `Diagram` verbs that carry them. Session 1 renamed the last two rather than
  the new shapes, so nothing is renamed back; it is all deletion.
- `layout-framer.ts` takes `Positions` instead of reading `pos`: the `AXES` map,
  the 2-point tolerance and `bucket()` all go. Ranks arrive as integers and
  `order` is already correct, so framing is a group-and-emit.
- `node-shaper.ts` reads `DiagramNode`'s named fields rather than an `attrs` bag.
- Rewrite the five tests that name viz: `model-identity`, `base-css`,
  `record-shape`, `smart-connectors`, `ui-integration`.
- Drop `@viz-js/viz` from dependencies; promote `@ts-graphviz/ast` and
  `@dagrejs/dagre` from dev to runtime.

**Decide here: who emits the `:root` token block.** Nothing does. `example-1` is
pure markup and derives *no* rules at all, yet §3.2 and the story both say a bare
DOT derives the token block, which the old `css-bagger` built in a preamble. It is
**not** the reader's — a reader may not invent a value, and §3.2's "derived rules
never invent a colour" is the same law from the other side. So either the theme
already carries those tokens and the sentence is wrong, or the `Stylist` owns a
preamble and §3.2 should say so. Check `theme/basic-theme.json` first: if the
tokens are already there at source `0`, the honest fix is to delete the claim.

**Done when** both suites are green, no file imports viz, and a redraw of both
examples is inspected in the browser — this is the session where the picture
visibly moves, so look at it.

## Session 3 — harvest

- Measure `dist/index.js` and Export HTML. Both should fall by an order of
  magnitude; record the real numbers.
- **V6 dies** (Export HTML was 3.4 MB because it carried viz.js).
- **M4 dies** — its whole point was provenance, which `styles.ts` now has. What
  remains of it is only "our own layout maths instead of dagre", which is a
  separate, smaller, optional question. Say so in `docs/archive.md` rather than
  leaving a debt tag pointing at finished work.
- Delete `research-lab/ast/` code once `src/dot/` supersedes it, keeping
  `readme.md` as the design document it is.

## Session 4 — the files agree

- Re-read `app-architecture.md` against the code that now exists and fix every
  claim that drifted, including the stale ones this task already found (below).
- **`user-story.md` has two known drifts**, both from the reader swap: it still
  says a sanitized id colliding with another **throws**, which §3.1 deliberately
  dropped in favour of the bare space→underscore, and one passage still describes
  a rank as recovered by sorting on an axis and opening a bucket at a gap, which
  `Positions` retired. It gets the brief version, no duplication of the readme.
- `coding-rules.md` carries the story → types → architecture → code loop.
- Closing ceremony: archive, clean desk, canary, commit.

---

## Problems found, which the plan does not silently absorb

**1. Unitless lengths reaching CSS — settled at Session 1.** A bare number gains
`px` in `styles.ts`, and the premise was probed rather than remembered: the
browser suite now drives a `font-size: 12` row and watches CSSOM refuse it, then
the same number with a unit and watches it land. So `#horizon`'s `fontsize=12`
paints for the first time. `width` and `height` kept their mappings, since one
numeric test serves every length; §3.1 carries the correction and §3.2 the
registry line.

**2. `PointGraph` drops edge weights, and `example-2` tunes layout with them.**
It uses `weight=0` twice, `weight=100`, `constraint=false` and a graph-level
`concentrate=true`. Today those steer Graphviz. The design says layout gets no
weights, so the picture will differ by more than "same algorithm family" implies.
Ranks matched exactly in the lab, so the *partition* survives; it is ordering
within a rank that will move. If it looks wrong in Session 2, the fix is to let
`Arrow` carry an optional `weight` and `minlen` — those are structure, not style,
so they belong in the point graph and it stays honest.

**3. Anonymous subgraph names change**, `%1` → `subgraph_1`, and it is now under
test both ways round. Any saved style naming `.subgraph_N` in the old form
breaks. No verb loads a style document today (S11), so this costs nothing now and
would cost something later.

**4. Ports are dropped.** `a:p1:n -> b` keeps the node and discards the port, as
today. Noted, not fixed.

---

## For Later

### The refactor pass over the rest of `src/`

Deferred at Session 3 of the previous task and still open, though **Session 2
above eats a good part of it**: `layout-framer` loses its bucketing, `node-shaper`
loses its attribute bag, and two 250-line baggers leave the tree.

What it does not touch, and what still wants a tidy: `app.css`'s `.annotations`
block is 23 lines and should be 8, three of its five class hooks exist only to
carry a width, `FIELD` / `field()` lose two columns with them, and `mark()`'s
offset chain is five lines doing two lines' work. Plus the open question of
comment density across the whole tree, which wants one answer rather than a file
at a time.

### Two design threads still open

- **Drop SolidJS for plain TS.** Five components, one enum, two small lists, one
  dialog — and §5 forbids the reactivity a framework is for. Second choice is
  `lit-html` alone; `LitElement`'s value is shadow DOM, which we rejected.
- **Emit HTML by element instead of by string.** Only worth doing in the same pass
  as the above. The standalone half — collapsing the two disagreeing HTML escapers
  into one — is worth doing regardless.

---

## Risks

- **`bun add` and `bun run test:browser` both need `dangerously_disable_sandbox`.**
  The sandbox refuses the install tempdir (`EPERM`) and the port 3101 bind
  (`EADDRINUSE`); neither is a real conflict, and `lsof` shows nothing listening.
- **That note has a real-process sibling.** A dev server left running holds port
  3000 for real, and `build/dev.ts` bundles per request from a process that
  predates your `bun add` — so it serves a 500 naming the new dependency while
  `bun run build` succeeds from the same tree. Kill and restart it.
- **A throw inside a browser check stage is silent.** The run stops and the report
  keeps the last published stage. Reach for a temporary
  `.catch((e) => check("DEBUG", false, e.stack))` at the call site.
- **`git push` needs the sandbox disabled too** — the proxy answers
  `CONNECT tunnel failed, response 403`, which reads like credentials and is not.
- **The tree often holds uncommitted WIP.** A suite that turns red mid-session may
  be the user's edit rather than yours. Say which.
