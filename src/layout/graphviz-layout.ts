// The only source of geometry (§2).
//
// Graphviz `dot`, compiled to WebAssembly, is visible here and nowhere else. It
// is handed the reader's points — the author's graph with every size cut away —
// exactly as they are, and answers where each 0×0 point landed. Points of one
// rank share one coordinate on the rank axis, so ranks are read off exactly.

import { Graphviz } from "@hpcc-js/wasm-graphviz";
import { idOf } from "../read/dot-reader.ts";
import type * as T from "../types.ts";

/** rankdir → which coordinate is the rank axis, and which way rank 0 faces. */
const AXES = new Map<T.Rankdir, { rank: (p: T.Point) => number; order: (p: T.Point) => number }>([
  ["TB", { rank: (p) => -p.y, order: (p) => p.x }],
  ["BT", { rank: (p) => p.y, order: (p) => p.x }],
  ["LR", { rank: (p) => p.x, order: (p) => -p.y }],
  ["RL", { rank: (p) => -p.x, order: (p) => -p.y }],
]);

export class GraphvizLayout implements T.GraphvizLayout {
  /** The wasm loads once, at boot; after that every call is synchronous. */
  static async load(): Promise<GraphvizLayout> {
    return new GraphvizLayout(await Graphviz.load());
  }

  private constructor(private readonly graphviz: Graphviz) {}

  positions(points: T.PointDot): Map<T.NodeId, T.Point> {
    return this.run(points).positions;
  }

  layout(points: T.PointDot): T.Ranks {
    const { rankdir, positions } = this.run(points);
    const axes = AXES.get(rankdir)!;
    const ranks = new Map<number, T.NodeId[]>();
    for (const [id, at] of positions) {
      const rank = axes.rank(at);
      ranks.set(rank, [...(ranks.get(rank) ?? []), id]);
    }
    return [...ranks.keys()]
      .sort((a, b) => a - b)
      .map((rank) => ranks.get(rank)!.sort((a, b) => axes.order(positions.get(a)!) - axes.order(positions.get(b)!)));
  }

  // Objects without `pos` are clusters; they have a box, not a point.
  private run(points: T.PointDot): { rankdir: T.Rankdir; positions: Map<T.NodeId, T.Point> } {
    const answer = JSON.parse(this.graphviz.layout(points, "json", "dot"));
    const positions = new Map<T.NodeId, T.Point>();
    for (const object of answer.objects ?? []) {
      if (!object.pos) continue;
      const [x, y] = object.pos.split(",").map(Number);
      positions.set(idOf(object.name), { x, y });
    }
    return { rankdir: answer.rankdir ?? "TB", positions };
  }
}
