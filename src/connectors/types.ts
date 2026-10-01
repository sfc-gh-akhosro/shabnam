// Connectors — the story's players, with more precision. The why is
// `connectors-story.md`. Coordinates are `[m, c]`: `m` runs across ranks (the
// rank axis), `c` along a rank (the order axis).

import type { NodeId } from "../types.ts";

/** Whole pixels. */
export type Px = number;

/** One node's box in rank coordinates. `start`/`length` on the order axis,
 *  `cross`/`depth` on the rank axis (width in LR, height in TD). */
export type Placed = { rank: number; start: Px; length: Px; cross: Px; depth: Px };

/** The screen axis the ranks follow: `x` in LR and RL, `y` in TB and BT. */
export type RankAxis = "x" | "y";

export type Placement = { axis: RankAxis; nodes: Map<NodeId, Placed> };

/** `clearance` grows nodes and keeps open ports out; `inset` is the marker's
 *  room at a face; `lane` parts colliding gutter runs; `radius` rounds bends. */
export type ConnectorRules = { clearance: Px; inset: Px; lane: Px; radius: Px };

/** Tail and head. A `DiagramEdge` fits. */
export type Link = { from: NodeId; to: NodeId };

/** A free interval on the order axis. */
export type Gap = [lo: Px, hi: Px];

/** A point in rank coordinates. */
export type RankPoint = [m: Px, c: Px];

/** A placed node, as the router reads it: its order in the rank, its ends on
 *  the order axis (`lo`, `hi`, `mid`), and its faces on the rank axis. */
export type Spot = { id: NodeId; rank: number; order: number; lo: Px; hi: Px; mid: Px; m0: Px; m1: Px };

/** Which face of a spot a port sits on: a rank-axis face, or an open side. */
export type Face = "m0" | "m1" | "lo" | "hi";

/** Where a connector leaves or arrives: `at` on the rank axis, and the gaps
 *  its attachment may slide in. `open` is an open-side port. */
export type Port = { face: Face; open: boolean; at: Px; gaps: Gap[] };

/** One stretch of a route that runs at one `c`, from rank offset `k0` on.
 *  `p` is that `c` once chosen; `shared` pins it for a face's group. */
export type Band = { k0: number; free: Gap[]; p?: Px; shared?: boolean };

/** A link's ports and bands, always tail rank ≤ head rank; `reversed` turns
 *  the points back. */
export type Route = { from: Spot; to: Spot; exit: Port; entry: Port; bands: Band[]; reversed: boolean };

export interface Connectors {
  /** One `d` per link, in order: parallel edges share an id. */
  paths(links: Link[]): string[];
}
