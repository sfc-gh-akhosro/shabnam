// Part 1 — the pathways. Each rank's free gaps are what its grown nodes leave;
// a route stabs through them, opening a new band only when the free set empties.

import type { NodeId } from "../types.ts";
import type * as C from "./types.ts";

export type Rank = { spots: C.Spot[]; free: C.Gap[]; m0: C.Px; m1: C.Px };

/** Everything the router reads: ranks in order, the gutter `m`s (one before
 *  each rank and one after the last), and every spot by id. */
export type Grid = { lr: boolean; ranks: Rank[]; gutters: C.Px[]; spots: Map<NodeId, C.Spot>; rules: C.ConnectorRules };

export function grid(placement: C.Placement, rules: C.ConnectorRules): Grid {
  const byRank = new Map<number, [NodeId, C.Placed][]>();
  for (const entry of placement.nodes) byRank.set(entry[1].rank, [...(byRank.get(entry[1].rank) ?? []), entry]);
  const ranks = [...byRank.keys()].sort((a, b) => a - b).map((key, rank) => {
    const placed = byRank.get(key)!.sort((a, b) => a[1].start - b[1].start);
    const spots = placed.map(([id, p], order): C.Spot => ({
      id, rank, order, lo: p.start, hi: p.start + p.length, mid: p.start + p.length / 2, m0: p.cross, m1: p.cross + p.depth,
    }));
    return { spots, free: free(spots, rules.clearance), m0: Math.min(...spots.map((s) => s.m0)), m1: Math.max(...spots.map((s) => s.m1)) };
  });
  const gutters = [
    ranks[0]!.m0 - rules.clearance,
    ...ranks.slice(1).map((rank, r) => (ranks[r]!.m1 + rank.m0) / 2),
    ranks.at(-1)!.m1 + rules.clearance,
  ];
  const spots = new Map(ranks.flatMap((rank) => rank.spots).map((spot) => [spot.id, spot]));
  return { lr: placement.axis === "x", ranks, gutters, spots, rules };
}

// The complement of the grown nodes, open at both ends of the rank.
function free(spots: C.Spot[], clearance: C.Px): C.Gap[] {
  const cuts = [-Infinity, ...spots.flatMap((s) => [s.lo - clearance, s.hi + clearance]), Infinity];
  const gaps = spots.map((_, k): C.Gap => [cuts[2 * k]!, cuts[2 * k + 1]!]);
  return [...gaps, [cuts.at(-2)!, cuts.at(-1)!] as C.Gap].filter(([lo, hi]) => lo <= hi);
}

/** Greedy stabbing: keep meeting the next rank's gaps; when nothing is left,
 *  that rank starts a new band. */
export function stab(sets: C.Gap[][]): C.Band[] {
  const bands: C.Band[] = [{ k0: 0, free: sets[0]! }];
  for (let k = 1; k < sets.length; k++) {
    const both = meet(bands.at(-1)!.free, sets[k]!);
    if (both.length) bands.at(-1)!.free = both;
    else bands.push({ k0: k, free: sets[k]! });
  }
  return bands;
}

export function meet(A: C.Gap[], B: C.Gap[]): C.Gap[] {
  return A.flatMap(([a0, a1]) =>
    B.flatMap(([b0, b1]): C.Gap[] => {
      const lo = Math.max(a0, b0);
      const hi = Math.min(a1, b1);
      return lo <= hi ? [[lo, hi]] : [];
    }),
  );
}

/** The point in the gaps closest to `t`. */
export function nearest(gaps: C.Gap[], t: C.Px): C.Px {
  return gaps
    .map(([lo, hi]) => Math.min(hi, Math.max(lo, t)))
    .reduce((a, b) => (Math.abs(a - t) <= Math.abs(b - t) ? a : b));
}

export function holding(gaps: C.Gap[], p: C.Px): C.Gap | undefined {
  return gaps.find(([lo, hi]) => lo <= p && p <= hi);
}
