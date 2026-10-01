// Path `d`s → the connector layer (§4). The route is `connectors/`'s; this file
// only writes the markup: one arrow marker, and one path per edge.

import type * as T from "../types.ts";
import { styleWords } from "./node-shaper.ts";

const ARROW = `<defs><marker id="connector-arrow" class="arrow" viewBox="0 0 10 10" refX="9" refY="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>`;

export class EdgeDrawer {
  /** `ds[i]` is the outline of `model.edges[i]`. */
  draw(model: T.DiagramModel, ds: string[]): string {
    return ARROW + model.edges.map((edge, i) => edgePath(edge, ds[i]!)).join("");
  }
}

function edgePath(edge: T.DiagramEdge, d: string): string {
  // The same rule the nodes use: a `style` word is a class, and the theme says
  // what it means. `edge [style=invis]` is how DOT holds a rank in place without
  // drawing anything, so this is the one that earns its keep.
  const classes = ["edge", ...styleWords(edge.style), ...edge.classes].join(" ");
  return `<path id="${edge.id}" class="${classes}" d="${d}" marker-end="url(#connector-arrow)" />`;
}
