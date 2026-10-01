# Connectors

The story of how an edge finds its way, told from the router's chair. The lab
that proved it is `research-lab/connectors/`; this package is that lab without
the DOM.

---

## The story

The layout is simple. We have **ranks**, and every node sits in one. Seen from
here a rank has no width: a node is a stretch on the **order axis** (up-down in
`rankdir=LR`) with a **start** and a **length**, plus where it sits on the
**rank axis** (its **cross** and **depth**), because nodes in one rank can
differ in width and alignment.

Two words carry the whole design:

- **Gutters** run between ranks, along them (up-down in LR, like a house's
  gutters). A gutter is the midpoint between two neighbouring ranks' outer
  edges. It is always free.
- **Pathways** run across ranks, through the gaps between nodes (left-right in
  LR). Every node grows by `--node-clearance` at both ends of the order axis
  before the gaps are cut, so a connector never grazes a node. Margins and gaps
  are space for connectors; the grown box is not.

Routing is three parts.

### Part 1 — find the pathways

Going from rank 1 to rank 4, a route is just the pathway it takes through each
middle rank. During this part we only go forward, toward the head, so there is
no distance to compare between solutions: the question is only how few
pathways we can get away with. Fewer pathways is fewer bends — the beginning
and the end are part 2's job. Adjacent ranks need no pathway at all, and
in-rank pairs wait for the polish.

### Part 2 — choose the ports

With the pathways known, pick where to leave and where to arrive.

- Every node offers its **directional port**: the middle of its face toward
  the other end.
- The first and last node of a rank also offer their **open side**, the one
  with nothing beyond it: three positions in LR (`nw n ne`, or `sw s se`),
  one middle port in TD.

The pair wins by, in order:

1. fewer bends;
2. directional ports;
3. the shorter path.

### Part 3 — polish

- **Slide.** Two connectors crossing in a gutter can often miss each other by
  moving an attachment along its side — bring one entry down and the other
  exit up — with no new lane.
- **In-rank.** Neighbours draw straight inside the rank; others go round
  through the emptier of the two gutters.
- **Lanes.** Connectors that share neither tail nor head and still collide in
  a gutter get neighbouring lanes, `--connector-lane` apart.
- **Radius.** Every bend rounds by `--connector-radius`. That is it.

An edge always draws: a missing edge is a lie about the architecture.

---

## The design

- **Placement.** `Connectors.place(ranks, boxes)` is the only code that knows
  boxes. The rank axis is the one the rank centres spread along; ranks are
  sorted along it and nodes by `start`, so BT and RL are not special. A node
  that does not paint (`.invis` is `display: none`) measures 0×0 at the
  origin; it is not placed, and an edge touching it gets an empty `d` — there
  is nothing to join. That is the one edge that does not draw.
- **Pathways: free gaps + greedy stabbing.** Each rank's free set is the
  complement of its grown nodes. Walking from tail to head we intersect free
  sets while the intersection is non-empty and start a new band when it
  empties; each new band is one jog, two bends, in the gutter before it.
- **Ports: the table and the three-key sort.** Every exit × every entry is
  tried; a pair is kept only if every band is non-empty, then sorted by bends,
  then by how many open ports it uses, then by `entry.at − exit.at`. An open
  port runs in a corridor one clearance wide, one clearance out, as in the lab; left unbounded it
  gave different routes than the lab on its own fixture.
- **Fallback.** No pair clear: the directional pair, joined straight if their
  faces overlap, else one jog in the head's gutter, ignoring the middle ranks.
- **Slide.** Attachments on one face are grouped and put at the point nearest
  the node's middle that every member allows; then gutter runs that would
  cross are pulled apart within their slack.
- **In-rank.** Neighbours: straight across the overlap of their depths.
  Others: round through the gutter with fewer runs over the pair.
- **Lanes.** Per gutter, runs that share a tail or a head merge into one group;
  groups that overlap get lanes, ordered to cross as little as possible, and
  are centred on the gutter.
- **Outline.** Collinear points drop, bends round by the radius clamped to half
  the shorter segment, and `[m, c]` becomes `x,y` — the only place that does.

## The types

- `Px` — whole pixels.
- `Placed` — one node's box in rank coordinates: `rank, start, length, cross, depth`.
- `Placement` — the rank axis, and every node placed.
- `ConnectorRules` — clearance, inset, lane, radius.
- `Link` — `from` and `to`; a `DiagramEdge` fits.
- `Gap` — a free interval on the order axis.
- `Port` — where a connector leaves or arrives, and the gaps it may use.
- `Route` — a link's ports and bands, before it becomes points.
- `Connectors` — `paths(links)`: one `d` per link, in order.
