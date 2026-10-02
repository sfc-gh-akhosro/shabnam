# DOT in, three answers out

A design document, written story-first. The story comes before the types, the
types come before the code, and each one is derived from the one above it.

---

## The story

We get one string of DOT. We give back three things: **what the diagram *is***,
**what the author said about how it looks**, and **where everything sits**. Three
outputs, one input, and the whole job is arranging that honestly.

`ast.parse(dot)` goes first, and it is the only thing in the codebase that reads
DOT. It hands back a tree — a `Graph` holding `Subgraph`s holding `Node`s,
`Edge`s and `AttributeList`s — and that tree is the last place a library's shape
is allowed to be visible. We walk it exactly once and keep what was written,
along with *where* it was written.

Here is the thing that decides the whole design: **the `Ast` is the hub, not a
stage in a chain.** The three outputs are siblings off it, because each one needs
something the others have already thrown away. Styles need to know *which
branch* an attribute was written on — and the moment you resolve
`node [fillcolor=coral]` onto its members, that fact is gone forever. Layout needs the opposite: the author's own graph with every size cut away. And
the diagram model needs neither; it wants identity and connection. Three
questions, one tree, no queue.

```
dot ──parse──▶ Ast ──┬──▶ DiagramModel     who exists, who connects, who belongs
                     ├──▶ DotStyles        appearance, at the branch it was written
                     └──▶ PointDot ──Layout──▶ Ranks
```

The first output, `DiagramModel`, is the semantics. Every node with its id and
its classes, every edge with its endpoints, every cluster with its members and
its nesting. A subgraph name becomes a class, a node name becomes an id, and an
edge becomes `tail_head` — identity in CSS is identity in DOT, decided here,
once, for everybody downstream. **And the model carries no coordinates at all**,
which is new: position is a different question asked of a different worker, and a
model holding both is a model with two sources of truth waiting to disagree.

The second, `DotStyles`, is one flat map: selector, property, value. A
`node [...]` at the root is `.node, .record`; the same statement inside
`cluster_a` is `.cluster_a.node, .cluster_a.record`, because a subgraph name
lives as a class on the node element and there is no wrapper to descend from.
Values pass through exactly as typed — `height=0` stays `"0"`, and nothing in
the pipeline is allowed to improve on the author.

Which raises the line that splits the first two outputs, and every attribute has
to fall on one side of it: **an attribute is either markup or appearance.**
`label`, `shape`, `icon` and `caption` decide what HTML we build, so they belong
to the model. Anything the `ATTR_CSS` registry recognises — `fillcolor`,
`penwidth`, `fontsize` — becomes a rule and belongs to the styles. Anything in
neither is not our business, and is dropped.

The two sides also disagree about *resolution*, which is the subtle half.
**Markup is resolved; appearance keeps its provenance.** A node has to know its
own shape, so `node [shape=record]` written on a cluster is pushed down onto
every member as the model is built, innermost wins. A colour must not be pushed
down, because the branch it sits on *is* the selector we want. Same tree, two
readings, and that is the whole reason an AST beats a laid-out JSON.

The third is layout, and we take away only what it must not see. After the walk,
the same tree is **trimmed**: every attribute in `SIZE` (labels, shape, width,
height, font, margin, image…) is deleted wherever it sits, `node [shape=point
width=0 height=0 label=""]` goes first, and the tree is printed back as DOT —
a `PointDot`. Graphviz lays that out and answers where each 0×0 point landed;
points of one rank share one coordinate, so `Ranks` — `NodeId[][]`, rank then
order — are read off exactly.

The trim is a deny-list on purpose. Whatever `dot` reads to rank and order —
`rank=same` or `max` or `sink`, `weight`, `minlen`, clusters, invisible edges,
declaration order — reaches it because nobody took it out. That is what dagre
could not do: it has no `rank=same`, and contracting each group into a stand-in
hid the members from its ordering (`research-lab/layout-probe/`).

Two libraries, two walls. `ts-graphviz` is visible only inside the `Parser`;
Graphviz's wasm is visible only inside the `Layout`.
Everything else talks to our own three shapes, and could not tell you what either
library is called.

---

## The types that fall out

Atomic types get names. `NodeId[][]` says what it is; `string[][]` needs a
reference open beside it.

```ts
// most simple types are string like IDs and names. Px is number

type Rankdir = "TB" | "BT" | "LR" | "RL";

// ── output 1: the semantics ──────────────────────────────────────────────

type DiagramNode = {
  id: NodeId;
  classes: SubgraphName[];   // every subgraph it is named inside, outermost first
  shape: string;             // markup, resolved from the branches above it
  label: string;
  icon: string;
  caption: string;
};

type DiagramEdge = {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  classes: SubgraphName[];
};

type DiagramCluster = {
  name: SubgraphName;
  label: string;
  isInvis: boolean;
  nodes: NodeId[];
  clusters: SubgraphName[];  // nesting
};

type DiagramModel = {
  rankdir: Rankdir;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  clusters: DiagramCluster[];
};

// ── output 2: styles 

/** selector → property → value. The selector *is* the branch it was written on. */
type DotStyles = Map<Selector, Map<Property, CssValue>>;

// ── output 3: what layout is given, and what it answers ───────────────────

/** The author's DOT, parsed, trimmed of `SIZE`, every node a 0×0 point, printed. */
type PointDot = string;

/** rank → order → node. */
type Ranks = NodeId[][];

// ── the two walls ────────────────────────────────────────────────────────

interface Parser {
  parse(dot: string): Parsed;   // { model, styles, points }
}

interface Layout {
  positions(points: PointDot): Map<NodeId, Point>;
  ranks(points: PointDot): Ranks;   // positions, grouped and sorted
}

// ── registry ─────────────────────────────────────────────────────────────

/** DOT attribute → CSS property. Absent means it is not appearance. */
type AttrCss = Map<DotAttr, Property>;
```

**Classes, and what each one walls off:**

| class | implements | quarantines | produces |
|---|---|---|---|
| `Parser` | `Parser` | `ts-graphviz` — the only DOT reader | `Parsed`: `DiagramModel`, `Style[]`, `PointDot` |
| `Layout` | `Layout` | `@hpcc-js/wasm-graphviz` — the only geometry source | `Ranks` |

Each library is visible in exactly one class, so the players table alone tells
you where a dependency could leak from.

**What deliberately isn't here.** No `VizJson` — the parsed tree never escapes
`Parser`, so there is nothing opaque to pass around. No `x` / `y` on
`DiagramNode`, because layout owns that and two sources of position is the
bug we are avoiding. No `attrs` bag on the model, because an attribute is now
either markup (a named field) or appearance (a style rule), and a bag is what you
keep when you have not decided. And no `NodeBox` — that is measured from the painted
page, a later stage than anything in this story.

---

## Where this lives now

The lab's TypeScript was deleted once the reader superseded it. This file is
the design document that outlived the experiment. The live workers are:

| file | worker |
|---|---|
| `src/types.ts` | the shared types above, completed |
| `src/engine/parser.ts` | `Parser` — one walk; the walk's record (`Written`) and its three readings: the model (markup resolved), the styles (provenance kept), the trim into `PointDot` |
| `src/engine/layout.ts` | `Layout` — `dot` on the points, then ranks |
