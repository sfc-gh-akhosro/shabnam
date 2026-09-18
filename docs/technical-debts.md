# Technical debts

Known gaps, deliberate deferrals, and places where the code and the law disagree.
Each entry says what is wrong, why it was left, and what closing it costs.

This file is a ledger, not a plan. Nothing here is a bug to be fixed on sight —
`app-architecture.md` and `coding-rules.md` still win. Entries get closed by
being decided, not by being tidied.

**Only open debts live here.** A paid debt leaves immediately: if its reasoning
still teaches something it moves to `docs/archive.md`, otherwise it is deleted.
Ids are permanent and never reused, so the gaps in the numbering are expected —
D2, D3, R1 are in the archive; M2, P1, P2, P3 are gone.

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

**Cost to close:** six lines in §4. The code already behaves this way, and
`annotator.ts` states it in its header.

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
the Redraw button. Weigh against §5's "`Redrawer` is the conductor."

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

### M1. `Cluster.isInvis` and `Cluster.label` are bagged and never read

§10 mandates the field, and iteration 4 decided no cluster is drawn at all — so
`style=invis` is satisfied by drawing nothing, not by a branch. The field is
honest data with no consumer.

`coding-rules.md` forbids dead code; §10 mandates the field. The conflict resolves
the moment D3 is decided: if the diagram or a cluster ever gets an element,
`isInvis` becomes the thing that decides whether to draw it.

`Cluster.label` is in the same position for the same reason: the label a cluster
carries has nowhere to be drawn while no cluster has an element. Iteration 6
closed D3 by deciding there *is* no cluster element, which makes both fields
dead in the strict sense — they are kept because §10 names them and because a
cluster element is the obvious next feature, not because anything reads them.

**Cost to close:** delete both fields, or draw a cluster. One condition either way.

### M3. Graphviz node lists are declaration-scoped, so a late cluster can be empty

In `research-lab/example-1.dot`, `cluster_consumer` comes back with **no** `nodes`
because `portal` / `runners` / `bots` were all declared inside earlier subgraphs. So
the fixture's only interesting named cluster contributes no classes to anything.

This is Graphviz behaviour, not ours, and fixing it would require reading the DOT
source — which §3.5 refuses. Permanent constraint, recorded so nobody re-derives
it. Author DOT accordingly: declare a node in the cluster you want it classed by.

**Cost to close:** not closable. Architectural boundary.

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

### S2. `style/` cannot be tested under `bun`

`bun test` has no CSSOM, so `StyleMerger` is verified in a browser and nowhere
else. Accepted deliberately: at this stage tests exist to show the thing works
now, not to guard against regressions. A DOM shim would be worse than no test —
`happy-dom` almost certainly lacks native nesting and shorthand re-collapse, the
two behaviours the worker leans on hardest, so green would mean nothing.

**Cost to close:** revisit when the feature set freezes and regression tests earn
their place. Then it is a browser-run harness, not a shim.

### S3. A declaration CSSOM does not recognise never migrates

A typo'd property is dropped at parse time, so it cannot be told apart from one
that was never written. The user's edit is lost when Redraw rewrites the tab. The
status line reports how many rules moved, so it is not silent — but it does not
say which declaration went missing.

**Cost to close:** small. Compare the declaration *count* before and after the
parse and warn on the difference.

### S4. A whole-rule migration freezes its structural declarations

When `var()` on a shorthand forces the whole-rule path, that rule's padding,
radius and border come along into My Style and stop tracking the preamble. Change
a structural value later and that one rule will not follow. Visible in the tab,
fixable by deleting a line.

**Cost to close:** would need a shorthand-to-longhand table to split the rule,
which is exactly the hand-maintained CSS knowledge we adopted CSSOM to avoid.

### S5. Concurrent redraws can interleave

`redraw` awaits a frame in the middle, so two overlapping calls can inject in
either order. Nothing in the UI triggers it today — Redraw is a button and a
shortcut, not a keystroke handler. A hot-reload feature would trigger it.

**Cost to close:** one guard flag, when something can actually cause it.
