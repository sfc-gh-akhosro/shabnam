// Model + positions → `#diagram-html` (§3.3). Ranks arrive as integers, so
// framing is a group-and-emit. Size and position are the Measurer's (§3.4).

import type * as T from "../types.ts";
import { shapeHtml } from "./node-shaper.ts";

export class LayoutFramer {
  frame(model: T.DiagramModel, positions: T.Positions): string {
    const ranks = this.ranks(model, positions).map(
      (rank) => `<div class="rank">${rank.map((node) => shapeHtml(node)).join("")}</div>`,
    );
    return `<div class="diagram">${ranks.join("")}</div>`;
  }

  private ranks(model: T.DiagramModel, positions: T.Positions): T.DiagramNode[][] {
    const rows: T.DiagramNode[][] = [];
    for (const node of model.nodes.values()) {
      const at = positions.get(node.id)!;
      (rows[at.rank] ??= [])[at.order] = node;
    }
    return rows;
  }
}
