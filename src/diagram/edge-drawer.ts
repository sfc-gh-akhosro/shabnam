// Waypoints → the connector layer (§3.4). Coordinates come from the measured
// boxes and never from Graphviz `_draw_` paths, which is the whole reason a CSS
// change to a gap, a font, or a width leaves the picture still joined up. The
// coordinate space is the one stated in node-sheller.ts.
//
// This file attaches and renders; `edge-router.ts` decides the route. There is
// one shape — an ortho snake — and no modes: `splines` is not consulted, and the
// only knob is how far the bends are rounded.

import type * as T from "../types.ts";
import { EdgeRouter } from "./edge-router.ts";
import { styleWords } from "./node-shaper.ts";

const ARROW = `<defs><marker id="connector-arrow" class="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>`;

export class EdgeDrawer {
  private router = new EdgeRouter();

  draw(boxes: T.Box[], model: T.DiagramModel, metrics: T.ConnectorMetrics): string {
    const byId = new Map(boxes.map((box) => [box.id, box]));

    const paths = model.edges.map((edge) => {
      const from = byId.get(edge.from)!;
      const to = byId.get(edge.to)!;
      // Everything the route must avoid is every box but its own two ends — a
      // connector has to be allowed to touch the things it joins.
      const obstacles = boxes.filter((box) => box.id !== edge.from && box.id !== edge.to);
      const waypoints = this.router.route(from, to, obstacles, metrics.clearance);

      return edgePath(edge, waypoints, metrics.radius);
    });

    return ARROW + paths.join("");
  }
}

function edgePath(edge: T.Edge, waypoints: T.Point[], radius: number): string {
  // The same rule the nodes use: a `style` word is a class, and the theme says
  // what it means. `edge [style=invis]` is how DOT holds a rank in place without
  // drawing anything, so this is the one that earns its keep.
  const classes = ["edge", ...styleWords(edge.attrs), ...edge.classes].join(" ");

  return (
    `<path id="${edge.id}" class="${classes}"` +
    ` d="${snake(waypoints, radius)}"` +
    ` marker-end="url(#connector-arrow)" />`
  );
}

/**
 * One polyline, with its corners rounded by `radius`.
 *
 * `0` is sharp ortho. The radius is clamped to half of the shorter of the two
 * segments meeting at a corner, so a route squeezing through a tight corridor
 * cannot produce a curve that overshoots into the segment beyond it.
 */
export function snake(waypoints: T.Point[], radius: number): string {
  const points = straighten(waypoints);
  const [first, ...rest] = points;
  if (!first) return "";

  let d = `M ${round(first.x)} ${round(first.y)}`;
  for (const [index, point] of rest.entries()) {
    const next = rest[index + 1];
    const previous = rest[index - 1] ?? first;
    d += next ? corner(previous, point, next, radius) : ` L ${round(point.x)} ${round(point.y)}`;
  }
  return d;
}

function corner(from: T.Point, at: T.Point, to: T.Point, radius: number): string {
  const r = Math.min(radius, distance(from, at) / 2, distance(at, to) / 2);
  if (r < 0.5) return ` L ${round(at.x)} ${round(at.y)}`;

  const entry = along(at, from, r);
  const exit = along(at, to, r);
  return (
    ` L ${round(entry.x)} ${round(entry.y)}` +
    ` Q ${round(at.x)} ${round(at.y)}, ${round(exit.x)} ${round(exit.y)}`
  );
}

// `r` pixels from `at`, in the direction of `towards`. Segments are axis-aligned,
// so one of the two terms is always zero.
function along(at: T.Point, towards: T.Point, r: number): T.Point {
  const span = distance(at, towards);
  return {
    x: at.x + ((towards.x - at.x) / span) * r,
    y: at.y + ((towards.y - at.y) / span) * r,
  };
}

// Three points on one line are one segment. The walk emits a point per corridor
// it crosses, and the attachment stub adds another, so most of these are not
// corners at all — rounding one would put a degenerate curve in the middle of a
// straight run.
function straighten(points: T.Point[]): T.Point[] {
  return points.filter((point, index) => {
    const before = points[index - 1];
    const after = points[index + 1];
    if (!before || !after) return true;
    if (same(before, point) || same(point, after)) return false;
    return !(
      (before.x === point.x && point.x === after.x) ||
      (before.y === point.y && point.y === after.y)
    );
  });
}

function same(a: T.Point, b: T.Point): boolean {
  return a.x === b.x && a.y === b.y;
}

function distance(a: T.Point, b: T.Point): number {
  return Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
}

function round(value: number): string {
  return (Math.round(value * 2) / 2).toString();
}
