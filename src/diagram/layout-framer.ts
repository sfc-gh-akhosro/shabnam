// Model → columns → `#shabnam-main-html` (§3.3). Graphviz `pos` decides which column a
// node is in, and nothing else — size and position are the Measurer's (§3.4).

import type * as T from "../types.ts";
import { shapeHtml } from "./node-shaper.ts";

// Ranks are at least 36 points apart, so bucketing within 2 points is
// unambiguous — and exact float equality would scatter one rank across
// several columns (§3.3).
export const TOLERANCE = 2;

// rankdir → how a node's position becomes a column key, how columns order, and
// how nodes order inside one. LR/RL group on x, TB/BT on y; Graphviz's y grows
// upward, so "first" is the larger y.
export type Axes = {
  key: (node: T.Node) => number;
  columns: number;
  within: (node: T.Node) => number;
  inside: number;
};

export const AXES = new Map<string, Axes>([
  ["LR", { key: (n) => n.x, columns: 1, within: (n) => n.y, inside: -1 }],
  ["RL", { key: (n) => n.x, columns: -1, within: (n) => n.y, inside: -1 }],
  ["TB", { key: (n) => n.y, columns: -1, within: (n) => n.x, inside: 1 }],
  ["BT", { key: (n) => n.y, columns: 1, within: (n) => n.x, inside: 1 }],
]);

export class LayoutFramer implements T.LayoutFramer {
  columns(model: T.DiagramModel): T.Layout {
    const axes = AXES.get(model.rankdir) ?? AXES.get("TB")!;
    const buckets = bucket(model.nodes, axes);

    for (const column of buckets) {
      column.sort((a, b) => (axes.within(a) - axes.within(b)) * axes.inside);
    }
    return buckets;
  }

  frame(model: T.DiagramModel): string {
    const columns = this.columns(model).map(
      (column) => `<div class="column">${column.map((node) => shapeHtml(node)).join("")}</div>`,
    );
    return `<div class="diagram">${columns.join("")}</div>`;
  }
}

export function calculateStep(nodes: T.Node[], axes: Axes): number {
  if (nodes.length <= 1) return 80;

  const deltas: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const diff = Math.abs(axes.within(nodes[i]!) - axes.within(nodes[j]!));
      if (diff > 15) {
        deltas.push(diff);
      }
    }
  }

  if (deltas.length === 0) return 80;
  deltas.sort((a, b) => a - b);
  // Choose smallest significant delta (>= 35) or fallback to median
  const minDelta = deltas.find((d) => d >= 35) ?? deltas[0]!;
  return minDelta;
}

// One pass over position-sorted nodes: a node opens a new column as soon as it
// is more than the tolerance away from the column it would otherwise join.
export function bucket(nodes: T.Node[], axes: Axes): T.Node[][] {
  const sorted = [...nodes].sort((a, b) => (axes.key(a) - axes.key(b)) * axes.columns);
  const columns: T.Node[][] = [];
  let anchor = Infinity;

  for (const node of sorted) {
    if (Math.abs(axes.key(node) - anchor) > TOLERANCE) {
      anchor = axes.key(node);
      columns.push([]);
    }
    columns[columns.length - 1]!.push(node);
  }
  return columns;
}
