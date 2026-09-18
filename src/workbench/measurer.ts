// The painted `#shabnam-main-html` → Box[] (§3.4). One of the two places that touch the
// live page; the other is Sinker.
//
// `offsetLeft` / `offsetTop` are measured from the padding edge of the nearest
// positioned ancestor, which is `#shabnam-canvas` — every element between a node and the
// canvas is statically positioned, so the offsets already accumulate. That is the
// same origin `#shabnam-main-svg` uses, and it is scroll-independent, so the two layers
// stay registered however far the canvas is scrolled.

import type * as T from "../types.ts";

export class Measurer implements T.Measurer {
  measure(): T.Box[] {
    const nodes = document.querySelectorAll<HTMLElement>("#shabnam-main-html .node");
    return [...nodes].map(box);
  }
}

function box(node: HTMLElement): T.Box {
  return {
    id: node.id,
    left: node.offsetLeft,
    top: node.offsetTop,
    width: node.offsetWidth,
    height: node.offsetHeight,
  };
}
