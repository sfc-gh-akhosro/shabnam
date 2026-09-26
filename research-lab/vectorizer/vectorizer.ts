// PARKED. Not in `src/`, not on any code path, and not imported by anything.
//
// This is a working HTML→SVG translator: the painted canvas turned into real
// `<rect>` / `<text>` / `<image>`, so the file can be opened by something that is
// not a browser. It shipped briefly and was replaced by the `<foreignObject>`
// snapshot in `src/workbench/files.ts` (§4.1).
//
// Why it lost, in one line: **a translator is a dictionary with one entry per CSS
// feature, and Shabnam ships a CSS editor.** Users can always reach a property the
// dictionary lacks, and then the export quietly disagrees with the screen. It had
// already dropped shadows and per-side borders once each, and the target is
// Chromium (§0), where `<foreignObject>` is simply correct and free.
//
// It is kept because the reasoning only holds while the target is a browser. If
// portable SVG is ever wanted — Illustrator, print, server-side rasterization with
// `resvg`, none of which can read a `<foreignObject>` — this is the starting point
// rather than a blank file. See `docs/archive.md` for the measurements.
//
// It has no dependencies beyond `src/types.ts`. To revive it: move it back to
// `src/workbench/`, restore the `../types.ts` import, and call it from `Files`.
//
// ---------------------------------------------------------------------------
//
// A picture export is a translation, not a wrapper. Parking the HTML layer in a
// `<foreignObject>` produces a file only a browser can draw — Illustrator,
// Inkscape and Figma show a blank — so the boxes become `<rect>`, the text
// becomes `<text>`, and the icons become `<image>`. Three primitives is all the
// HTML layer (§3.3) has ever needed.
//
// We translate; we do not re-implement. Layout and CSS are not recomputed: the
// browser is asked what it already decided. `getClientRects()` on a *text node*
// hands back one rect per rendered line, so wrapping and `<br>` are not ours to
// work out, and `getComputedStyle` hands back paint already resolved, so `var()`
// never has to work in a foreign viewer.
//
// This file reads the live page, which is why it belonged in `workbench/` and not
// in `diagram/` (§3).

import type * as T from "../../src/types.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

/** The canvas as standalone SVG, cropped to `crop` in canvas padding-box pixels. */
export function vectorize(canvas: HTMLElement, crop: T.Box): string {
  const origin = paddingOrigin(canvas);
  const shadows: Shadows = new Map();
  const body: string[] = [];

  // Canvas order is HTML layer, SVG layer, annotations — which is also paint
  // order, so walking the children in place keeps z-order without a second
  // opinion about it. `<style>` and `<script>` are not pictures.
  for (const child of canvas.children) {
    if (child.tagName === "STYLE" || child.tagName === "SCRIPT") continue;
    if (child instanceof SVGElement) body.push(flatten(child));
    else paint(child, origin, shadows, body);
  }

  return (
    `<svg xmlns="${SVG_NS}" width="${num(crop.width)}" height="${num(crop.height)}"` +
    ` viewBox="${num(crop.left)} ${num(crop.top)} ${num(crop.width)} ${num(crop.height)}">` +
    defs(shadows) +
    `<rect x="${num(crop.left)}" y="${num(crop.top)}"` +
    ` width="${num(crop.width)}" height="${num(crop.height)}" fill="#ffffff" />` +
    body.join("") +
    `</svg>`
  );
}

// The coordinate contract of §3.4: every number is a CSS pixel in the canvas's
// padding-box space, which is the origin `#diagram-svg` already draws in. Client
// rects are viewport-relative, so the border and the scroll come back out —
// otherwise the two layers would drift apart by the canvas border width.
type Origin = { left: number; top: number };

function paddingOrigin(canvas: HTMLElement): Origin {
  const rect = canvas.getBoundingClientRect();
  const style = getComputedStyle(canvas);
  return {
    left: rect.left + parseFloat(style.borderLeftWidth) - canvas.scrollLeft,
    top: rect.top + parseFloat(style.borderTopWidth) - canvas.scrollTop,
  };
}

function place(rect: DOMRect, origin: Origin): T.Box {
  return {
    id: "",
    left: rect.left - origin.left,
    top: rect.top - origin.top,
    width: rect.width,
    height: rect.height,
  };
}

// ------------------------------------------------------------------ HTML layer

// An element is its own box, then its children in order. A text node is drawn
// with its *parent's* computed style, which is what makes nesting free: the run
// inside a `<strong>` is a text node whose parent resolves to a bold font, so
// there is nothing to reconstruct and no `<tspan>` to position.
function paint(element: Element, origin: Origin, shadows: Shadows, out: string[]): void {
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return;

  out.push(shape(element, style, origin, shadows));
  for (const child of element.childNodes) {
    if (child instanceof Text) out.push(...glyphs(child, style, origin));
    else if (child instanceof HTMLImageElement) out.push(picture(child, origin));
    else if (child instanceof Element) paint(child, origin, shadows, out);
  }
}

// The element's background, border and shadow. Nothing else about a box is
// expressible: gradients, `filter` and `clip-path` are left out rather than faked.
function shape(element: Element, style: CSSStyleDeclaration, origin: Origin, shadows: Shadows): string {
  const box = place(element.getBoundingClientRect(), origin);
  if (box.width === 0 || box.height === 0) return "";

  const fill = paints("fill", style.backgroundColor);
  const sides = borders(style);
  const uniform = sides.length === 4 && agreed(sides);

  // A shadow needs something to cast it. A box that paints nothing has no
  // silhouette here, so its shadow is the one CSS draws that we cannot — see V9.
  if (fill === NOTHING && sides.length === 0) return "";

  // A CSS border is drawn inside the border box; an SVG stroke straddles its
  // path. Half a width of inset is what makes the two land in the same place.
  const edge = uniform ? sides[0]! : null;
  const inset = edge === null ? 0 : edge.width / 2;
  const stroke = edge === null ? "" : paints("stroke", edge.color) + ` stroke-width="${num(edge.width)}"${dashes(edge)}`;

  const body =
    `<rect x="${num(box.left + inset)}" y="${num(box.top + inset)}"` +
    ` width="${num(box.width - inset * 2)}" height="${num(box.height - inset * 2)}"` +
    radius(style, inset) +
    fill +
    stroke +
    alpha(style) +
    ` />`;

  // Four sides that disagree cannot be one stroke, so they are drawn as the four
  // lines they are. The rect still carries the fill, the radius and the shadow.
  const rules = uniform ? "" : sides.map((side) => line(side, box)).join("");
  const cast = shadow(style, shadows);
  return cast === "" ? body + rules : `<g ${cast}>${body}${rules}</g>`;
}

// Every side that is actually drawn. One entry means one border; four that agree
// become a single stroked rect, and four that disagree become four lines — which
// is the shipped theme's own case, since `.cell` writes `border-bottom` alone.
type Side = { edge: "top" | "right" | "bottom" | "left"; width: number; color: string; style: string };

const EDGES = ["top", "right", "bottom", "left"] as const;

function borders(style: CSSStyleDeclaration): Side[] {
  return EDGES.map((edge) => ({
    edge,
    width: parseFloat(style.getPropertyValue(`border-${edge}-width`)),
    color: style.getPropertyValue(`border-${edge}-color`),
    style: style.getPropertyValue(`border-${edge}-style`),
  })).filter((side) => side.width > 0 && side.style !== "none" && pixel(side.color) !== null);
}

function agreed(sides: Side[]): boolean {
  const shape = (side: Side) => `${side.width} ${side.color} ${side.style}`;
  return new Set(sides.map(shape)).size === 1;
}

// One side, drawn down the middle of the border it replaces.
function line(side: Side, box: T.Box): string {
  const half = side.width / 2;
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  const ends = new Map<string, [number, number, number, number]>([
    ["top", [box.left, box.top + half, right, box.top + half]],
    ["bottom", [box.left, bottom - half, right, bottom - half]],
    ["left", [box.left + half, box.top, box.left + half, bottom]],
    ["right", [right - half, box.top, right - half, bottom]],
  ]);

  const [x1, y1, x2, y2] = ends.get(side.edge)!;
  return (
    `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}"` +
    paints("stroke", side.color) +
    ` stroke-width="${num(side.width)}"${dashes(side)} />`
  );
}

// `dashed` and `dotted` scale with the stroke, the way a browser draws them.
// Every other border style paints solid.
const DASHES = new Map<string, number[]>([
  ["dashed", [3, 2]],
  ["dotted", [1, 2]],
]);

function dashes(side: { width: number; style: string }): string {
  const pattern = DASHES.get(side.style);
  if (pattern === undefined) return "";
  return ` stroke-dasharray="${pattern.map((step) => num(step * side.width)).join(" ")}"`;
}

function radius(style: CSSStyleDeclaration, inset: number): string {
  const corner = parseFloat(style.borderTopLeftRadius);
  if (Number.isNaN(corner) || corner === 0) return "";
  return ` rx="${num(Math.max(corner - inset, 0))}"`;
}

function alpha(style: CSSStyleDeclaration): string {
  const opacity = parseFloat(style.opacity);
  return opacity === 1 ? "" : ` opacity="${num(opacity)}"`;
}

// An `<img>` is already a data URI by the time it reaches the page
// (`node-shaper.ts`), so the icon travels inside the file with no fetch.
function picture(image: HTMLImageElement, origin: Origin): string {
  const box = place(image.getBoundingClientRect(), origin);
  if (box.width === 0 || box.height === 0) return "";
  return (
    `<image href="${escape(image.src)}" x="${num(box.left)}" y="${num(box.top)}"` +
    ` width="${num(box.width)}" height="${num(box.height)}" />`
  );
}

// ----------------------------------------------------------------------- text

/** One `<text>` per rendered line of this text node. */
function glyphs(text: Text, style: CSSStyleDeclaration, origin: Origin): string[] {
  const ascent = baseline(style);
  return rows(text).map(({ body, rect }) => {
    const box = place(rect, origin);
    return (
      `<text x="${num(box.left)}" y="${num(box.top + ascent)}"` +
      ` font-family="${escape(style.fontFamily)}" font-size="${escape(style.fontSize)}"` +
      weight(style) +
      paints("fill", style.color) +
      `>${escape(body)}</text>`
    );
  });
}

function weight(style: CSSStyleDeclaration): string {
  const bold = style.fontWeight === "400" ? "" : ` font-weight="${escape(style.fontWeight)}"`;
  const italic = style.fontStyle === "normal" ? "" : ` font-style="${escape(style.fontStyle)}"`;
  const line = style.textDecorationLine === "none" ? "" : ` text-decoration="${escape(style.textDecorationLine)}"`;
  return bold + italic + line;
}

// The baseline, from real font metrics rather than a fraction of the font size:
// a 2D canvas set to the same computed font reports the ascent the browser used.
// The range rect of a text run is its inline box, so `top + ascent` is the
// baseline the page drew on.
//
// Built on first use, not at import: `files.ts` is reachable from the pure half
// of the suite, where there is no `document` to make a canvas with. One context
// serves both font metrics and colour conversion; `willReadFrequently` is for the
// latter, which reads a pixel back per colour.
let shared: CanvasRenderingContext2D | undefined;

function context(): CanvasRenderingContext2D {
  return (shared ??= document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true })!);
}

function baseline(style: CSSStyleDeclaration): number {
  const pen = context();
  pen.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return pen.measureText("x").fontBoundingBoxAscent;
}

type Row = { body: string; rect: DOMRect };

// Which characters are on which line. `getClientRects()` gives one rect per line
// but says nothing about where the text broke, so the characters are walked and
// grouped by the top they landed on — a label is a handful of them, and this is
// the only way to get the line's *text* as well as its box.
//
// A collapsed space has no box at all, which is exactly when it should not be
// drawn, so an empty rect ends the run it was in.
function rows(text: Text): Row[] {
  const range = document.createRange();
  const found: Row[] = [];
  let line: Row | null = null;

  for (let at = 0; at < text.length; at++) {
    range.setStart(text, at);
    range.setEnd(text, at + 1);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;

    if (line !== null && Math.abs(line.rect.top - rect.top) < 1) line = grow(line, text, at, rect);
    else found.push((line = { body: text.data[at]!, rect }));
  }
  return found.filter((row) => row.body.trim() !== "");
}

function grow(line: Row, text: Text, at: number, rect: DOMRect): Row {
  line.body += text.data[at]!;
  const right = Math.max(line.rect.right, rect.right);
  line.rect = new DOMRect(line.rect.left, line.rect.top, right - line.rect.left, line.rect.height);
  return line;
}

// ------------------------------------------------------------------- SVG layer

// The shells, connectors and cluster rects are SVG already — but their `fill`
// and `stroke` come from classes (§3.4), so copying the markup verbatim exports
// an invisible layer. The clone keeps the geometry and wears the computed paint.
const SVG_PAINT = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "paint-order",
];

// Which of those are colours. `fill-opacity` and `stroke-opacity` are deliberately
// *not* in the list above: a colour's own alpha has to end up in them, so copying
// them in the loop would overwrite what the colour just said.
const SVG_INK = new Set(["fill", "stroke"]);

function flatten(layer: SVGElement): string {
  const clone = layer.cloneNode(true) as SVGElement;
  const live = [layer, ...layer.querySelectorAll("*")];
  const copies = [clone, ...clone.querySelectorAll("*")];

  live.forEach((element, index) => bake(element, copies[index]!));
  return [...clone.childNodes].map((child) => new XMLSerializer().serializeToString(child)).join("");
}

function bake(live: Element, copy: Element): void {
  const style = getComputedStyle(live);
  for (const property of SVG_PAINT) {
    const value = style.getPropertyValue(property);
    if (value === "") continue;
    if (SVG_INK.has(property)) inked(copy, property, value, style);
    else copy.setAttribute(property, value);
  }
  // The class was how paint arrived; the attributes are how it leaves. Keeping it
  // would be a second opinion in a file with no stylesheet.
  copy.removeAttribute("class");
}

// A `fill` whose colour carries alpha \u2014 `.cluster_` takes a 10% green from the
// theme \u2014 has to leave as a hex plus a `fill-opacity`, because SVG keeps the two
// apart. CSS can also have said `fill-opacity` itself, and the two multiply the
// way they do on screen.
function inked(copy: Element, property: string, value: string, style: CSSStyleDeclaration): void {
  const paint = pixel(value);
  if (paint === null) {
    copy.setAttribute(property, "none");
    return;
  }

  const own = parseFloat(style.getPropertyValue(`${property}-opacity`));
  const opacity = paint.alpha * (Number.isNaN(own) ? 1 : own);
  copy.setAttribute(property, paint.hex);
  if (opacity !== 1) copy.setAttribute(`${property}-opacity`, String(Math.round(opacity * 1000) / 1000));
}

// ---------------------------------------------------------------------- shadow
//
// `box-shadow` is the one property here whose computed value has to be taken
// apart rather than handed straight over, because SVG says the same thing with a
// `<filter>` and `<feDropShadow>`. It is not the CSS parser §3.5 refuses: the
// value has already been computed and normalised by the browser to
// `<color> <dx> <dy> <blur> <spread>`, comma-separated, and reading it is the
// same act as the `parseFloat` on a border width two functions up. No sheet is
// read back, and nothing round-trips.
//
// This matters more than it sounds: `.paper` carries `0 0 2px`, which is what
// draws the *outline* of every node in the shipped theme. Dropping shadows makes
// a diagram look like it lost its borders, because it effectively did.

/** Every distinct `box-shadow` value in the picture → the filter id it earned. */
type Shadows = Map<string, number>;

type Cast = { dx: number; dy: number; blur: number; color: Ink };

function shadow(style: CSSStyleDeclaration, shadows: Shadows): string {
  const value = style.boxShadow;
  if (value === "none" || value === "") return "";
  if (casts(value).length === 0) return "";

  const id = shadows.get(value) ?? shadows.size + 1;
  shadows.set(value, id);
  return `filter="url(#shadow-${id})"`;
}

function defs(shadows: Shadows): string {
  if (shadows.size === 0) return "";
  const filters = [...shadows].map(([value, id]) => filter(value, id));
  return `<defs>${filters.join("")}</defs>`;
}

// The region has to be generous: the default filter box is 10% of the element on
// each side, which crops a 12px blur off a small node. A blurred shadow also
// reaches outside the box the crop was measured from — `CROP_MARGIN` in
// `files.ts` is what keeps it inside the page.
function filter(value: string, id: number): string {
  const drops = casts(value).map(
    (cast) =>
      `<feDropShadow dx="${num(cast.dx)}" dy="${num(cast.dy)}"` +
      ` stdDeviation="${num(cast.blur / 2)}"` +
      ` flood-color="${cast.color.hex}" flood-opacity="${cast.color.alpha}" />`,
  );
  return `<filter id="shadow-${id}" x="-50%" y="-50%" width="200%" height="200%">${drops.join("")}</filter>`;
}

// CSS layers each shadow over the same box; chained `feDropShadow` primitives
// shadow each other's output instead. For the subtle, few-pixel shadows a theme
// actually writes the two are indistinguishable, and chaining is four words of
// markup against a `feMerge` tree.
//
// `inset` has no `feDropShadow` equivalent and is skipped. So is `spread`, the
// fourth length — blur is the only softness a drop shadow has.
function casts(value: string): Cast[] {
  return layers(value)
    .filter((layer) => !layer.includes("inset"))
    .map(read)
    .filter((cast): cast is Cast => cast !== null);
}

function read(layer: string): Cast | null {
  const color = pixel(/^\s*(rgba?\([^)]*\)|#[0-9a-fA-F]+|[a-zA-Z]+)/.exec(layer)?.[1] ?? "");
  if (color === null) return null;

  const lengths = [...layer.matchAll(/(-?[\d.]+)px/g)].map((found) => Number(found[1]));
  const [dx, dy, blur] = lengths;
  return { dx: dx ?? 0, dy: dy ?? 0, blur: blur ?? 0, color };
}

// Top-level commas only: `rgba(0, 0, 0, 0.08)` is full of the same character
// that separates one shadow from the next.
function layers(value: string): string[] {
  const found: string[] = [];
  let depth = 0;
  let start = 0;
  for (let at = 0; at < value.length; at++) {
    if (value[at] === "(") depth++;
    else if (value[at] === ")") depth--;
    else if (value[at] === "," && depth === 0) {
      found.push(value.slice(start, at));
      start = at + 1;
    }
  }
  found.push(value.slice(start));
  return found;
}

// ---------------------------------------------------------------------- shared

// Chrome computes `color-mix()` — which the theme uses — to a CSS Color 4
// `color(srgb ...)` value. A browser draws that; an illustrator does not, and a
// picture export exists to be opened somewhere else.
//
// So the colour is *painted* and read back: one pixel on a cleared canvas is the
// browser's own answer to "what does this value look like", in the one notation
// every viewer has understood for twenty years. Assigning `fillStyle` is not
// enough on its own — Chrome hands `color(srgb ...)` straight back.
//
// The pixel also answers "is there anything here at all", which is why this is one
// function and not a `paintable` predicate beside it: every string test for
// transparency is a guess. `endsWith(", 0)")` was the guess, and it called
// `rgb(0, 0, 0)` and `rgb(255, 255, 0)` invisible — black and yellow.
//
// Canvas stores colour premultiplied, so a translucent channel can come back a
// step off. That is under half a percent of a channel, and invisible.

/** A colour, as both notations a viewer might want it in. */
type Ink = { hex: string; alpha: number };

const NOTHING = ` fill="none"`;

/**
 * `fill="#rrggbb" fill-opacity="0.1"` — the SVG 1.1 form, which is the portable
 * one. `rgba()` in a `fill` attribute is a CSS colour in an SVG paint slot: Chrome
 * takes it, and the viewers this export exists for need the opacity in its own
 * attribute. An 8-digit hex has the same problem.
 */
function paints(base: "fill" | "stroke", color: string): string {
  const paint = pixel(color);
  if (paint === null) return ` ${base}="none"`;
  const opacity = paint.alpha === 1 ? "" : ` ${base}-opacity="${paint.alpha}"`;
  return ` ${base}="${paint.hex}"${opacity}`;
}

/** The colour's own pixel, or `null` when there is nothing to paint. */
function pixel(color: string): Ink | null {
  if (color === "" || color === "none" || color === "transparent") return null;

  const pen = context();
  pen.clearRect(0, 0, 1, 1);
  pen.fillStyle = color;
  pen.fillRect(0, 0, 1, 1);

  const data = pen.getImageData(0, 0, 1, 1).data;
  const opacity = data[3]!;
  if (opacity === 0) return null;
  return {
    hex: `#${[data[0]!, data[1]!, data[2]!].map(pad).join("")}`,
    alpha: Math.round((opacity / 255) * 1000) / 1000,
  };
}

function pad(channel: number): string {
  return channel.toString(16).padStart(2, "0");
}

// Half a pixel of precision, the same as the SVG layer's own rounding, so two
// identical exports produce identical bytes.
function num(value: number): string {
  return (Math.round(value * 2) / 2).toString();
}

function escape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
