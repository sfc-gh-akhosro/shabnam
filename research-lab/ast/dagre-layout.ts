// research-lab/ast/dagre-layout.ts — the only geometry source.
//
// dagre is visible here and nowhere else. It is given points and arrows, and it
// answers with an integer rank, an integer order, and a rough x,y.
//
// `rank=same` is the one thing dagre cannot express: a numeric `rank` on a node
// is ignored, `rank: "same"` crashes it, and a zero `minlen` edge throws. So a
// group is **contracted** into one stand-in node, laid out, then expanded —
// members inherit the stand-in's rank and spread across it.

import dagre from "@dagrejs/dagre";
import type { Layout, NodeId, PointGraph, Placement, Positions, Px } from "./types.ts";

/** How far apart two members of a contracted group sit, before CSS resizes. */
const SPREAD: Px = 20;

export class DagreLayout implements Layout {
  place(graph: PointGraph): Positions {
    const stand = this.standIns(graph);
    const laid = this.run(graph, stand);
    return this.expand(graph, stand, laid);
  }

  /** node id → what dagre sees instead: itself, or its group's stand-in. */
  private standIns(graph: PointGraph): Map<NodeId, NodeId> {
    const stand = new Map<NodeId, NodeId>();
    graph.sameRank.forEach((group, index) => {
      for (const id of group) stand.set(id, `same_${index}`);
    });
    for (const id of graph.nodes) if (!stand.has(id)) stand.set(id, id);
    return stand;
  }

  private run(graph: PointGraph, stand: Map<NodeId, NodeId>): any {
    const g = new dagre.graphlib.Graph({ compound: true });
    g.setGraph({ rankdir: graph.rankdir, ranksep: 40, nodesep: SPREAD });
    g.setDefaultEdgeLabel(() => ({}));

    // Zero size: topology only. CSS owns the real thing.
    for (const seen of new Set(stand.values())) g.setNode(seen, { width: 0, height: 0 });
    for (const { from, to } of graph.arrows) {
      const [tail, head] = [stand.get(from)!, stand.get(to)!];
      if (tail !== head) g.setEdge(tail, head);
    }
    for (const [name, members] of graph.boxes) {
      g.setNode(`box_${name}`, {});
      for (const id of members) g.setParent(stand.get(id)!, `box_${name}`);
    }

    dagre.layout(g);
    return g;
  }

  /**
   * Members of a contracted group take its rank and spread across it. Then each
   * rank is re-ordered on the cross axis, so `order` comes out consecutive while
   * dagre's own within-rank pull — the part worth keeping — survives.
   */
  private expand(graph: PointGraph, stand: Map<NodeId, NodeId>, g: any): Positions {
    const across = graph.rankdir === "LR" || graph.rankdir === "RL";
    const taken = new Map<NodeId, number>();
    const placed = new Map<NodeId, Placement>();

    for (const id of graph.nodes) {
      const host = g.node(stand.get(id)!);
      const group = graph.sameRank.find((members) => members.includes(id));
      const slot = taken.get(stand.get(id)!) ?? 0;
      taken.set(stand.get(id)!, slot + 1);
      const nudge = group ? (slot - (group.length - 1) / 2) * SPREAD : 0;
      placed.set(id, {
        rank: host.rank,
        order: 0,
        x: host.x + (across ? 0 : nudge),
        y: host.y + (across ? nudge : 0),
      });
    }
    return this.renumber(placed, across);
  }

  /** Compact ranks to 0…n, and order within a rank by the cross axis. */
  private renumber(placed: Positions, across: boolean): Positions {
    const ranks = [...new Set([...placed.values()].map((one) => one.rank))].sort((a, b) => a - b);
    const compact = new Map(ranks.map((rank, at) => [rank, at]));

    const rows = new Map<number, Placement[]>();
    for (const one of placed.values()) {
      one.rank = compact.get(one.rank)!;
      rows.set(one.rank, [...(rows.get(one.rank) ?? []), one]);
    }
    for (const row of rows.values()) {
      row.sort((a, b) => (across ? a.y - b.y : a.x - b.x));
      row.forEach((one, at) => { one.order = at; });
    }
    return placed;
  }
}
