
Always read these files in each session:
- [describe the app](./user-story.md)
- [how to design and develop](./coding-rules.md)
- [what have been decided](./app-architecture.md)

# Current task

Sessions 1 and 2 of the viz-replacement plan are done and in
[`docs/archive.md`](docs/archive.md) (archive Sessions 6 and 7). The walls are
live, the three viz workers and `@viz-js/viz` are gone, both suites are green,
both examples redraw. Next is harvest, then the files agree.

---

## Session 3 — harvest

- Measure `dist/index.js` and Export HTML. Both should fall by an order of
  magnitude; record the real numbers, do not invent them.
- **V6 dies** (Export HTML was 3.4 MB because it carried viz.js).
- **M4 dies** — its whole point was provenance, which `styles.ts` now has. What
  remains of it is only "our own layout maths instead of dagre", which is a
  separate, smaller, optional question. Say so in `docs/archive.md` rather than
  leaving a debt tag pointing at finished work.
- Delete `research-lab/ast/` code once `src/dot/` supersedes it, keeping
  `readme.md` as the design document it is. Drop the `ast-layout` script from
  `package.json` with the lab CLI.

## Session 4 — the files agree

- Re-read `app-architecture.md` against the code that now exists and fix every
  claim that drifted, including the stale ones this task already found (below).
- **`user-story.md` has one known drift**: it still says a sanitized id colliding
  with another **throws**, which §3.1 deliberately dropped in favour of the bare
  space→underscore. A second was suspected and checked: the rank passage is
  already correctly in the past tense, so there is nothing to fix there. It gets
  the brief version, no duplication of the readme.
- **The one sanctioned `try/catch` is still unwired.** The story and §5 say
  malformed DOT shows the message and leaves the last picture standing;
  `Engine.redraw` currently lets parse throw.
- **`README.md` still describes `Vizer` / `renderJSON` / `@viz-js/viz`.** Sync it
  to the live pipeline, or delete the stale how-it-works block.
- `coding-rules.md` already carries the story → types → architecture → code loop.
- Closing ceremony: archive, clean desk, canary, commit.

---

## Problems found, which the plan does not silently absorb

**2. `PointGraph` drops edge weights, and `example-2` tunes layout with them.**
It uses `weight=0` twice, `weight=100`, `constraint=false` and a graph-level
`concentrate=true`. Session 2 inspected the picture: the rank partition held
and no weights were added. Leave them off unless a later look says the order
inside a rank is wrong. The honest fix then is optional `weight` and `minlen`
on `Arrow` — those are structure, not style.

**3. Anonymous subgraph names change**, `%1` → `subgraph_1`, and it is now under
test both ways round. Any saved style naming `.subgraph_N` in the old form
breaks. No verb loads a style document today (S11), so this costs nothing now and
would cost something later.

**4. Ports are dropped.** `a:p1:n -> b` keeps the node and discards the port, as
today. Noted, not fixed.

---

## For Later

### The refactor pass over the rest of `src/`

Session 2 ate the baggers, the bucketing and the attribute bag. What it does
not touch, and what still wants a tidy: `app.css`'s `.annotations` block is 23
lines and should be 8, three of its five class hooks exist only to carry a
width, `FIELD` / `field()` lose two columns with them, and `mark()`'s offset
chain is five lines doing two lines' work. Plus the open question of comment
density across the whole tree, which wants one answer rather than a file at a
time.

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
- **A dev server left running holds port 3000 for real**, and `build/dev.ts`
  bundles per request from a process that predates your `bun add` — so it serves
  a 500 naming the new dependency while `bun run build` succeeds from the same
  tree. Kill and restart it.
- **A throw inside a browser check stage is silent.** The run stops and the report
  keeps the last published stage. Reach for a temporary
  `.catch((e) => check("DEBUG", false, e.stack))` at the call site.
- **`git push` needs the sandbox disabled too** — the proxy answers
  `CONNECT tunnel failed, response 403`, which reads like credentials and is not.
- **The tree often holds uncommitted WIP.** A suite that turns red mid-session may
  be the user's edit rather than yours. Say which.
