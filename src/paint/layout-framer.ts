// Model + ranks → `#diagram-html` (§2). Ranks arrive already ordered, so
// framing is an emit. Size and position are the browser's, then measured.

import type * as T from "../types.ts";
import { shapeHtml } from "./node-shaper.ts";

export class LayoutFramer {
  frame(model: T.DiagramModel, ranks: T.Ranks): string {
    const html = ranks.map(
      (rank) => `<div class="rank">${rank.map((id) => shapeHtml(model.nodes.get(id)!)).join("")}</div>`,
    );
    return `<div class="diagram">${html.join("")}</div>`;
  }
}
