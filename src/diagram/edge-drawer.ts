// Boxes + edges → the connector layer (§3.4). Coordinates come from the measured
// boxes and never from Graphviz `_draw_` paths, which is the whole reason a CSS
// change to a gap, a font, or a width leaves the picture still joined up. The
// coordinate space is the one stated in node-sheller.ts.

import type * as T from "../types.ts";
import { SHELL_PAD } from "./node-sheller.ts";

// Anchoring, simple and consistent: an edge leaves and arrives at the midpoint of
// the two facing shell edges, picked on whichever axis separates the boxes more.
// No routing, no overlap avoidance — a straight line between facing sides.
//
// `markerUnits="userSpaceOnUse"` is deliberate. The default scales the marker by
// the line's stroke-width, so the fixture's `penwidth=3` edge grew an arrowhead
// three times everyone else's — seen in the browser once DOT `penwidth` started
// reaching the connectors. One arrow size, whatever the line weight.
const ARROW = `<defs><marker id="shabnam-arrow" class="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>`;

export class EdgeDrawer implements T.EdgeDrawer {
  draw(boxes: T.Box[], model: T.DiagramModel): string {
    const byId = new Map(boxes.map((box) => [box.id, box]));
    const lines = model.edges.map((edge) =>
      line(edge, byId.get(edge.from)!, byId.get(edge.to)!),
    );
    return ARROW + lines.join("");
  }
}

function line(edge: T.Edge, from: T.Box, to: T.Box): string {
  const [tail, head] = anchors(from, to);
  const classes = ["edge", ...edge.classes].join(" ");

  return (
    `<line id="${edge.id}" class="${classes}"` +
    ` x1="${round(tail.x)}" y1="${round(tail.y)}"` +
    ` x2="${round(head.x)}" y2="${round(head.y)}"` +
    ` marker-end="url(#shabnam-arrow)" />`
  );
}

function anchors(from: T.Box, to: T.Box): [T.Point, T.Point] {
  const a = center(from);
  const b = center(to);
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const way = dx >= 0 ? 1 : -1;
    return [
      { x: a.x + way * half(from.width), y: a.y },
      { x: b.x - way * half(to.width), y: b.y },
    ];
  }
  const way = dy >= 0 ? 1 : -1;
  return [
    { x: a.x, y: a.y + way * half(from.height) },
    { x: b.x, y: b.y - way * half(to.height) },
  ];
}

function center(box: T.Box): T.Point {
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

// Connectors meet the shell, not the box it stands off from.
function half(extent: number): number {
  return extent / 2 + SHELL_PAD;
}

function round(value: number): string {
  return (Math.round(value * 2) / 2).toString();
}
