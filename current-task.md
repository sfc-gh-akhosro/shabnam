
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
today                          after
  vizer.ts            16         (deleted)
  diagram-bagger.ts  239         graphviz-ast.ts   ~95
  css-bagger.ts      275         styles.ts         ~56  + model.ts ~66
  layout-framer.ts    63         layout-framer.ts  ~35   (bucketing dies)
                                 points.ts         ~28
                                 dagre-layout.ts   ~67
  ─────────────────────          ─────────────────────
                     593                          ~347
  dist/index.js     2.5 MB       expect < 300 KB
```

**Architecture and types are already rewritten to the target**, so the document
leads the code for the length of this task — which is the intended direction, not
drift. Session 4 closes the gap and re-checks every claim.

---

## Session 1 — the two walls land, unwired

Move the lab into `src/dot/` and make it the app's own. Nothing calls it yet, so
the app keeps working on viz.js throughout.

- `src/types.ts` takes the new shapes: named atomic types, `DiagramModel` with no
  coordinates, `DotStyles`, `PointGraph`, `Positions`, `Written`, and the `Ast` /
  `Layout` interfaces. Keep `Box`, `ConnectorMetrics`, the style book and the tab
  types exactly as they are — they are downstream of this story and untouched by it.
- `src/dot/` gets `graphviz-ast.ts`, `model.ts`, `styles.ts`, `points.ts`,
  `dagre-layout.ts`. Six files including nothing else; `diagram/` stays put.
- Unit tests for each worker, from the two example files: selector composition,
  markup resolution (innermost wins), cumulative membership, `rank=same` held,
  ranks compacted to `0…n`.

**Done when** `bun test` is green with the new tests, the app still runs on
viz.js, and `Ast` / `Layout` each have exactly one implementation.

**Decision to make here, not later:** whether `DiagramModel.nodes` keeps a
`Map<NodeId, DiagramNode>` instead of an array. Every consumer looks a node up by
id; the array is a habit from the viz shape.

## Session 2 — redraw changes hands

- `Workbench.redraw` builds a `GraphvizAst`, then asks it for the three answers
  and hands the `PointGraph` to `DagreLayout`.
- Delete `vizer.ts`, `diagram-bagger.ts`, `css-bagger.ts`.
- `layout-framer.ts` takes `Positions` instead of reading `pos`: the `AXES` map,
  the 2-point tolerance and `bucket()` all go. Ranks arrive as integers and
  `order` is already correct, so framing is a group-and-emit.
- `node-shaper.ts` reads `DiagramNode`'s named fields rather than an `attrs` bag.
- Rewrite the five tests that name viz: `model-identity`, `base-css`,
  `record-shape`, `smart-connectors`, `ui-integration`.
- Drop `@viz-js/viz` from dependencies; promote `@ts-graphviz/ast` and
  `@dagrejs/dagre` from dev to runtime.

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
- `user-story.md` gets the brief version, no duplication of the readme.
- `coding-rules.md` carries the story → types → architecture → code loop.
- Closing ceremony: archive, clean desk, canary, commit.

---

## Problems found, which the plan does not silently absorb

**1. Unitless lengths reaching CSS — and this one is pre-existing.** `ATTR_CSS`
maps `fontsize → font-size` and `penwidth → border-width`, and Graphviz values are
bare numbers. `font-size: 12` and `border-width: 3` are **invalid CSS** — a
`<length>` needs a unit unless it is zero — so CSSOM must be refusing them today,
which means `#horizon`'s `fontsize=12` in `example-2.dot` has never once been
painted. The lab inherits the bug and I added two more mappings (`width`,
`height`) with the same flaw.

This is a genuine collision between two laws: values pass through uncorrected,
and a rule must be valid CSS. Three ways out, and it is your call:
appending a unit at translation time (a correction, so it needs saying out loud in
the architecture), dropping those attributes from the registry (size and weight
are CSS's job anyway, which the architecture already argues), or leaving them to
be refused. **My recommendation: drop `width` and `height`, and give `fontsize`
and `penwidth` units** — `pt` for the font, `px` for the border — because those
two are the units Graphviz means, and a rule nobody can see is worse than a rule
that was adjusted. Verify in the browser suite before believing me.

**2. `PointGraph` drops edge weights, and `example-2` tunes layout with them.**
It uses `weight=0` twice, `weight=100`, `constraint=false` and a graph-level
`concentrate=true`. Today those steer Graphviz. The design says layout gets no
weights, so the picture will differ by more than "same algorithm family" implies.
Ranks matched exactly in the lab, so the *partition* survives; it is ordering
within a rank that will move. If it looks wrong in Session 2, the fix is to let
`Arrow` carry an optional `weight` and `minlen` — those are structure, not style,
so they belong in the point graph and it stays honest.

**3. Anonymous subgraph names change**, `%1` → `subgraph_1`. Any saved style
naming `.subgraph_N` breaks. No verb loads a style document today (S11), so this
costs nothing now and would cost something later.

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
