
# Current task

## Next: the collapsible aside panel

The last feature before the second release. The right-hand `aside` should be able
to shrink away and come back.

Open design questions, from the earlier round:

- **How to bring it back once hidden.** A button needs somewhere to live when the
  panel it belongs to is gone. Candidates: a sliver on the right edge, something in
  the `nav`, or a hover zone. Mouse-movement reveal and a real button are different
  decisions — a hover trigger cannot be reached from the keyboard.
- **What "hidden" means to the layout.** `main` takes the freed width, so the canvas
  gets wider and a redraw may be wanted; or the panel overlays and the canvas does
  not move. The first is more useful and more work.
- **Whether it survives a reload.**

A plan first, then the code.

---

## Answered, no work pending

- **Downloads go to the browser's download folder.** No filesystem access from a
  page, so a real working directory needs the File System Access API
  (`showDirectoryPicker`) or a packaged app. Discussed, not adopted.

---

## For Later

Wanted, nobody scheduled on it. Not debt — the app is correct without any of this.

### Replace viz.js with a DOT AST plus our own layout maths

The model records **what Graphviz computed**, never **what the author wrote**. That
is the input, not a flaw in the bagger: `node [fontsize=12]` on a subgraph is
resolved onto every member at *parse* time inside cgraph, before layout begins. So
`CssBagger` has to recover ownership statistically (`mode`, `unanimous`, `differing`
in `src/diagram/css-bagger.ts`) and is sometimes wrong.

Measured, so nobody re-derives it:

| format | keeps provenance | keeps `pos` |
|---|---|---|
| `json` (`renderJSON`) — what we use | no | yes |
| `dot_json` — "structure before layout" | **no** — identical resolution | **no** — node keys are `_gvid`, `name`, `label` only |
| `canon` | **yes** — `node [fontsize=12];` stays at subgraph scope | yes |

Two DOT files differing only in *where* `fontsize=12` was written produce
byte-identical `json` **and** byte-identical `dot_json`. Only `canon` distinguishes
them, and `canon` is DOT text, so reading it is the parser §3.5 refuses. **`dot_json`
is strictly worse than what we have** — same ambiguity, and it drops the coordinates
ranking is entirely built on. Do not suggest it again.

There is one provenance island, probed this session and worth knowing before the
AST work starts: **subgraph** objects keep their own attributes unresolved, so an
author's `rank=same` / `min` / `max` survives verbatim, next to `nodes` and a
`subgraphs` index list for nesting. Node objects, by contrast, carry no `rank` at
all — `pos` is the only trace, which is what `TOLERANCE` bucketing exists to read.
So a subgraph-scoped *rank* is already visible without an AST; a subgraph-scoped
*style default* still is not. Stated in `app-architecture.md` §2.

The direction is therefore not a better Graphviz output but a different engine: a
real DOT AST, where a subgraph-scoped default is a node in the tree and stays one,
plus our own layout maths instead of consuming `pos`.

What it buys beyond provenance: ranks we control rather than infer from coordinates,
no `TOLERANCE` bucketing, no `fixedsize` gate to tell an authored size from a
measured one, and `\N` / `\G` expansion where labels are resolved rather than as a
substitution after the fact. It would also close the declaration-scoping constraint
in §3.5, and the single-member-subgraph misattribution seen in the wild:
`horizon [fontsize=12]` landed on `.subgraph_5`, because `gcs -> {horizon}` creates a
one-member anonymous subgraph and `unanimous()` over a set of one is vacuous. (Cheap
fix if that alone ever matters: require ≥2 members before promoting to a cluster
selector. It paints identically, so it is a naming fix, not a paint fix.)

Deliberately not started: DOT has a real grammar, layered layout is genuinely hard,
and viz.js is correct today. Until an investigation happens §3.5 stands as written —
this is a direction, not permission.

Two separable halves. The AST is the smaller one and could land behind the existing
`Vizer` boundary with viz.js kept for geometry only. The layout half is the real
project: rank assignment, ordering within a rank, coordinate assignment. Spike an
existing library (ELK, dagre) before writing either.

### A saved style document has no way back in

Save Styles writes `{ theme, style }`, and `documentEntries` / `themeOf` read that
shape — but nothing in the UI calls them. There is a Load DOT button and no Load
Styles, so a file you just saved can only be reloaded by pasting it into an export
seed. The reader exists and is tested; the verb does not.

The `theme` field does nothing yet either: `theme/` ships exactly one theme and
there is no loader for a second, so the name is recorded, reported, and never
consulted. Both halves want the same missing piece — a picker, plus somewhere for a
theme to live, which is the larger half and touches the working-directory question
above.

Cost: one toolbar button and an `<input type=file>`, the way Load DOT already does
it.
