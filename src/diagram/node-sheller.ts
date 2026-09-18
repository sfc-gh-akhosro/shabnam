// Boxes + nodes → the shell layer (§3.4). The HTML layer owns the visible node:
// its background, border and label are real CSS on a real div. The shell is the
// chrome drawn *around* that measured rectangle — an outline, an icon badge, and
// a caption strip — so it is stroke-only and never covers the label.
//
// Coordinate contract, stated once and depended on by EdgeDrawer too: every
// number here is CSS pixels in the padding-box space of `#shabnam-canvas`. `#shabnam-main-html`
// is in flow and `#shabnam-main-svg` is `position: absolute; inset: 0` inside it, so the
// two layers share that one origin and scroll together. The SVG has no viewBox,
// which is what keeps one user unit equal to one pixel.

import type * as T from "../types.ts";

import boxShell from "../../svg/box.svg";

import bucket from "../../icon/bucket.svg";
import burst from "../../icon/burst.svg";
import chart from "../../icon/chart.svg";
import cloud from "../../icon/cloud.svg";
import database from "../../icon/database.svg";
import python from "../../icon/python.svg";
import star from "../../icon/star.svg";

/** How far the shell stands off the measured box, in pixels. */
export const SHELL_PAD = 4;

const ICON_SIZE = 18;
const CAPTION_DROP = 12;

// shell → the fragment drawn around a box. Unknown shell falls back to "box".
export const SHELL_SVG: T.ShellSvg = new Map([["box", boxShell]]);

// `icon=` → the glyph's markup. Keyed by filename, as the model's `icon` field is.
const ICON_SVG = new Map([
  ["bucket.svg", bucket],
  ["burst.svg", burst],
  ["chart.svg", chart],
  ["cloud.svg", cloud],
  ["database.svg", database],
  ["python.svg", python],
  ["star.svg", star],
]);

export class NodeSheller implements T.NodeSheller {
  shells(boxes: T.Box[], model: T.DiagramModel): string {
    const nodes = new Map(model.nodes.map((node) => [node.id, node]));
    const pairs = boxes.map((box) => [box, nodes.get(box.id)!] as const);

    // Every shell paints before every caption. An SVG sibling drawn later covers
    // one drawn earlier, and a caption sits in the gap between two boxes — so
    // grouping caption-with-its-own-shell would let the next node's shell strike
    // it through. Captions last, and their halo then has something to mask.
    return [
      ...pairs.map(([box, node]) => shell(box, node)),
      ...pairs.map(([box, node]) => caption(box, node)),
    ].join("");
  }
}

// The shell stands off the measured box by SHELL_PAD on every side.
function shellRect(box: T.Box): Record<string, number> {
  return {
    x: box.left - SHELL_PAD,
    y: box.top - SHELL_PAD,
    width: box.width + SHELL_PAD * 2,
    height: box.height + SHELL_PAD * 2,
  };
}

function shell(box: T.Box, node: T.Node): string {
  const rect = shellRect(box);
  const template = SHELL_SVG.get(node.shell) ?? SHELL_SVG.get("box")!;
  // Subgraph classes only. A grouping class no CSS selects is noise on the
  // element (§3.1) — `#shabnam-node-shells > g` already reaches every one of these.
  const classes = node.classes.join(" ");

  return (
    `<g class="${classes}" data-node="${node.id}">` +
    fill(template, rect) +
    badge(node, rect) +
    `</g>`
  );
}

function fill(template: string, rect: Record<string, number>): string {
  return template.replace(/{{(\w+)}}/g, (_, key: string) => round(rect[key]!));
}

// The logo sits on the shell's top-left corner, outside the measured box, so it
// cannot collide with the label the HTML layer already drew.
function badge(node: T.Node, rect: Record<string, number>): string {
  const markup = ICON_SVG.get(node.icon);
  if (markup === undefined) return "";

  const href = `data:image/svg+xml,${encodeURIComponent(markup)}`;
  const x = round(rect.x! - ICON_SIZE / 2);
  const y = round(rect.y! - ICON_SIZE / 2);
  return `<image class="badge" href="${href}" x="${x}" y="${y}" width="${ICON_SIZE}" height="${ICON_SIZE}" />`;
}

// The HTML layer owns the node's text, so a caption strip is drawn only when the
// DOT asked for one. `caption` falls back to `label` in the model (§3.1), and an
// unasked-for caption would print every label twice.
function caption(box: T.Box, node: T.Node): string {
  if (node.caption === node.label) return "";

  const rect = shellRect(box);
  const x = round(rect.x! + rect.width! / 2);
  const y = round(rect.y! + rect.height! + CAPTION_DROP);
  return `<text class="caption" x="${x}" y="${y}" text-anchor="middle">${escape(node.caption)}</text>`;
}

function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\[nlr]/g, " ");
}

// Measured geometry is fractional. Half a pixel of precision in the markup is
// enough, and it keeps two identical redraws producing identical strings.
function round(value: number): string {
  return (Math.round(value * 2) / 2).toString();
}
