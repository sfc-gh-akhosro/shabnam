// The Connectors: a placement in, one path `d` per link out. No DOM; the
// story is `connectors-story.md`.

import type { Box, Ranks } from "../types.ts";
import { outline } from "./outline.ts";
import { type Grid, grid } from "./pathways.ts";
import { busy, inRank, lanes, points, slide } from "./polish.ts";
import { choose } from "./ports.ts";
import type * as C from "./types.ts";

export class Connectors implements C.Connectors {
  private g: Grid;

  constructor(placement: C.Placement, rules: C.ConnectorRules) {
    this.g = grid(placement, rules);
  }

  /** Boxes → rank coordinates; the only code that knows boxes. The rank axis
   *  is the one the rank centres spread along, never `rankdir`. A node that
   *  does not paint (`.invis` is `display: none`) has no box and no place. */
  static place(painted: Ranks, boxes: Box[]): C.Placement {
    const byId = new Map(boxes.filter((box) => box.width || box.height).map((box) => [box.id, box]));
    const ranks = painted.map((rank) => rank.filter((id) => byId.has(id))).filter((rank) => rank.length);
    const centres = ranks.map((rank) => rank.map((id) => byId.get(id)!).map((b) => [b.left + b.width / 2, b.top + b.height / 2]));
    const mean = (cs: number[][], i: number) => cs.reduce((sum, c) => sum + c[i]!, 0) / cs.length;
    const range = (cs: number[][], i: number) => Math.max(...cs.map((c) => c[i]!)) - Math.min(...cs.map((c) => c[i]!));
    const [first, last] = [centres[0]!, centres.at(-1)!];
    const lr = ranks.length > 1
      ? Math.abs(mean(last, 0) - mean(first, 0)) >= Math.abs(mean(last, 1) - mean(first, 1))
      : range(first, 1) >= range(first, 0);
    const across = (b: Box): C.Placed => lr
      ? { rank: 0, start: b.top, length: b.height, cross: b.left, depth: b.width }
      : { rank: 0, start: b.left, length: b.width, cross: b.top, depth: b.height };
    const order = ranks.map((_, r) => r).sort((a, b) => mean(centres[a]!, lr ? 0 : 1) - mean(centres[b]!, lr ? 0 : 1));
    const nodes = new Map<string, C.Placed>();
    order.forEach((r, rank) => {
      for (const id of ranks[r]!) nodes.set(id, whole({ ...across(byId.get(id)!), rank }));
    });
    return { axis: lr ? "x" : "y", nodes };
  }

  paths(links: C.Link[]): string[] {
    const g = this.g;
    const spot = (id: string) => g.spots.get(id)!;
    const placed = links.map(({ from, to }) => g.spots.has(from) && g.spots.has(to));
    const routes = links.map(({ from, to }, i) => {
      if (!placed[i]) return undefined;
      const [a, b] = [spot(from), spot(to)];
      if (a.rank === b.rank) return undefined;
      return a.rank < b.rank ? choose(g, a, b, false) : choose(g, b, a, true);
    });
    slide(routes.filter((rt) => rt !== undefined));
    const paths = routes.map((rt) => (rt ? (rt.reversed ? points(g, rt).reverse() : points(g, rt)) : []));
    const traffic = busy(g, paths);
    links.forEach((link, i) => {
      if (placed[i] && !routes[i]) paths[i] = inRank(g, spot(link.from), spot(link.to), traffic);
    });
    lanes(g, paths, links, g.rules.lane);
    // An edge to a node that does not paint has nothing to join.
    return paths.map((p, i) => (placed[i] ? outline(p, g.rules.radius, g.lr) : ""));
  }
}

function whole(p: C.Placed): C.Placed {
  return { rank: p.rank, start: Math.round(p.start), length: Math.round(p.length), cross: Math.round(p.cross), depth: Math.round(p.depth) };
}
