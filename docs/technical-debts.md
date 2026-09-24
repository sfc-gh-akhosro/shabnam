# Technical debts

Known gaps, deliberate deferrals, and places where the code and the law disagree.
Each entry says what is wrong, why it was left, and what closing it costs.

This file is a ledger, not a plan. Nothing here is a bug to be fixed on sight —
`app-architecture.md` and `coding-rules.md` still win. Entries get closed by
being decided, not by being tidied.

**Only open debts live here.** A paid debt leaves immediately: if its reasoning
still teaches something it moves to `docs/archive.md`, otherwise it is deleted.
Ids are permanent and never reused, so the gaps in the numbering are expected —
D2, D3, R1, S2 are in the archive; M2, P1, P2, P3 are gone.

---

## Documentation debt — the architecture says something the code cannot do

### D1. §1 does not say which layer owns the visible node

`app-architecture.md` §1 says the HTML layer is "in flow, measurable" and the SVG
layer draws a shell "with icon and caption inside the shell." But `#main-svg`
comes *after* `#main-html` in the skeleton, so a filled shell hides the HTML
label, and two text layers print every node twice because `caption` falls back to
`label`.

Settled with the user in iteration 4: **the HTML layer owns the visible node** —
background, border and label are real CSS on a real div. The shell is chrome
*around* that rectangle, stroke-only, so it cannot cover anything.

**Cost to close:** one paragraph in §1. The code already behaves this way.

### D4. §4 names `data-anchor` / `data-offset` but never defines them

§4's table says the HTML tab takes "Cartesian `data-anchor` / `data-offset`" and
stops there. Iteration 5 had to define the semantics to implement them:

- `data-anchor="lake"` — the centre of that node's **measured** box
- `data-anchor="120,40"` — a literal point
- `data-offset="dx,dy"` — added to either. +x right, +y down, CSS pixels.
- Both in the padding-box space of `#canvas`, the same contract the SVG layer
  states in `node-sheller.ts`
- The anchor point is the annotation's **own centre**, via
  `transform: translate(-50%, -50%)` in `app.css`, so nothing measures the
  annotation
- No `data-anchor` means no positioning — the element stays in flow

**Cost to close:** six lines in §4. The code already behaves this way (`Workbench.place`).

---

## Registry debt — the extension point exists, the entry does not

### R2. `shape=record` renders as a box, and the label keeps its braces

`SHAPE_HTML` holds exactly `box`, per §6's "out of this pass: every `shape=`."
Every node in `research-lab/example-1.dot` is `shape=record`, so the fixture
renders each one as a box whose label reads
`{Data \n Lake | {Batch | Columnar | Vectors}}` verbatim.

Correct for the iteration that shipped it, and it is why the fixture looks busy.
A `record` entry is one map entry away.

**Cost to close:** one `SHAPE_HTML` entry that splits on `|` and `{}` — note that
this is *not* a DOT parser; it reads the already-resolved `label` field, per §3.5.

### R3. `SHELL_SVG` has one entry and has never been extended

`svg/box.svg` is the only shell. The contract that adding a second one is "a file
plus one entry plus its import line" is stated but untested — the token
vocabulary (`{{x}} {{y}} {{width}} {{height}}`) has never had to serve a second
shape.

**Cost to close:** write one more shell. Cheap, and worth doing before trusting
the claim.

---

## Rendering debt — visible, accepted, bounded

### V1. `#connectors` paints over captions, and nothing in the skeleton can stop it

`paint-order: stroke` with a white halo only masks siblings drawn *earlier*.
Iteration 4's first cut grouped each caption with its own shell, and the next
node's dashed shell struck it through; `NodeSheller` now emits all shell groups
and *then* all captions, which fixes shell-over-caption.

Edge-over-caption is unfixable inside §1's two-group skeleton: `#connectors` is
the last child of `#main-svg`. Verified in a browser — "Platform Core" is
crossed by an edge line.

**Cost to close:** a third `<g>` in the §1 skeleton, i.e. an architecture change.
Or accept it, which is the current position.

### V2. A caption renders only when `caption=` was set

The Done-when list for iteration 4 says "caption falls back to label." It does —
in the model, per §3.1. But now that the HTML layer owns the text (D1), rendering
the fallback would print every label twice, so the shell draws a caption only
when the DOT asked for one.

This is the one place the code satisfies a requirement at the model level rather
than on screen. Flagged rather than hidden; overrule it if that is not what was
meant.

**Cost to close:** a decision, then one `if` either way.

### V3. Browser zoom below 100% drifts the SVG layer until the next Redraw

Zooming reflows `#main-html` while `#node-shells` and `#connectors` keep the
coordinates they were measured at, so shells and connectors visibly displace.
Expected under §3.4 — geometry is *measured*, not live — and a Redraw fixes it.

Worth knowing before someone reports it as a bug. A `ResizeObserver` on `#canvas`
that re-measures and re-injects the SVG layer would close it, and would be the
first piece of reactive machinery in the app.

**Cost to close:** small, but it adds a second trigger for the pipeline alongside
the Redraw button. Weigh against §5's "`Workbench.redraw` is the conductor."

### V4. The `icon/` files are placeholder glyphs, not real artwork

`chart.svg` is a generic info circle, `bucket.svg` a plus square, `star.svg` an
asterisk. They load, inline, and render at the right size and position — they are
just crude. They were renamed off brand-shaped filenames deliberately: generic
art under a brand's name implies an association that does not exist.

**Cost to close:** replace the files. No code.

### V5. ~~My Style cannot override an `#id` rule that Base CSS emitted~~ — **closed by decision, option 1**

**Specificity mirrors intent.** If the DOT styled one node specifically, that
is an `#id` and it is meant to be emphatic — so an id rule outranking a class
rule is the correct outcome, not a limit to engineer around. To override it,
reach for the same id in My Style: `#runtime { … }` wins on sheet order.

This is also what keeps the effects library safe: Base CSS emits no
`transform`, `animation`, `filter` or `transition`, so class-based effects
never compete with generated id rules at all. Colour and theme stay separate
from effects precisely to preserve that.

The original reasoning follows.

Found in a browser in iteration 5. With the fixture loaded,
`.diagram .node { background-color: #ffe0b2 }` in My Style recoloured every node
**except** the six carrying `#n-runtime { background-color: #ddffdd }` and
friends. An id selector outranks any class selector, so Base CSS wins.

This is CSS working exactly as specified, and it is the first real limit on
§3.2's promise that "every node already carries the right classes, so
hand-written My Style is trivial." It is trivial right up to the point where the
DOT gave one node a different fill.

Three defensible answers, and this is a decision, not a fix:

1. Keep `#id` rules and document the limit — the user reaches for `#n-runtime`
   in My Style too.
2. Demote per-object overrides to a generated class, so everything Base CSS
   emits is class-level and My Style can always win on order.
3. Emit an `#id` rule only when no class rule could have carried the value.

What is *not* an answer is `!important` anywhere in derived output.

**Cost to close:** one decision. (1) is free, (2) and (3) are contained changes
to `CssBagger.overrides`.

### V6. An export is ~3.4 MB, and that is the floor

The exported file inlines the whole bundle — viz.js wasm included — as base64,
which is ~3.4 MB for a three-node diagram. That is the price of "depends on
nothing but a browser" (§4), and base64 rather than raw text is the price of the
HTML parser not closing the script early: the bundle contains `themer.ts`, which
contains the template that writes `</script>`. Escaping it in the source did not
survive the bundler, which normalised `<\/script>` back to the literal.

Not closable without giving up standalone. Recorded so nobody "optimises" the
base64 away and reintroduces a page that dies on
`Uncaught SyntaxError: Unexpected identifier 'digraph'`.

**Cost to close:** not closable. A minified export bundle would trim it; the
wasm will not move.

---

## Model debt

### M1. ~~`Cluster.isInvis` and `Cluster.label` are bagged and never read~~ — **closed by implementation**

Both fields are now actively consumed by `NodeSheller.clusters(...)`: `Cluster.isInvis` suppresses drawing invisible clusters (`style=invis`), and `Cluster.label` renders as `.cluster-label` text atop the cluster box.

### M3. Graphviz node lists are declaration-scoped, so a late cluster can be empty

In `research-lab/example-1.dot`, `cluster_consumer` comes back with **no** `nodes`
because `portal` / `runners` / `bots` were all declared inside earlier subgraphs. So
the fixture's only interesting named cluster contributes no classes to anything.

This is Graphviz behaviour, not ours, and fixing it would require reading the DOT
source — which §3.5 refuses. Permanent constraint, recorded so nobody re-derives
it. Author DOT accordingly: declare a node in the cluster you want it classed by.

**Cost to close:** not closable. Architectural boundary.

### M4. Replace viz.js with a DOT AST plus our own maths-based layout — investigate

The model records **what Graphviz computed**, never **what the author wrote**. This
is not a bug in the bagger; it is the input. `node [fontsize=12]` on a subgraph is
resolved onto every member at *parse* time, inside cgraph, before layout begins —
so `CssBagger` has to recover ownership statistically (`mode`, `unanimous`,
`differing` in `src/diagram/css-bagger.ts`) and is sometimes wrong.

Measured, so nobody re-derives it:

| format | keeps provenance | keeps `pos` |
|---|---|---|
| `json` (`renderJSON`) — what we use | no | yes |
| `dot_json` — "structure before layout" | **no** — identical resolution | **no** — node keys are `_gvid`, `name`, `label` only |
| `canon` | **yes** — `node [fontsize=12];` stays at subgraph scope | yes |

Two DOT files that differ only in *where* `fontsize=12` was written produce
byte-identical `json` **and** byte-identical `dot_json`. Only `canon` distinguishes
them, and `canon` is DOT text, so reading it is the parser §2 forbids. `dot_json` is
strictly worse than what we have: same ambiguity, and it drops the coordinates that
ranking is entirely built on.

The intended direction is therefore not a better Graphviz output but a different
engine: **a real DOT AST**, where a subgraph-scoped default is a node in the tree
and stays one, plus **our own layout maths** instead of consuming `pos`. That would
make the model say what was assigned, which is what the whole styling story wants,
and would remove the one dependency we cannot see inside.

What it buys, beyond provenance: ranks we control rather than infer from
coordinates, no `TOLERANCE` bucketing, no
`fixedsize` gate to tell an authored size from a measured one, and a `\N` / `\G`
expansion that happens where labels are resolved rather than as a substitution
after the fact. Several existing debts are downstream of the same root: **M3**
(declaration-scoped node lists), and the single-member-subgraph misattribution
that made `horizon`'s own `fontsize=12` land on `.subgraph_5`.

Not started, and deliberately not started: DOT has a real grammar, layered layout
is genuinely hard, and viz.js is correct today. Until the investigation happens the
§2 rule stands as written — this entry is a direction, not permission.

**Cost to close:** large, and in two separable halves. The AST half is the smaller
one and could land first behind the existing `Vizer` boundary, with viz.js kept for
geometry only. The layout half is the real project: rank assignment, ordering
within a rank, and coordinate assignment. Worth a spike on an existing library
(ELK, dagre) before writing either.

---

## Process debt

### P4. The sandbox fakes `EADDRINUSE` on port 3000

Running `bun run build/dev.ts` inside the agent sandbox reports
`Failed to start server. Is port 3000 in use?` while `lsof` shows no listener and
`curl` gets connection-refused. The bind is being intercepted, not contended.
The dev server has to be started outside the sandbox for browser verification.

**Cost to close:** nothing in this repo. Recorded so the next session does not
spend a cycle hunting a phantom process.

### P5. Browser verification must not go through a subagent

Iteration 5's first verification attempt handed a click-by-click script to a
browser subagent. Every interaction became a separate approval prompt for the
user — hundreds of them — while no question was asked about anything that
actually mattered, like the export format or the anchor semantics.

The working method: drive the browser directly and read values in bulk with
`browser_evaluate`, one JSON blob per call. The whole iteration-5 Done-when list
took about a dozen calls. Set the IDE permission mode to bypass approvals first;
no file in this repo can grant that, since the gate sits above the repo.

**Cost to close:** nothing. A note about method.

---

## Style debt — opened by iterations 6 and 7

The narrative of what those iterations built is in `docs/archive.md`. These are
the parts still open.

### S1. A cluster declared after the edges gets no members

Graphviz reports `cluster_consumer` with `nodes: []` in `research-lab/example-1.dot`,
because `portal`, `runners` and `bots` were already claimed by an earlier anonymous
subgraph. The class reaches no node, so no block is emitted for it. This is M3
seen from the CSS side rather than the model side, and it is Graphviz's
declaration scoping, not ours.

**Cost to close:** nothing we should pay. Second-guessing Graphviz's own
membership lists is how we end up with a second DOT reader.

### S6. Completer parked in `temp/completer/`

CodeJar is accepted. The current-line classifier (`complete.ts`, tests, `Slot`
types) still lives in untracked `temp/completer/`. A *loose* completer may
come later. Do not put `suggestions` back on `Workbench` without a
conversation. Do not re-inline an editor.

**Cost to close:** a thin popup on top of CodeJar, or leave it in `temp/`.
S3 (static lists) and S4 (line vs caret) travel with that draft.

### S5. Concurrent redraws can interleave

`redraw` awaits a frame in the middle, so two overlapping calls can inject in
either order. Nothing in the UI triggers it today — Redraw is a button and a
shortcut, not a keystroke handler. A hot-reload feature would trigger it.

**Cost to close:** one guard flag, when something can actually cause it.

### S7. A styles row commits its selector to CSSOM unvalidated

`Stylist.addRule` ends in `sheet.insertRule`, which throws on a selector CSS
cannot parse. The rows tab keeps the mid-typing state away from it — selector and
property commit on `change`, not on keystroke — but a *finished* typo (`.`, `#`)
still reaches `insertRule` and takes the app down with a stack. That is the law's
preferred failure (§ fail loud), and the alternative is a CSS selector validator,
which is a parser we refuse.

**Cost to close:** nothing we should pay as a parser. If it becomes annoying, the
honest fix is a browser-supplied probe, not a grammar of our own.

### S9. The browser half of the suite is a second command

`bun test` covers the pure half; `bun run test:browser` launches Chrome for the
CSSOM half. They are not one command, on purpose: the browser run costs a Chrome
launch and several seconds, and `bun test` is the one that runs constantly. The
risk is the real one — a command nobody types is a test nobody runs.

The driver also hard-codes the macOS Chrome path, overridable with `CHROME=`.

The flakiness that used to live in this entry is gone — the run is deterministic
now, and why is in `docs/archive.md` under iteration 13. The short version: the
engine waited on `requestAnimationFrame`, which a virtual clock never delivers.

**Cost to close:** chaining it into `bun run test`, once we mind the seconds
less than the risk. Not a code change.

### S8. The styles row is three columns in a narrow pane

Property names are the long ones (`--horizontal-gap`, `--raised-shadow`) and they
clip mid-word at the pane's width. Every box carries a `title`, so a clipped row
is readable on hover. Widening the editor pane, or wrapping a row onto two lines,
both cost more than the annoyance is worth today.

**Cost to close:** a grid that wraps, or a resizable pane. Not urgent.

### S10. Typing over a theme rule, then deleting the row, destroys the theme rule

One book, and an accepted overwrite replaces the entry (§1). So a row you type on
a key the theme already owns — `:root, svg` → `--primary-color`, say — does not
sit *on top of* the theme's entry, it *becomes* it, at source 2. Delete that row
and the theme's value goes with it: the rule leaves the book entirely and stops
being painted. Load DOT is the way back.

This is the design, decided deliberately and written into §1 — it is what buys us
one map instead of three, no merge step, and no `plus` / `minus`. It is recorded
here because it is a trap rather than a bug: it caught this iteration's own
browser checks, which used theme-owned keys as scratch space and then wondered
why the row count fell. What *does* survive a delete is anything `@apply` still
supplies, which is why `removeRule` resolves the expansion before clearing.

**Cost to close:** not a bug to fix. If it ever needs softening, the honest shape
is a second entry per key rather than a flag — which is the three layers coming
back, so it would be a conversation about §1, not a patch.

### S11. A saved style document has no way back in

Save Styles writes `{ theme, style }`, and `documentEntries` / `themeOf` read
that shape — but nothing in the UI calls them. There is a Load DOT button and no
Load Styles, so the file you just saved can only be reloaded by pasting it into
an export seed. The reader exists and is tested; the verb does not.

Nor does the `theme` field do anything yet: `theme/` ships exactly one theme and
there is no loader for a second, so the name is recorded and reported and never
consulted. Both halves want the same missing piece — a picker, and somewhere for
a theme to live (see the working-directory options in `current-task.md`).

**Cost to close:** one toolbar button and an `<input type=file>`, the way Load
DOT already does it — plus the decision about where themes are stored, which is
the larger half.
