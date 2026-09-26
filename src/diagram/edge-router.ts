// Boxes + one edge's two ends → the waypoints of an ortho snake (§3.4).
//
// The corridors are not discovered from obstacle geometry, because they are
// already there: the layout is a grid of ranks and rows, so the empty space
// between nodes is a set of lines. **Vertical corridors are the gutters between
// ranks; horizontal corridors are the gaps between rows.** A snake alternates
// between the two — out of a side, along a gutter, across a row gap, along the
// next gutter, into the destination side.
//
// That is why this is a heuristic and not a search over every obstacle edge. A
// real diagram yields on the order of eight vertical lines and twenty horizontal
// ones, so the walk is a few hundred steps; a visibility graph would be an order
// of magnitude larger to answer the same question.
//
// Pure: data in, waypoints out, no DOM (§3). Coordinates are the CSS pixels of
// node-sheller.ts's contract.

import type * as T from "../types.ts";
import { SHELL_PAD } from "./node-sheller.ts";

/** How far a route steps straight out of a box before it is allowed to turn. */
const STUB = 8;

/**
 * What a bend costs, in pixels of straightness.
 *
 * Deliberately large. A reader follows a connector by its corners, so two turns
 * saved is worth a long way round; tuning this down produces technically shorter
 * routes that are harder to trace.
 */
const TURN_COST = 240;

/** Boxes within this many pixels on an axis count as sharing a rank. */
const TOLERANCE = 2;

type Rect = { left: number; top: number; right: number; bottom: number };

/** Which way a segment runs. `""` is only the state before the first step. */
type Axis = "h" | "v" | "";

export class EdgeRouter {
  /**
   * The snake from `from` to `to`, as the points of a polyline.
   *
   * `obstacles` is every other box — the two endpoints are excluded, since a
   * route has to be allowed to touch the things it joins.
   *
   * Clearance is a preference with a floor, never a refusal (§3.4): the walk is
   * tried at the asked-for clearance, then with none, and a direct dog-leg is the
   * last resort. User CSS can always close a corridor, and a diagram missing an
   * edge is worse than one with a tight edge.
   */
  route(from: T.Box, to: T.Box, obstacles: T.Box[], clearance: number): T.Point[] {
    const axis = sameRank(from, to) ? "v" : "h";
    const [tail, head] = attach(from, to, axis);
    const [tailStub, headStub] = [step(tail, axis, from, to), step(head, axis, to, from)];

    const lines = corridors(obstacles.concat(from, to), tailStub, headStub);

    for (const inflate of [clearance, 0]) {
      const rects = obstacles.map((box) => grow(box, inflate));
      const found = walk(tailStub, headStub, lines, rects, axis);
      if (found) return [tail, ...found, head];
    }

    return [tail, tailStub, ...dogleg(tailStub, headStub, axis), headStub, head];
  }
}

// --- attachment -------------------------------------------------------------

// Perpendicular to a box side, always. Across ranks that is left/right, so the
// first and last segments are horizontal; within a rank it is top/bottom. A side
// attachment for a same-rank pair would have to leave the right edge and loop
// back to the left to get in, which is worse than the vertical it replaces.
//
// The anchor sits on the *shell*, not on the box it stands off from, so a
// connector touches what the eye reads as the edge of the node.
function attach(from: T.Box, to: T.Box, axis: Axis): [T.Point, T.Point] {
  const a = center(from);
  const b = center(to);

  if (axis === "h") {
    const way = b.x >= a.x ? 1 : -1;
    return [
      { x: a.x + way * half(from.width), y: a.y },
      { x: b.x - way * half(to.width), y: b.y },
    ];
  }
  const way = b.y >= a.y ? 1 : -1;
  return [
    { x: a.x, y: a.y + way * half(from.height) },
    { x: b.x, y: b.y - way * half(to.height) },
  ];
}

function half(extent: number): number {
  return extent / 2 + SHELL_PAD;
}

// One step straight out, so the walk starts and ends outside the box and the
// arrowhead meets the side square-on.
function step(at: T.Point, axis: Axis, own: T.Box, other: T.Box): T.Point {
  const mine = center(own);
  const theirs = center(other);
  if (axis === "h") return { x: at.x + (theirs.x >= mine.x ? STUB : -STUB), y: at.y };
  return { x: at.x, y: at.y + (theirs.y >= mine.y ? STUB : -STUB) };
}

function sameRank(a: T.Box, b: T.Box): boolean {
  return a.left < b.left + b.width - TOLERANCE && b.left < a.left + a.width - TOLERANCE;
}

// --- corridors --------------------------------------------------------------

// The lines a snake may travel along: the middles of the gaps the layout already
// left. Ranks are found by x-overlap rather than from `pos`, because measured
// geometry is the single source of truth (§3.4) — a theme that re-flows the
// picture moves the corridors with it.
//
// Row gaps are collected **per rank** and then unioned. Pooling every box's
// y-span first would be wrong: two boxes in different ranks usually overlap
// vertically, which hides the very gap a snake needs to cross that rank.
function corridors(boxes: T.Box[], tail: T.Point, head: T.Point): { xs: number[]; ys: number[] } {
  const ranks = columns(boxes);

  const xs = gaps(ranks.map((rank) => span(rank)));
  const ys = ranks.flatMap((rank) => gaps(rank.map(rows)));

  return {
    xs: unique([...xs, tail.x, head.x]),
    ys: unique([...ys, tail.y, head.y]),
  };
}

function columns(boxes: T.Box[]): T.Box[][] {
  const ranks: T.Box[][] = [];
  for (const box of [...boxes].sort((a, b) => a.left - b.left || a.top - b.top)) {
    const home = ranks.find((rank) => rank.some((other) => sameRank(other, box)));
    if (home) home.push(box);
    else ranks.push([box]);
  }
  return ranks;
}

type Span = { lo: number; hi: number };

/** A rank's horizontal extent. */
function span(boxes: T.Box[]): Span {
  return {
    lo: Math.min(...boxes.map((box) => box.left)),
    hi: Math.max(...boxes.map((box) => box.left + box.width)),
  };
}

/** One box's vertical extent. */
function rows(box: T.Box): Span {
  return { lo: box.top, hi: box.top + box.height };
}

// The middle of every gap between these spans, plus a lane just outside each end
// so a route can always go round rather than through.
function gaps(spans: Span[]): number[] {
  const sorted = [...spans].sort((a, b) => a.lo - b.lo);
  const lines: number[] = [];

  for (const [index, one] of sorted.entries()) {
    const next = sorted[index + 1];
    if (next && next.lo > one.hi) lines.push((one.hi + next.lo) / 2);
  }

  const lo = Math.min(...sorted.map((one) => one.lo));
  const hi = Math.max(...sorted.map((one) => one.hi));
  return [...lines, lo - STUB * 2, hi + STUB * 2];
}

function unique(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value * 2) / 2))].sort((a, b) => a - b);
}

// --- the walk ---------------------------------------------------------------

// Dijkstra over the corridor intersections, cost being length plus TURN_COST per
// bend, so "fewest turns, then shortest" falls out of one number. The state
// carries the direction of arrival, because whether the next step is a bend
// depends on how this point was reached.
//
// Ties break on the key's insertion order, which is fixed by the sorted corridor
// lines — identical input has to give an identical map (§3.2).
function walk(
  start: T.Point,
  goal: T.Point,
  lines: { xs: number[]; ys: number[] },
  rects: Rect[],
  axis: Axis,
): T.Point[] | undefined {
  const { xs, ys } = lines;
  const at = (xi: number, yi: number): T.Point => ({ x: xs[xi]!, y: ys[yi]! });
  const from = place(start, lines);
  const to = place(goal, lines);
  if (!from || !to) return undefined;

  const best = new Map<string, number>();
  const came = new Map<string, string>();
  const queue: { xi: number; yi: number; dir: Axis; cost: number }[] = [
    { ...from, dir: axis, cost: 0 },
  ];
  best.set(key(from.xi, from.yi, axis), 0);

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const here = queue.shift()!;
    if (here.cost > (best.get(key(here.xi, here.yi, here.dir)) ?? Infinity)) continue;

    // Arriving square-on is the whole point of the stub; a route that reaches the
    // head sideways would put the arrowhead against the wrong face.
    if (here.xi === to.xi && here.yi === to.yi && here.dir === axis) {
      return trail(came, key(here.xi, here.yi, here.dir), at);
    }

    for (const next of around(here, xs.length, ys.length)) {
      if (!clear(at(here.xi, here.yi), at(next.xi, next.yi), rects)) continue;

      const reach = here.cost + length(at(here.xi, here.yi), at(next.xi, next.yi)) +
        (next.dir === here.dir ? 0 : TURN_COST);
      const id = key(next.xi, next.yi, next.dir);
      if (reach >= (best.get(id) ?? Infinity)) continue;

      best.set(id, reach);
      came.set(id, key(here.xi, here.yi, here.dir));
      queue.push({ ...next, cost: reach });
    }
  }
  return undefined;
}

function around(
  here: { xi: number; yi: number },
  width: number,
  height: number,
): { xi: number; yi: number; dir: Axis }[] {
  return [
    { xi: here.xi - 1, yi: here.yi, dir: "h" as Axis },
    { xi: here.xi + 1, yi: here.yi, dir: "h" as Axis },
    { xi: here.xi, yi: here.yi - 1, dir: "v" as Axis },
    { xi: here.xi, yi: here.yi + 1, dir: "v" as Axis },
  ].filter((next) => next.xi >= 0 && next.xi < width && next.yi >= 0 && next.yi < height);
}

function place(point: T.Point, lines: { xs: number[]; ys: number[] }): { xi: number; yi: number } | undefined {
  const xi = lines.xs.findIndex((x) => Math.abs(x - point.x) <= 0.5);
  const yi = lines.ys.findIndex((y) => Math.abs(y - point.y) <= 0.5);
  return xi < 0 || yi < 0 ? undefined : { xi, yi };
}

function trail(came: Map<string, string>, end: string, at: (xi: number, yi: number) => T.Point): T.Point[] {
  const keys: string[] = [];
  for (let node: string | undefined = end; node !== undefined; node = came.get(node)) keys.push(node);

  const points = keys.reverse().map((node) => {
    const [xi, yi] = node.split(",").map(Number);
    return at(xi!, yi!);
  });
  return points;
}

function key(xi: number, yi: number, dir: Axis): string {
  return `${xi},${yi},${dir}`;
}

function length(a: T.Point, b: T.Point): number {
  return Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
}

// --- geometry ---------------------------------------------------------------

// Axis-aligned throughout, so this is an overlap test rather than a line
// intersection. `>` and `<` are strict: a segment is allowed to graze an edge,
// which is what lets a lane run along the boundary of the clearance it was given.
function clear(a: T.Point, b: T.Point, rects: Rect[]): boolean {
  const lo = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
  const hi = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };

  return rects.every(
    (rect) => !(lo.x < rect.right && hi.x > rect.left && lo.y < rect.bottom && hi.y > rect.top),
  );
}

function grow(box: T.Box, by: number): Rect {
  return {
    left: box.left - by,
    top: box.top - by,
    right: box.left + box.width + by,
    bottom: box.top + box.height + by,
  };
}

// The last resort, when even an uninflated walk finds nothing: one bend, on the
// attachment axis so the ends still meet their sides square-on.
function dogleg(tail: T.Point, head: T.Point, axis: Axis): T.Point[] {
  if (axis === "h") {
    const mid = (tail.x + head.x) / 2;
    return [{ x: mid, y: tail.y }, { x: mid, y: head.y }];
  }
  const mid = (tail.y + head.y) / 2;
  return [{ x: tail.x, y: mid }, { x: head.x, y: mid }];
}

function center(box: T.Box): T.Point {
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}
