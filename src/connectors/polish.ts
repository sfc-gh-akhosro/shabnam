// Part 3 — polish: slide attachments so gutter runs miss, draw in-rank pairs
// round the traffic, and lane a gutter only where both ends differ.

import { type Grid, holding, meet, nearest } from "./pathways.ts";
import type * as C from "./types.ts";

/** Fix every band's `p`: one point per face that its whole group allows, then
 *  pull crossing gutter runs apart within their slack. */
export function slide(routes: C.Route[]): void {
  const faces = new Map<string, { band: C.Band; n: C.Spot }[]>();
  const add = (key: string, band: C.Band, n: C.Spot) => faces.set(key, [...(faces.get(key) ?? []), { band, n }]);
  for (const rt of routes) {
    add(rt.from.id + rt.exit.face, rt.bands[0]!, rt.from);
    add(rt.to.id + rt.entry.face, rt.bands.at(-1)!, rt.to);
  }
  for (const group of [...faces.values()].sort((a, b) => b.length - a.length)) {
    const F = group.reduce<C.Gap[]>((F, { band }) => meet(F, band.p === undefined ? band.free : [[band.p, band.p]]), [[-Infinity, Infinity]]);
    for (const { band, n } of group) {
      band.shared ||= group.length > 1 && F.length > 0;
      band.p ??= nearest(F.length ? F : band.free, n.mid);
    }
  }
  for (const rt of routes) rt.bands.forEach((band, j) => (band.p ??= nearest(band.free, rt.bands[j - 1]!.p!)));
  apart(routes);
}

type Run = { rt: C.Route; gutter: number; a: C.Band; b: C.Band };

// Two runs in one gutter that share no end and would cross: move the high end
// of one down and the low end of the other up, as far as their gaps allow.
function apart(routes: C.Route[]): void {
  const runs = routes.flatMap((rt) => rt.bands.slice(1).map((b, j): Run => ({ rt, gutter: rt.from.rank + b.k0, a: rt.bands[j]!, b })));
  const span = (x: Run) => [Math.min(x.a.p!, x.b.p!), Math.max(x.a.p!, x.b.p!)] as const;
  const slack = (s: C.Band, lo: C.Px, hi: C.Px): C.Gap => {
    const H = holding(s.free, s.p!);
    return !s.shared && H ? [Math.max(H[0], lo), Math.min(H[1], hi)] : [s.p!, s.p!];
  };
  for (const x of runs) for (const y of runs) {
    if (x.gutter !== y.gutter || x.rt.from === y.rt.from || x.rt.to === y.rt.to) continue;
    if (x.a.p! + x.b.p! > y.a.p! + y.b.p! || span(x)[1] <= span(y)[0]) continue;
    const [xHi, xLo] = x.a.p! > x.b.p! ? [x.a, x.b] : [x.b, x.a];
    const [yLo, yHi] = y.a.p! < y.b.p! ? [y.a, y.b] : [y.b, y.a];
    const need = xHi.p! - yLo.p!;
    const up = xHi.p! - slack(xHi, xLo.p!, xHi.p!)[0];
    const down = slack(yLo, yLo.p!, yHi.p!)[1] - yLo.p!;
    if (need <= 0 || up + down <= 0) continue;
    const take = Math.min(need, up + down);
    const left = up ? Math.round((take * up) / (up + down)) : 0;
    xHi.p! -= left;
    yLo.p! += take - left;
  }
}

/** A route's corners, tail to head, before any lane. */
export function points(g: Grid, rt: C.Route): C.RankPoint[] {
  const { from, to, exit, entry, bands } = rt;
  const first = bands[0]!.p!;
  const last = bands.at(-1)!.p!;
  const pts: C.RankPoint[] = exit.open ? [[exit.at, from[exit.face]], [exit.at, first]] : [[exit.at, first]];
  bands.slice(1).forEach((band, j) => {
    const m = g.gutters[from.rank + band.k0]!;
    pts.push([m, bands[j]!.p!], [m, band.p!]);
  });
  pts.push(...(entry.open ? [[entry.at, last], [entry.at, to[entry.face]]] : [[entry.at, last]]) as C.RankPoint[]);
  return pts.filter((p, k) => !k || p[0] !== pts[k - 1]![0] || p[1] !== pts[k - 1]![1]);
}

/** A gutter run already drawn: its `m` and the stretch of `c` it covers. */
export type Busy = { m: C.Px; lo: C.Px; hi: C.Px };

export function busy(g: Grid, paths: C.RankPoint[][]): Busy[] {
  return paths.flatMap((p) =>
    p.slice(1).flatMap(([m, c], k): Busy[] =>
      m === p[k]![0] && g.gutters.includes(m) ? [{ m, lo: Math.min(c, p[k]![1]), hi: Math.max(c, p[k]![1]) }] : [],
    ),
  );
}

/** Neighbours straight across the rank; others round the emptier gutter. */
export function inRank(g: Grid, a: C.Spot, b: C.Spot, traffic: Busy[]): C.RankPoint[] {
  if (a.order > b.order) return inRank(g, b, a, traffic).reverse();
  if (b.order === a.order + 1) {
    const m = (Math.max(a.m0, b.m0) + Math.min(a.m1, b.m1)) / 2;
    return [[m, a.hi], [m, b.lo]];
  }
  const [before, after] = [g.gutters[a.rank]!, g.gutters[a.rank + 1]!];
  const load = (m: C.Px) => traffic.filter((s) => s.m === m && s.lo < b.mid && a.mid < s.hi).length;
  return load(before) < load(after)
    ? [[a.m0, a.mid], [before, a.mid], [before, b.mid], [b.m0, b.mid]]
    : [[a.m1, a.mid], [after, a.mid], [after, b.mid], [b.m1, b.mid]];
}

type Leg = { c: C.Px; side: number };
type GutterRun = { a: C.RankPoint; b: C.RankPoint; m: C.Px; from: string; to: string; top: C.Px; bottom: C.Px; legs: Leg[] };
type Group = { runs: GutterRun[]; top: C.Px; bottom: C.Px; legs: Leg[]; key: number; lane: number };

/** Per gutter: runs sharing a tail or a head are one group; overlapping groups
 *  get lanes, ordered to cross least, centred on the gutter. Moves points. */
export function lanes(g: Grid, paths: C.RankPoint[][], links: C.Link[], lane: C.Px): void {
  const runs = paths.flatMap((p, e) =>
    p.slice(1, -2).map((_, j): GutterRun => {
      const k = j + 1;
      const [a, b] = [p[k]!, p[k + 1]!];
      const legs = [{ c: a[1], side: Math.sign(p[k - 1]![0] - a[0]) }, { c: b[1], side: Math.sign(p[k + 2]![0] - b[0]) }];
      return { a, b, m: a[0], from: links[e]!.from, to: links[e]!.to, top: Math.min(a[1], b[1]), bottom: Math.max(a[1], b[1]), legs };
    }),
  ).filter((r) => r.a[0] === r.b[0] && r.a[1] !== r.b[1] && g.gutters.includes(r.m));
  const rivals = (x: { top: C.Px; bottom: C.Px }, y: { top: C.Px; bottom: C.Px }) => x.top < y.bottom && y.top < x.bottom;
  const within = (c: C.Px, r: { top: C.Px; bottom: C.Px }) => r.top < c && c < r.bottom;
  const crossings = (x: Group, y: Group) =>
    x.legs.filter((l) => l.side > 0 && within(l.c, y)).length + y.legs.filter((l) => l.side < 0 && within(l.c, x)).length;
  for (const m of g.gutters) {
    let sets: GutterRun[][] = [];
    for (const r of runs.filter((r) => r.m === m)) {
      const mine = sets.filter((set) => set.some((s) => s.from === r.from || s.to === r.to));
      sets = [...sets.filter((set) => !mine.includes(set)), [r, ...mine.flat()]];
    }
    const groups = sets.map((set): Group => ({
      runs: set, top: Math.min(...set.map((r) => r.top)), bottom: Math.max(...set.map((r) => r.bottom)), legs: set.flatMap((r) => r.legs), key: 0, lane: 0,
    }));
    for (const x of groups) x.key = groups.filter((y) => y !== x && rivals(x, y)).reduce((k, y) => k + crossings(x, y) - crossings(y, x), 0);
    groups.sort((x, y) => x.key - y.key || x.top - y.top);
    groups.forEach((x, i) => (x.lane = 1 + Math.max(-1, ...groups.slice(0, i).filter((y) => rivals(y, x)).map((y) => y.lane))));
    const count = 1 + Math.max(-1, ...groups.map((x) => x.lane));
    for (const x of groups) for (const r of x.runs) r.a[0] = r.b[0] = m + (x.lane - (count - 1) / 2) * lane;
  }
}
