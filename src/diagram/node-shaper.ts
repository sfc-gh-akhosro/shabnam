// SHAPE_HTML — a registry, not a class (§8). shape → the node's HTML layer.
// The HTML layer exists to be measured, so it stays in flow and carries the
// identity: the namespaced id plus `node` plus one class per subgraph (§3.3).

import type * as T from "../types.ts";

export const SHAPE_HTML: T.ShapeHtml = new Map([["box", box]]);

export function shapeHtml(node: T.Node): string {
  const render = SHAPE_HTML.get(node.shape) ?? SHAPE_HTML.get("box")!;
  return render(node);
}

function box(node: T.Node): string {
  const classes = ["node", ...node.classes].join(" ");
  return (
    `<div id="${node.id}" class="${classes}">` +
    `<span class="label">${escape(node.label)}</span>` +
    `</div>`
  );
}

// Graphviz escapes (`\n`, `\l`, `\r`) are newlines; the label renders with
// `white-space: pre-line`, so a real newline is all the markup needs.
function escape(label: string): string {
  return label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\[nlr]/g, "\n");
}
