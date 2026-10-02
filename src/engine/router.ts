// Router: ranks, boxes and edges in, one SVG path `d` per edge out. No DOM;
// the story is `story-router.md`. Coordinates are [m, c]: m runs
// across ranks, c along a rank.

import type { DiagramEdge, EdgePath, NodeBox, NodeId, Ranks, RouteRules } from "../types.ts";
import type * as T from "../types.ts";

type Free = [lo: number, hi: number][];
type MC = [m: number, c: number];
type Face = "m0" | "m1" | "lo" | "hi";
type Node = { id: NodeId; r: number; i: number; lo: number; hi: number; o: number; m0: number; m1: number };
type Rank = { nodes: Node[]; free: Free; m0: number; m1: number };
type Grid = { lr: boolean; ranks: Rank[]; gutters: number[]; gap: number; clear: number; inset: number; byId: Map<NodeId, Node> };
type Port = { face: Face; extra: number; free: Free; side: Free; at: number };
type Seg = { k0: number; free: Free; p?: number; shared?: boolean };
type Across = { from: Node; to: Node; exit: Port; entry: Port; segs: Seg[]; extra: number; length: number; bends: number; reversed?: boolean };
type Route = Across | { from: Node; to: Node; inRank: true };
type Span = { m: number; lo: number; hi: number };

export class Router implements T.Router {
  private g!: Grid;
  private edges: [NodeId, NodeId][] = [];
  private rules!: RouteRules;

  route(ranks: Ranks, boxes: NodeBox[], edges: DiagramEdge[], rules: RouteRules): EdgePath[] {
    this.rules = rules;
    this.g = measure(ranks, boxes, rules);
    this.edges = edges.map((e) => [e.from, e.to]);
    const paths = this.polish(this.pick());
    const xy = ([m, c]: MC) => (this.g.lr ? `${m},${c}` : `${c},${m}`);
    return paths.map((p, i) => ({ edge: edges[i]!, d: rounded(p, rules.radius, xy) }));
  }

  // Parts 1 and 2: pathways through the ranks and the port pair, chosen together. In-rank edges wait for polish.
  // (Lab `route`; renamed only because `route` is the public verb here.)
  // A bend an earlier route already makes is free for the next one: `bent` holds those bends.
  private pick(): Route[] {
    const bent = new Set<string>();
    return this.edges.map(([a, b]): Route => {
      const [from, to] = [this.g.byId.get(a)!, this.g.byId.get(b)!];
      if (from.r === to.r) return { from, to, inRank: true };
      const rt = from.r < to.r ? choose(this.g, from, to, bent) : { ...choose(this.g, to, from, bent), reversed: true };
      bends(rt).forEach((k) => bent.add(k));
      return rt;
    });
  }

  // Part 3: slide attachments, draw in-rank edges around the gutter traffic, then lane the gutters.
  private polish(routes: Route[]): MC[][] {
    const g = this.g, across = routes.filter((rt): rt is Across => !("inRank" in rt));
    place(across);
    const paths = routes.map((rt) => ("inRank" in rt ? null : rt.reversed ? points(g, rt).reverse() : points(g, rt)));
    const busy = paths.filter((p): p is MC[] => p !== null).flatMap((p) => p.slice(1).flatMap(([m, c], k): Span[] =>
      m === p[k]![0] && g.gutters.includes(m) ? [{ m, lo: Math.min(c, p[k]![1]), hi: Math.max(c, p[k]![1]) }] : []));
    routes.forEach((rt, i) => { if ("inRank" in rt) paths[i] = inRank(g, rt.from, rt.to, busy); });
    assignLanes(g, paths as MC[][], this.edges, this.rules.lane);
    return paths as MC[][];
  }
}

const meet = (A: Free, B: Free): Free => A.flatMap(([a0, a1]) => B.flatMap(([b0, b1]): Free => {
  const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
  return lo <= hi ? [[lo, hi]] : [];
}));
const nearest = (F: Free, t: number) => F.map(([lo, hi]) => Math.min(hi, Math.max(lo, t)))
  .reduce((a, b) => (Math.abs(a - t) <= Math.abs(b - t) ? a : b));
const holding = (F: Free, p: number) => F.find(([lo, hi]) => lo <= p && p <= hi);

// Lab `measure`, reading boxes instead of the page. The rank axis is the one
// the rank centres spread along; ranks are sorted along it, nodes by `lo`.
function measure(painted: Ranks, boxes: NodeBox[], { gap, clear, inset }: RouteRules): Grid {
  const byBox = new Map(boxes.map((b) => [b.id, b]));
  const centre = (ids: NodeId[], x: boolean) => ids.reduce((s, id) => {
    const b = byBox.get(id)!;
    return s + (x ? b.left + b.width / 2 : b.top + b.height / 2);
  }, 0) / ids.length;
  const spread = (ids: NodeId[], x: boolean) => {
    const cs = ids.map((id) => centre([id], x));
    return Math.max(...cs) - Math.min(...cs);
  };
  const [first, last] = [painted[0]!, painted.at(-1)!];
  const lr = painted.length > 1
    ? Math.abs(centre(last, true) - centre(first, true)) >= Math.abs(centre(last, false) - centre(first, false))
    : spread(first, false) >= spread(first, true);
  const sorted = [...painted].sort((a, b) => centre(a, lr) - centre(b, lr));
  const ranks = sorted.map((ids, r): Rank => {
    const nodes = ids.map((id) => {
      const e = byBox.get(id)!;
      const [lo, hi] = (lr ? [e.top, e.top + e.height] : [e.left, e.left + e.width]).map(Math.round) as [number, number];
      const [m0, m1] = (lr ? [e.left, e.left + e.width] : [e.top, e.top + e.height]).map(Math.round) as [number, number];
      return { id, r, i: 0, lo, hi, o: (lo + hi) / 2, m0, m1 };
    }).sort((a, b) => a.lo - b.lo);
    nodes.forEach((n, i) => (n.i = i));
    const cuts = [-Infinity, ...nodes.flatMap((n) => [n.lo - clear, n.hi + clear]), Infinity];
    const free = nodes.map((_, k): [number, number] => [cuts[2 * k]!, cuts[2 * k + 1]!])
      .concat([[cuts.at(-2)!, cuts.at(-1)!]]).filter(([lo, hi]) => lo <= hi);
    return { nodes, free, m0: Math.min(...nodes.map((n) => n.m0)), m1: Math.max(...nodes.map((n) => n.m1)) };
  });
  const gutters = [ranks[0]!.m0 - gap / 2, ...ranks.slice(1).map((k, r) => (ranks[r]!.m1 + k.m0) / 2), ranks.at(-1)!.m1 + gap / 2];
  return { lr, ranks, gutters, gap, clear, inset, byId: new Map(ranks.flatMap((k) => k.nodes).map((n) => [n.id, n])) };
}

function ports(g: Grid, n: Node, forward: boolean): Port[] {
  const d = Math.min(Math.round((n.m1 - n.m0) / 6), 24);
  const along = g.lr ? [n.m0 + d, (n.m0 + n.m1) / 2, n.m1 - d] : [(n.m0 + n.m1) / 2];
  const open = (face: Face, free: Free) => along.map((at): Port => ({ face, extra: 1, free, side: free, at }));
  // Directional: the centre point while choosing; `side` is the face polish may slide along.
  // An open side runs out as far as it needs, never closer than `clear`.
  return [
    { face: forward ? "m1" : "m0", extra: 0, free: [[n.o, n.o]], side: [[n.lo + g.inset, n.hi - g.inset]], at: forward ? n.m1 : n.m0 },
    ...(n.i === 0 ? open("lo", [[-Infinity, n.lo - g.clear]]) : []),
    ...(n.i === g.ranks[n.r]!.nodes.length - 1 ? open("hi", [[n.hi + g.clear, Infinity]]) : []),
  ];
}

function stab(sets: Free[]): Seg[] {
  const segs: Seg[] = [{ k0: 0, free: sets[0]! }];
  for (let k = 1; k < sets.length; k++) {
    const F = meet(segs.at(-1)!.free, sets[k]!);
    if (F.length) segs.at(-1)!.free = F;
    else segs.push({ k0: k, free: sets[k]! });
  }
  return segs;
}

// The first bend at each end, as a key: same node, side, port and gutter is the same corner.
function bends({ from, to, exit, entry, segs }: Omit<Across, "bends">): string[] {
  const jog = segs.length > 1;
  return ([[from, exit, jog && from.r + segs[1]!.k0], [to, entry, jog && from.r + segs.at(-1)!.k0]] as [Node, Port, number | false][])
    .filter(([, port, gutter]) => port.extra || gutter !== false)
    .map(([n, port, gutter]) => `${n.id} ${port.face} ${port.at} ${port.extra ? "" : gutter}`);
}

function choose(g: Grid, from: Node, to: Node, bent: Set<string>): Across {
  const tries = ports(g, from, true).flatMap((exit) => ports(g, to, false).map((entry): Across => {
    const span: Free = [[Math.min(exit.free[0]![0], entry.free[0]![0]), Math.max(exit.free[0]![1], entry.free[0]![1])]];
    const middle = g.ranks.slice(from.r + 1, to.r).map((k) => meet(k.free, span));
    const segs = stab([exit.free, ...middle, entry.free]);
    const t = { from, to, exit, entry, segs, extra: exit.extra + entry.extra, length: entry.at - exit.at };
    return { ...t, bends: 2 * (segs.length - 1) + t.extra - bends(t).filter((k) => bent.has(k)).length };
  })).filter((t) => t.segs.every((s) => s.free.length));
  const best = tries.sort((a, b) => a.bends - b.bends || a.extra - b.extra || a.length - b.length)[0];
  if (!best) throw new Error(`no clear pathway from ${from.id} to ${to.id}`);
  // Chosen on centre points; now give polish the whole side, same segments.
  const wide = [best.exit.side, ...g.ranks.slice(from.r + 1, to.r).map((k) => k.free), best.entry.side];
  best.segs.forEach((s, j) => {
    const end = j + 1 < best.segs.length ? best.segs[j + 1]!.k0 : wide.length;
    s.free = wide.slice(s.k0, end).reduce(meet);
  });
  return best;
}

function place(routes: Across[]): void {
  const faces = new Map<string, { seg: Seg; n: Node }[]>();
  const add = (key: string, seg: Seg, n: Node) => faces.set(key, [...(faces.get(key) ?? []), { seg, n }]);
  routes.forEach((rt) => { add(rt.from.id + rt.exit.face, rt.segs[0]!, rt.from); add(rt.to.id + rt.entry.face, rt.segs.at(-1)!, rt.to); });
  for (const group of [...faces.values()].sort((a, b) => b.length - a.length)) {
    const F = group.reduce((F, { seg }) => meet(F, seg.p === undefined ? seg.free : [[seg.p, seg.p]]), [[-Infinity, Infinity]] as Free);
    group.forEach(({ seg, n }) => {
      seg.shared ||= group.length > 1 && F.length > 0;
      seg.p ??= nearest(F.length ? F : seg.free, n.o);
    });
  }
  routes.forEach((rt) => rt.segs.forEach((s, j) => (s.p ??= nearest(s.free, rt.segs[j - 1]!.p!))));

  const runs = routes.flatMap((rt) => rt.segs.slice(1).map((b, j) => ({ rt, gutter: rt.from.r + b.k0, a: rt.segs[j]!, b })));
  const span = (x: (typeof runs)[number]) => [Math.min(x.a.p!, x.b.p!), Math.max(x.a.p!, x.b.p!)] as const;
  for (const x of runs) for (const y of runs) {
    if (x.gutter !== y.gutter || x.rt.from === y.rt.from || x.rt.to === y.rt.to) continue;
    if (x.a.p! + x.b.p! > y.a.p! + y.b.p! || span(x)[1] <= span(y)[0]) continue;
    const [xHi, xLo] = x.a.p! > x.b.p! ? [x.a, x.b] : [x.b, x.a];
    const [yLo, yHi] = y.a.p! < y.b.p! ? [y.a, y.b] : [y.b, y.a];
    const need = xHi.p! - yLo.p!;
    const slack = (s: Seg, lo: number, hi: number) => { const H = holding(s.free, s.p!); return (!s.shared && H) ? [Math.max(H[0], lo), Math.min(H[1], hi)] : [s.p!, s.p!]; };
    const [xMin] = slack(xHi, xLo.p!, xHi.p!);
    const [, yMax] = slack(yLo, yLo.p!, yHi.p!);
    const up = xHi.p! - xMin!, down = yMax! - yLo.p!;
    if (need <= 0 || up + down <= 0) continue;
    const take = Math.min(need, up + down);
    const left = up ? Math.round(take * up / (up + down)) : 0;
    xHi.p! -= left;
    yLo.p! += take - left;
  }
}

function points(g: Grid, rt: Across): MC[] {
  const { from, to, exit, entry, segs } = rt;
  const pts: MC[] = exit.extra ? [[exit.at, from[exit.face]], [exit.at, segs[0]!.p!]] : [[exit.at, segs[0]!.p!]];
  segs.slice(1).forEach((s, j) => { const m = g.gutters[from.r + s.k0]!; pts.push([m, segs[j]!.p!], [m, s.p!]); });
  pts.push(...(entry.extra ? [[entry.at, segs.at(-1)!.p!], [entry.at, to[entry.face]]] as MC[] : [[entry.at, segs.at(-1)!.p!]] as MC[]));
  return pts.filter((p, k) => !k || p[0] !== pts[k - 1]![0] || p[1] !== pts[k - 1]![1]);
}

function inRank(g: Grid, a: Node, b: Node, busy: Span[]): MC[] {
  if (a.i > b.i) return inRank(g, b, a, busy).reverse();
  if (b.i === a.i + 1) {
    // Centre to centre; a jog halfway between if the centres do not line up.
    const [ma, mb, c] = [(a.m0 + a.m1) / 2, (b.m0 + b.m1) / 2, (a.hi + b.lo) / 2];
    return ma === mb ? [[ma, a.hi], [mb, b.lo]] : [[ma, a.hi], [ma, c], [mb, c], [mb, b.lo]];
  }
  const [before, after] = [g.gutters[a.r]!, g.gutters[a.r + 1]!];
  const load = (m: number) => busy.filter((s) => s.m === m && s.lo < b.o && a.o < s.hi).length;
  return load(before) < load(after)
    ? [[a.m0, a.o], [before, a.o], [before, b.o], [b.m0, b.o]]
    : [[a.m1, a.o], [after, a.o], [after, b.o], [b.m1, b.o]];
}

type Leg = { c: number; side: number };
type Run = { a: MC; b: MC; m: number; from: NodeId; to: NodeId; top: number; bottom: number; legs: Leg[] };
type Group = { runs: Run[]; top: number; bottom: number; legs: Leg[]; key?: number; lane?: number };

function assignLanes(g: Grid, paths: MC[][], edges: [NodeId, NodeId][], lane: number): void {
  const runs = paths.flatMap((p, e) => p.slice(1, -2).map((_, j): Run => {
    const k = j + 1, [a, b] = [p[k]!, p[k + 1]!];
    return { a, b, m: a[0], from: edges[e]![0], to: edges[e]![1], top: Math.min(a[1], b[1]), bottom: Math.max(a[1], b[1]),
      legs: [{ c: a[1], side: Math.sign(p[k - 1]![0] - a[0]) }, { c: b[1], side: Math.sign(p[k + 2]![0] - b[0]) }] };
  })).filter((r) => r.a[0] === r.b[0] && r.a[1] !== r.b[1] && g.gutters.includes(r.m));
  const rivals = (x: Group | Run, y: Group | Run) => x.top < y.bottom && y.top < x.bottom;
  const within = (c: number, r: Group) => r.top < c && c < r.bottom;
  const crossings = (x: Group, y: Group) => x.legs.filter((e) => e.side > 0 && within(e.c, y)).length
                                          + y.legs.filter((e) => e.side < 0 && within(e.c, x)).length;
  for (const m of g.gutters) {
    let sets: Run[][] = [];
    for (const r of runs.filter((r) => r.m === m)) {
      const mine = sets.filter((set) => set.some((s) => s.from === r.from || s.to === r.to));
      sets = [...sets.filter((set) => !mine.includes(set)), [r, ...mine.flat()]];
    }
    const groups: Group[] = sets.map((set) => ({ runs: set, top: Math.min(...set.map((r) => r.top)),
      bottom: Math.max(...set.map((r) => r.bottom)), legs: set.flatMap((r) => r.legs) }));
    groups.forEach((x) => (x.key = groups.filter((y) => y !== x && rivals(x, y)).reduce((k, y) => k + crossings(x, y) - crossings(y, x), 0)));
    groups.sort((x, y) => x.key! - y.key! || x.top - y.top);
    groups.forEach((x, i) => (x.lane = 1 + Math.max(-1, ...groups.slice(0, i).filter((y) => rivals(y, x)).map((y) => y.lane!))));
    const count = 1 + Math.max(-1, ...groups.map((x) => x.lane!));
    groups.forEach((x) => x.runs.forEach((r) => (r.a[0] = r.b[0] = m + (x.lane! - (count - 1) / 2) * lane)));
  }
}

function rounded(pts: MC[], radius: number, xy: (p: MC) => string): string {
  const d = [`M${xy(pts[0]!)}`];
  for (let k = 1; k < pts.length - 1; k++) {
    const [p, q, s] = [pts[k - 1]!, pts[k]!, pts[k + 1]!];
    const r = Math.min(radius, Math.hypot(q[0] - p[0], q[1] - p[1]) / 2, Math.hypot(s[0] - q[0], s[1] - q[1]) / 2);
    const toward = (from: MC, to: MC): MC => { const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
      return [from[0] + (to[0] - from[0]) * r / len, from[1] + (to[1] - from[1]) * r / len]; };
    d.push(`L${xy(toward(q, p))}`, `Q${xy(q)} ${xy(toward(q, s))}`);
  }
  d.push(`L${xy(pts.at(-1)!)}`);
  return d.join(" ");
}
