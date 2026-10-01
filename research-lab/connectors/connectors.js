// Connectors draws orthogonal edges between .node boxes laid out in .rank columns (LR) or rows (TD).
// `canvas` is #diagram-canvas: it holds the ranks and #diagram-svg (with a <g>), and its CSS carries --gap --clear --inset --edge-radius --lane.
// Coordinates are [m, c]: m runs across ranks, c runs along a rank.
export class Connectors {
  constructor(canvas, edges) {
    this.canvas = canvas;
    this.edges = edges;
  }

  draw() {
    this.g = measure(this.canvas);
    const paths = this.polish(this.route());
    this.render(paths);
    return paths;
  }

  // Parts 1 and 2: pathways through the ranks and the port pair, chosen together. In-rank edges wait for polish.
  route() {
    return this.edges.map(([a, b]) => {
      const [from, to] = [this.g.byId.get(a), this.g.byId.get(b)];
      if (from.r === to.r) return { from, to, inRank: true };
      return from.r < to.r ? choose(this.g, from, to) : { ...choose(this.g, to, from), reversed: true };
    });
  }

  // Part 3: slide attachments, draw in-rank edges around the gutter traffic, then lane the gutters.
  polish(routes) {
    const g = this.g, across = routes.filter(rt => !rt.inRank);
    place(across);
    const paths = routes.map(rt => rt.inRank ? null : rt.reversed ? points(g, rt).reverse() : points(g, rt));
    const busy = paths.filter(Boolean).flatMap(p => p.slice(1).flatMap(([m, c], k) =>
      m === p[k][0] && g.gutters.includes(m) ? [{ m, lo: Math.min(c, p[k][1]), hi: Math.max(c, p[k][1]) }] : []));
    routes.forEach((rt, i) => { if (rt.inRank) paths[i] = inRank(g, rt.from, rt.to, busy); });
    assignLanes(g, paths, this.edges, parseFloat(getComputedStyle(this.canvas).getPropertyValue("--lane")));
    return paths;
  }

  render(paths) {
    const svg = this.canvas.querySelector("#diagram-svg"), lr = this.g.lr;
    const radius = parseFloat(getComputedStyle(this.canvas).getPropertyValue("--edge-radius"));
    const xy = ([m, c]) => (lr ? `${m},${c}` : `${c},${m}`);
    svg.setAttribute("width", this.canvas.scrollWidth);
    svg.setAttribute("height", this.canvas.scrollHeight);
    svg.querySelector("g").innerHTML = this.edges.map(([a, b], i) =>
      `<path class="edge" id="${a}_${b}" d="${rounded(paths[i], radius, xy)}"/>`).join("");
  }
}

const meet = (A, B) => A.flatMap(([a0, a1]) => B.flatMap(([b0, b1]) => {
  const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
  return lo <= hi ? [[lo, hi]] : [];
}));
const nearest = (F, t) => F.map(([lo, hi]) => Math.min(hi, Math.max(lo, t)))
  .reduce((a, b) => (Math.abs(a - t) <= Math.abs(b - t) ? a : b));
const holding = (F, p) => F.find(([lo, hi]) => lo <= p && p <= hi);

function measure(canvas) {
  const css = getComputedStyle(canvas), em = parseFloat(css.fontSize);
  const px = v => (v.endsWith("em") ? parseFloat(v) * em : parseFloat(v));
  const [gap, clear, inset] = ["--gap", "--clear", "--inset"].map(k => px(css.getPropertyValue(k).trim()));
  const lr = canvas.classList.contains("lr"), box = canvas.getBoundingClientRect();
  const ranks = [...canvas.querySelectorAll(".rank")].map((rank, r) => {
    const nodes = [...rank.querySelectorAll(".node")].map((n, i) => {
      const e = n.getBoundingClientRect();
      const [lo, hi] = (lr ? [e.top - box.top, e.bottom - box.top] : [e.left - box.left, e.right - box.left]).map(Math.round);
      const [m0, m1] = (lr ? [e.left - box.left, e.right - box.left] : [e.top - box.top, e.bottom - box.top]).map(Math.round);
      return { id: n.id, r, i, lo, hi, o: (lo + hi) / 2, m0, m1 };
    });
    const cuts = [-Infinity, ...nodes.flatMap(n => [n.lo - clear, n.hi + clear]), Infinity];
    const free = nodes.map((_, k) => [cuts[2 * k], cuts[2 * k + 1]]).concat([[cuts.at(-2), cuts.at(-1)]]).filter(([lo, hi]) => lo <= hi);
    return { nodes, free, m0: Math.min(...nodes.map(n => n.m0)), m1: Math.max(...nodes.map(n => n.m1)) };
  });
  const gutters = [ranks[0].m0 - gap / 2, ...ranks.slice(1).map((k, r) => (ranks[r].m1 + k.m0) / 2), ranks.at(-1).m1 + gap / 2];
  return { lr, ranks, gutters, gap, clear, inset, byId: new Map(ranks.flatMap(k => k.nodes).map(n => [n.id, n])) };
}

function ports(g, n, forward) {
  const d = Math.min(Math.round((n.m1 - n.m0) / 6), 24);
  const along = g.lr ? [n.m0 + d, (n.m0 + n.m1) / 2, n.m1 - d] : [(n.m0 + n.m1) / 2];
  const open = (face, free) => along.map(at => ({ face, extra: 1, free, at }));
  return [
    { face: forward ? "m1" : "m0", extra: 0, free: [[n.lo + g.inset, n.hi - g.inset]], at: forward ? n.m1 : n.m0 },
    ...(n.i === 0 ? open("lo", [[n.lo - g.gap, n.lo - g.clear]]) : []),
    ...(n.i === g.ranks[n.r].nodes.length - 1 ? open("hi", [[n.hi + g.clear, n.hi + g.gap]]) : []),
  ];
}

function stab(sets) {
  const segs = [{ k0: 0, free: sets[0] }];
  for (let k = 1; k < sets.length; k++) {
    const F = meet(segs.at(-1).free, sets[k]);
    if (F.length) segs.at(-1).free = F;
    else segs.push({ k0: k, free: sets[k] });
  }
  return segs;
}

function choose(g, from, to) {
  const tries = ports(g, from, true).flatMap(exit => ports(g, to, false).map(entry => {
    const span = [[Math.min(exit.free[0][0], entry.free[0][0]), Math.max(exit.free[0][1], entry.free[0][1])]];
    const middle = g.ranks.slice(from.r + 1, to.r).map(k => meet(k.free, span));
    const segs = stab([exit.free, ...middle, entry.free]);
    return { from, to, exit, entry, segs, extra: exit.extra + entry.extra, length: entry.at - exit.at,
      bends: 2 * (segs.length - 1) + exit.extra + entry.extra };
  })).filter(t => t.segs.every(s => s.free.length));
  return tries.sort((a, b) => a.bends - b.bends || a.extra - b.extra || a.length - b.length)[0];
}

function place(routes) {
  const faces = new Map();
  const add = (key, seg, n) => faces.set(key, [...(faces.get(key) ?? []), { seg, n }]);
  routes.forEach(rt => { add(rt.from.id + rt.exit.face, rt.segs[0], rt.from); add(rt.to.id + rt.entry.face, rt.segs.at(-1), rt.to); });
  for (const group of [...faces.values()].sort((a, b) => b.length - a.length)) {
    const F = group.reduce((F, { seg }) => meet(F, seg.p === undefined ? seg.free : [[seg.p, seg.p]]), [[-Infinity, Infinity]]);
    group.forEach(({ seg, n }) => {
      seg.shared ||= group.length > 1 && F.length > 0;
      seg.p ??= nearest(F.length ? F : seg.free, n.o);
    });
  }
  routes.forEach(rt => rt.segs.forEach((s, j) => s.p ??= nearest(s.free, rt.segs[j - 1].p)));

  const runs = routes.flatMap(rt => rt.segs.slice(1).map((b, j) => ({ rt, gutter: rt.from.r + b.k0, a: rt.segs[j], b })));
  const span = x => [Math.min(x.a.p, x.b.p), Math.max(x.a.p, x.b.p)];
  for (const x of runs) for (const y of runs) {
    if (x.gutter !== y.gutter || x.rt.from === y.rt.from || x.rt.to === y.rt.to) continue;
    if (x.a.p + x.b.p > y.a.p + y.b.p || span(x)[1] <= span(y)[0]) continue;
    const [xHi, xLo] = x.a.p > x.b.p ? [x.a, x.b] : [x.b, x.a];
    const [yLo, yHi] = y.a.p < y.b.p ? [y.a, y.b] : [y.b, y.a];
    const need = xHi.p - yLo.p;
    const slack = (s, lo, hi) => { const H = holding(s.free, s.p); return (!s.shared && H) ? [Math.max(H[0], lo), Math.min(H[1], hi)] : [s.p, s.p]; };
    const [xMin] = slack(xHi, xLo.p, xHi.p);
    const [, yMax] = slack(yLo, yLo.p, yHi.p);
    const up = xHi.p - xMin, down = yMax - yLo.p;
    if (need <= 0 || up + down <= 0) continue;
    const take = Math.min(need, up + down);
    const left = up ? Math.round(take * up / (up + down)) : 0;
    xHi.p -= left;
    yLo.p += take - left;
  }
}

function points(g, rt) {
  const { from, to, exit, entry, segs } = rt;
  const pts = exit.extra ? [[exit.at, from[exit.face]], [exit.at, segs[0].p]] : [[exit.at, segs[0].p]];
  segs.slice(1).forEach((s, j) => { const m = g.gutters[from.r + s.k0]; pts.push([m, segs[j].p], [m, s.p]); });
  pts.push(...(entry.extra ? [[entry.at, segs.at(-1).p], [entry.at, to[entry.face]]] : [[entry.at, segs.at(-1).p]]));
  return pts.filter((p, k) => !k || p[0] !== pts[k - 1][0] || p[1] !== pts[k - 1][1]);
}

function inRank(g, a, b, busy) {
  if (a.i > b.i) return inRank(g, b, a, busy).reverse();
  if (b.i === a.i + 1) {
    const m = (Math.max(a.m0, b.m0) + Math.min(a.m1, b.m1)) / 2;
    return [[m, a.hi], [m, b.lo]];
  }
  const [before, after] = [g.gutters[a.r], g.gutters[a.r + 1]];
  const load = m => busy.filter(s => s.m === m && s.lo < b.o && a.o < s.hi).length;
  return load(before) < load(after)
    ? [[a.m0, a.o], [before, a.o], [before, b.o], [b.m0, b.o]]
    : [[a.m1, a.o], [after, a.o], [after, b.o], [b.m1, b.o]];
}

function assignLanes(g, paths, edges, lane) {
  const runs = paths.flatMap((p, e) => p.slice(1, -2).map((_, j) => {
    const k = j + 1, [a, b] = [p[k], p[k + 1]];
    return { a, b, m: a[0], from: edges[e][0], to: edges[e][1], top: Math.min(a[1], b[1]), bottom: Math.max(a[1], b[1]),
      legs: [{ c: a[1], side: Math.sign(p[k - 1][0] - a[0]) }, { c: b[1], side: Math.sign(p[k + 2][0] - b[0]) }] };
  })).filter(r => r.a[0] === r.b[0] && r.a[1] !== r.b[1] && g.gutters.includes(r.m));
  const rivals = (x, y) => x.top < y.bottom && y.top < x.bottom;
  const within = (c, r) => r.top < c && c < r.bottom;
  const crossings = (x, y) => x.legs.filter(e => e.side > 0 && within(e.c, y)).length
                            + y.legs.filter(e => e.side < 0 && within(e.c, x)).length;
  for (const m of g.gutters) {
    let sets = [];
    for (const r of runs.filter(r => r.m === m)) {
      const mine = sets.filter(set => set.some(s => s.from === r.from || s.to === r.to));
      sets = [...sets.filter(set => !mine.includes(set)), [r, ...mine.flat()]];
    }
    const groups = sets.map(set => ({ runs: set, top: Math.min(...set.map(r => r.top)),
      bottom: Math.max(...set.map(r => r.bottom)), legs: set.flatMap(r => r.legs) }));
    groups.forEach(x => x.key = groups.filter(y => y !== x && rivals(x, y)).reduce((k, y) => k + crossings(x, y) - crossings(y, x), 0));
    groups.sort((x, y) => x.key - y.key || x.top - y.top);
    groups.forEach((x, i) => x.lane = 1 + Math.max(-1, ...groups.slice(0, i).filter(y => rivals(y, x)).map(y => y.lane)));
    const count = 1 + Math.max(-1, ...groups.map(x => x.lane));
    groups.forEach(x => x.runs.forEach(r => r.a[0] = r.b[0] = m + (x.lane - (count - 1) / 2) * lane));
  }
}

function rounded(pts, radius, xy) {
  const d = [`M${xy(pts[0])}`];
  for (let k = 1; k < pts.length - 1; k++) {
    const [p, q, s] = [pts[k - 1], pts[k], pts[k + 1]];
    const r = Math.min(radius, Math.hypot(q[0] - p[0], q[1] - p[1]) / 2, Math.hypot(s[0] - q[0], s[1] - q[1]) / 2);
    const toward = (from, to) => { const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
      return [from[0] + (to[0] - from[0]) * r / len, from[1] + (to[1] - from[1]) * r / len]; };
    d.push(`L${xy(toward(q, p))}`, `Q${xy(q)} ${xy(toward(q, s))}`);
  }
  d.push(`L${xy(pts.at(-1))}`);
  return d.join(" ");
}
