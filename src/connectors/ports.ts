// Part 2 — the ports. Every exit is tried against every entry over the
// pathways between them; the pair wins by fewer bends, then directional, then
// shorter. With no clear pair, the fallback still draws.

import { type Grid, meet, stab } from "./pathways.ts";
import type * as C from "./types.ts";

/** The best route from `from` to `to`, `from` in the lower rank. */
export function choose(g: Grid, from: C.Spot, to: C.Spot, reversed: boolean): C.Route {
  const tries = offered(g, from, true).flatMap((exit) =>
    offered(g, to, false).map((entry) => {
      const span: C.Gap[] = [[Math.min(exit.gaps[0]![0], entry.gaps[0]![0]), Math.max(exit.gaps[0]![1], entry.gaps[0]![1])]];
      const middle = g.ranks.slice(from.rank + 1, to.rank).map((rank) => meet(rank.free, span));
      const bands = stab([exit.gaps, ...middle, entry.gaps]);
      const open = Number(exit.open) + Number(entry.open);
      return { route: { from, to, exit, entry, bands, reversed }, open, bends: 2 * (bands.length - 1) + open, length: entry.at - exit.at };
    }),
  );
  const clear = tries.filter((t) => t.route.bands.every((band) => band.free.length));
  const best = clear.sort((a, b) => a.bends - b.bends || a.open - b.open || a.length - b.length)[0];
  return best ? best.route : fallback(g, from, to, reversed);
}

// The directional pair, straight if their faces overlap, else one jog in the
// head's gutter. The middle ranks are ignored: an edge always draws.
function fallback(g: Grid, from: C.Spot, to: C.Spot, reversed: boolean): C.Route {
  const [exit, entry] = [offered(g, from, true)[0]!, offered(g, to, false)[0]!];
  const both = meet(exit.gaps, entry.gaps);
  const bands: C.Band[] = both.length
    ? [{ k0: 0, free: both }]
    : [{ k0: 0, free: exit.gaps }, { k0: to.rank - from.rank, free: entry.gaps }];
  return { from, to, exit, entry, bands, reversed };
}

// The directional port first, then the open sides a rank's first and last
// nodes have: three along the face in LR, one in the middle in TD. An open
// port runs in a corridor one clearance wide, one clearance out.
function offered(g: Grid, n: C.Spot, forward: boolean): C.Port[] {
  const { clearance, inset } = g.rules;
  const d = Math.min(Math.round((n.m1 - n.m0) / 6), 24);
  const along = g.lr ? [n.m0 + d, (n.m0 + n.m1) / 2, n.m1 - d] : [(n.m0 + n.m1) / 2];
  const open = (face: C.Face, gaps: C.Gap[]) => along.map((at): C.Port => ({ face, open: true, at, gaps }));
  const last = g.ranks[n.rank]!.spots.length - 1;
  return [
    { face: forward ? "m1" : "m0", open: false, at: forward ? n.m1 : n.m0, gaps: [[n.lo + inset, n.hi - inset]] },
    ...(n.order === 0 ? open("lo", [[n.lo - 2 * clearance, n.lo - clearance]]) : []),
    ...(n.order === last ? open("hi", [[n.hi + clearance, n.hi + 2 * clearance]]) : []),
  ];
}
