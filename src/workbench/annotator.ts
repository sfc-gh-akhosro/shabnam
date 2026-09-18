// The HTML tab annotates the canvas (§4). The user's markup lands in
// `#shabnam-annotation-html` untransformed; this worker only positions the elements that
// ask to be positioned.
//
// Anchor semantics, settled in iteration 5:
//
//   data-anchor="lake"    the centre of that node's measured box
//   data-anchor="120,40"  a literal point
//   data-offset="dx,dy"   added to the anchor. +x right, +y down, CSS pixels.
//
// The anchor point is the annotation's own centre — `app.css` translates it by
// -50% on both axes — so `data-anchor="lake"` centres a label on that node and
// nothing here has to measure the annotation.
//
// Both are Cartesian in the padding-box space of `#shabnam-canvas` — the same coordinate
// contract the SVG layer states in node-sheller.ts, so an annotation and a shell
// agree on where a node is, and both keep agreeing as the canvas scrolls. An
// element without `data-anchor` is left in flow.

import type * as T from "../types.ts";

type At = (spec: string, boxes: Map<string, T.Box>) => T.Point;

// anchor kind → where it resolves to.
const ANCHOR_AT = new Map<string, At>([
  ["node", (spec, boxes) => center(boxes.get(spec)!)],
  ["point", (spec) => pair(spec)],
]);

export class Annotator implements T.Annotator {
  place(boxes: T.Box[]): void {
    const byId = new Map(boxes.map((box) => [box.id, box]));
    const marks = document.querySelectorAll<HTMLElement>("#shabnam-annotation-html [data-anchor]");

    for (const mark of marks) pin(mark, byId);
  }
}

function pin(mark: HTMLElement, boxes: Map<string, T.Box>): void {
  const spec = mark.dataset.anchor!;
  const at = ANCHOR_AT.get(kindOf(spec))!(spec, boxes);
  const offset = pair(mark.dataset.offset ?? "0,0");

  mark.style.left = `${at.x + offset.x}px`;
  mark.style.top = `${at.y + offset.y}px`;
}

// A node id is one token; a point is two numbers. Nothing else is an anchor.
function kindOf(spec: string): string {
  return spec.includes(",") ? "point" : "node";
}

function pair(spec: string): T.Point {
  const [x, y] = spec.split(",");
  return { x: Number(x), y: Number(y) };
}

function center(box: T.Box): T.Point {
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}
