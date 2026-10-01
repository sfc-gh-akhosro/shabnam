# Connectors

How the diagram gets its edges. It began as a DOM lab page, and keeps that
page's names; the 12-edge fixture it was proved on is the parity test in
`test/connectors.test.ts`.

---

## How a draw gets its edges

`Diagram.draw()` does this, in order:

1. **Layout.** Graphviz says which nodes are in which rank, in order: `ranks`.
2. **Paint.** The node divs go on the page.
3. **Measure.** `Diagram` reads each painted node's box — id, left, top,
   width, height: `boxes`. A node that does not paint (`.invis`, 0×0) is left
   out here, and so is any edge that touches one.
4. **Route.** `Diagram` hands `ranks`, `boxes` and the model's `edges` to
   `Connectors`, and gets back one SVG path string per edge, in order.
5. **Draw.** `Diagram` gives those strings to the painter; `EdgeDrawer` writes
   each one as `<path d="…">` in the connector layer.

`Connectors` never touches the DOM. Boxes and edges in, path strings out.

### Inside `Connectors`

One code file, `connectors.ts`, has the class `Connectors`, which implements
the `BoxConnectors` interface using the `Box[]` and `DiagramEdge[]` it
receives.

How it is used: `Diagram.draw()` prepares the data — `ranks`, `boxes`,
`edges` — calls `connectors.route(...)` to get one SVG path per edge, and
feeds those to the painter to draw.

```ts
interface BoxConnectors {
  route(ranks: Ranks, boxes: Box[], edges: DiagramEdge[]): string[];  // one `d` per edge
}

class Connectors implements BoxConnectors {
  constructor(rules: ConnectorRules)
  route(ranks, boxes, edges): string[]     // public: measure → pick → polish → rounded
  // private steps:
  //   measure(ranks, boxes, rules): Grid   boxes → { id, r, i, lo, hi, o, m0, m1 } per node
  //   pick(): Route[]                       pathways + ports (parts 1, 2)
  //   polish(routes): Point[][]             part 3
}
```

`ranks` stays an argument: which nodes share a rank is Graphviz's answer, and
reading it back from box positions is a guess (it is what broke the last
port).

Where the lab page read and wrote the DOM, this class takes and returns data:

- **`measure()`** reads `boxes`: each node becomes `{ id, r, i, lo, hi, o,
  m0, m1 }` by arithmetic on left, top, width and height. Whether ranks run
  left-right (LR) or top-down (TD) is read from the boxes — the rank centres
  spread along one axis — never from `rankdir`.
- **`pick()`** is the lab's `route`, renamed because `route` is now the public
  method.
- **`rounded()`** returns the path strings the lab wrote into the SVG.

`rules` are numbers, each its own, none derived from another. `Diagram` reads
them from CSS tokens on `#diagram-canvas`:

| rule | token | used for | theme |
|---|---|---|---|
| `gap` | `--gap` | outer gutters, `gap / 2` out | 5em |
| `clear` | `--node-clearance` | grows nodes; open ports keep this far | 12px |
| `inset` | `--connector-inset` | how near a face's end polish may slide | 6px |
| `lane` | `--connector-lane` | lane spacing | 6px |
| `radius` | `--connector-radius` | bend radius | 6px |

---

## The world

We have **ranks**, and every node sits in one. Seen from here a rank has no
width: a node is a stretch on the **order axis** (up-down in LR) from `lo` to
`hi`, with its middle `o`, and it sits on the **rank axis** from `m0` to `m1`,
because nodes in one rank can differ in width. `i` is its order in the rank,
`r` its rank.

- **Gutters** run between ranks, along them (up-down in LR, like a house's
  gutters). Inside, a gutter is the midpoint between two neighbouring ranks'
  outer faces. Outside, the first sits `gap / 2` before the first rank and the
  last `gap / 2` after the last. A gutter is always free.
- **Pathways** run across ranks, through the gaps between nodes (left-right in
  LR). Every node grows by `clear` at both ends of the order axis before the
  gaps are cut, so a connector never grazes a node. A rank's pathways are its
  `free` intervals.

Coordinates are `[m, c]`: `m` across ranks, `c` along a rank. They become
`x,y` only when the path string is written.

Routing is three parts.

## Part 1 — find the pathways

Going from rank 1 to rank 4, a route is just the pathway it takes through each
middle rank. We only go forward, toward the head, so the question is only how
few pathways we can get away with. Fewer pathways is fewer bends; the
beginning and the end are part 2's job.

`stab` walks from tail to head, intersecting (`meet`) each rank's free set
with the one before while something is left, and starting a new segment
(`segs`) when nothing is. Each new segment is one jog — two bends — in the
gutter before it. Only pathways inside the span of the two ports count.

Adjacent ranks need no pathway. In-rank pairs wait for part 3.

## Part 2 — choose the ports

- Every node offers its **directional port**: the centre of its face toward
  the other end (`e` out, `w` in, in LR). It is a point while ports are
  chosen.
- The first node of a rank also offers its **open side** — the one with
  nothing beyond it — and so does the last. In LR that is three points along
  the face (`nw n ne`, or `sw s se`), inset `min(round(depth / 6), 24)` from
  its ends; in TD one, the middle. An open port runs out as far as it needs,
  never closer than `clear`: `(−∞, lo − clear]` before the node, or
  `[hi + clear, ∞)` after it. It costs one `extra` bend.

`choose` tries every exit × every entry and keeps a pair only if every segment
has a pathway. The pair wins by, in order:

1. fewer bends;
2. directional ports (fewer `extra`);
3. the shorter path.

**A shared bend is free.** Edges are chosen in DOT order. A bend an earlier
edge already makes — same node, same side, same port, same gutter — costs the
next edge nothing, so two edges leaving one side together count their common
corner once. `place` then pins them to one point, and the corner is drawn
once.

If no pair is clear there is no fallback: it throws, and we look at the
layout.

Ports are fixed only while choosing. Once a pair wins, a directional end gets
its whole face back (`side`, minus `inset` at each end) for part 3; with
nothing to avoid, it still lands at the centre.

## Part 3 — polish

- **Slide.** `place` puts every attachment on one face of a node at the point
  nearest the node's middle that all of them allow. Then two runs crossing in
  a gutter can often miss each other by moving an attachment along its side —
  bring one entry down and the other exit up (`gcs_horizon` / `bq_runtime`) —
  with no new lane.
- **In-rank.** Neighbours join centre to centre, with a jog halfway between
  them if their centres do not line up. Others go round, side centre to side
  centre, through the gutter before or after the rank that carries fewer runs
  over the pair — a `[` or a `]`.
- **Lanes.** `assignLanes`: in each gutter, runs that share a tail or a head
  are one group. Groups that still overlap get neighbouring lanes, `lane`
  apart, ordered to cross as little as possible and centred on the gutter.
- **Radius.** `rounded` rounds every bend by `radius`, clamped to half the
  shorter segment, and writes the path string.

---

## The types

- `BoxConnectors` — the interface: `route(ranks, boxes, edges): string[]`.
- `Connectors` — the class that implements it: `constructor(rules)`.
- `ConnectorRules` — `{ gap, clear, inset, lane, radius }` in px. New, in `types.ts`.
- `Ranks`, `Box`, `DiagramEdge` — already in `src/types.ts`, unchanged.

The lab's inner records stay inside `connectors.ts` with their lab names.
