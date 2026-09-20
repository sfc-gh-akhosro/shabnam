// Boxes + edges → the connector layer (§3.4). Coordinates come from the measured
// boxes and never from Graphviz `_draw_` paths, which is the whole reason a CSS
// change to a gap, a font, or a width leaves the picture still joined up. The
// coordinate space is the one stated in node-sheller.ts.

import type * as T from "../types.ts";
import { SHELL_PAD } from "./node-sheller.ts";

const ARROW = `<defs><marker id="shabnam-arrow" class="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>`;

export function getCssConnectorMode(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const canvas = document.getElementById("shabnam-canvas");
  if (!canvas) return undefined;
  const style = getComputedStyle(canvas);
  const val =
    style.getPropertyValue("--connector-style") ||
    style.getPropertyValue("--connector-type");
  const trimmed = val ? val.trim().replace(/^['"]|['"]$/g, "").toLowerCase() : "";
  return trimmed || undefined;
}

export class EdgeDrawer implements T.EdgeDrawer {
  draw(boxes: T.Box[], model: T.DiagramModel): string {
    const byId = new Map(boxes.map((box) => [box.id, box]));
    const cssMode = getCssConnectorMode();
    const defaultMode = cssMode ?? model.attrs.get("splines") ?? "spline";

    const paths = model.edges.map((edge) => {
      const from = byId.get(edge.from)!;
      const to = byId.get(edge.to)!;
      const mode = edge.attrs.get("splines") ?? defaultMode;
      return edgePath(edge, from, to, mode);
    });

    return ARROW + paths.join("");
  }
}

function edgePath(edge: T.Edge, from: T.Box, to: T.Box, mode: string): string {
  const [tail, head] = anchors(from, to);
  const classes = ["edge", ...edge.classes].join(" ");
  const d = route(tail, head, mode);

  return (
    `<path id="${edge.id}" class="${classes}"` +
    ` d="${d}"` +
    ` marker-end="url(#shabnam-arrow)" />`
  );
}

function route(tail: T.Point, head: T.Point, mode: string): string {
  switch (mode) {
    case "ortho":
    case "step":
    case "polyline":
      return orthoPath(tail, head);
    case "line":
    case "straight":
      return `M ${round(tail.x)} ${round(tail.y)} L ${round(head.x)} ${round(head.y)}`;
    case "spline":
    case "curved":
    default:
      return splinePath(tail, head);
  }
}

function splinePath(tail: T.Point, head: T.Point): string {
  const dx = head.x - tail.x;
  const dy = head.y - tail.y;

  if (Math.abs(dx) < 1 || Math.abs(dy) < 1) {
    return `M ${round(tail.x)} ${round(tail.y)} L ${round(head.x)} ${round(head.y)}`;
  }

  const isHorizontal = Math.abs(dx) >= Math.abs(dy);
  const cp1 = isHorizontal
    ? { x: tail.x + dx * 0.5, y: tail.y }
    : { x: tail.x, y: tail.y + dy * 0.5 };
  const cp2 = isHorizontal
    ? { x: head.x - dx * 0.5, y: head.y }
    : { x: head.x, y: head.y - dy * 0.5 };

  return (
    `M ${round(tail.x)} ${round(tail.y)}` +
    ` C ${round(cp1.x)} ${round(cp1.y)}, ${round(cp2.x)} ${round(cp2.y)}, ${round(head.x)} ${round(head.y)}`
  );
}

function orthoPath(tail: T.Point, head: T.Point): string {
  const dx = head.x - tail.x;
  const dy = head.y - tail.y;

  if (Math.abs(dx) < 1 || Math.abs(dy) < 1) {
    return `M ${round(tail.x)} ${round(tail.y)} L ${round(head.x)} ${round(head.y)}`;
  }

  const isHorizontal = Math.abs(dx) >= Math.abs(dy);
  const r = Math.min(6, Math.abs(dx) / 2, Math.abs(dy) / 2);
  const signX = dx >= 0 ? 1 : -1;
  const signY = dy >= 0 ? 1 : -1;

  if (isHorizontal) {
    const midX = tail.x + dx / 2;
    return (
      `M ${round(tail.x)} ${round(tail.y)}` +
      ` L ${round(midX - signX * r)} ${round(tail.y)}` +
      ` Q ${round(midX)} ${round(tail.y)}, ${round(midX)} ${round(tail.y + signY * r)}` +
      ` L ${round(midX)} ${round(head.y - signY * r)}` +
      ` Q ${round(midX)} ${round(head.y)}, ${round(midX + signX * r)} ${round(head.y)}` +
      ` L ${round(head.x)} ${round(head.y)}`
    );
  }

  const midY = tail.y + dy / 2;
  return (
    `M ${round(tail.x)} ${round(tail.y)}` +
    ` L ${round(tail.x)} ${round(midY - signY * r)}` +
    ` Q ${round(tail.x)} ${round(midY)}, ${round(tail.x + signX * r)} ${round(midY)}` +
    ` L ${round(head.x - signX * r)} ${round(midY)}` +
    ` Q ${round(head.x)} ${round(midY)}, ${round(head.x)} ${round(midY + signY * r)}` +
    ` L ${round(head.x)} ${round(head.y)}`
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
