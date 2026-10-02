// Painter — owns `#diagram-canvas`, and is the only writer of the picture (§4).
//
// `draw` is the whole path: parse, hand the DOT's styles to the stylist, lay out
// the points, frame the HTML, wait for the browser to paint it, measure, route,
// draw one SVG around the measured boxes, place the notes, run the script.
// `annotate` is the short path a note edit takes.
//
// The string builders below the class are pure, and the ones the tests reach
// are exported, so the shapes of
// what is drawn are tested without a DOM. Coordinate contract, stated once:
// every number is CSS pixels in the padding-box space of `#diagram-canvas`.
// `#diagram-html` is in flow and `#diagram-svg` is `position: absolute; inset: 0`
// over it, so both layers share one origin. The SVG has no viewBox, which keeps
// one user unit equal to one pixel.

import type * as T from "../types.ts";
import { ICONS, renderAnnotation, SHELLS, shapeHtml, styleWords, svgUri } from "./shapes.ts";

const asHtml = (element: Element, text: string) => {
  element.innerHTML = text;
};

const asScript = (element: Element, text: string) => {
  const script = document.createElement("script");
  script.id = element.id;
  script.textContent = text;
  element.replaceWith(script);
};

/** sink id → how text goes in. A script only runs when it is a new element. */
const SINKS = new Map<string, (element: Element, text: string) => void>([
  ["diagram-html", asHtml],
  ["cluster-shells", asHtml],
  ["node-shells", asHtml],
  ["connector-paths", asHtml],
  ["annotation-html", asHtml],
  ["action-js", asScript],
]);

export class Painter implements T.Painter {
  constructor(
    private readonly canvas: HTMLElement,
    private readonly parser: T.Parser,
    private readonly layout: T.Layout,
    private readonly router: T.Router,
  ) {}

  async draw(sketch: T.Sketch, stylist: T.Stylist): Promise<void> {
    let parsed: T.Parsed;
    try {
      parsed = this.parser.parse(sketch.dot);
    } catch (error) {
      // The one sanctioned catch (§2): malformed DOT is what you have after most
      // edits. `alert` is the message; the last picture stays in the sinks.
      alert(error instanceof Error ? error.message : String(error));
      return;
    }
    const { model, styles, points } = parsed;
    // The book is kept, not flushed. The DOT's styles arrive at source 1 and are
    // refused wherever the user has written at 2, so a draw cannot take a typed
    // row back off them.
    for (const style of styles) stylist.add(style);

    const ranks = this.layout.ranks(points);
    this.frame(model, ranks);
    await painted();
    const boxes = this.measure();
    // A node that does not paint (`.invis`, 0×0) is not there for the router,
    // and neither is an edge that touches one.
    const shown = new Set(boxes.filter((box) => box.width || box.height).map((box) => box.id));
    const edges = model.edges.filter((edge) => shown.has(edge.from) && shown.has(edge.to));
    const placed = ranks.map((rank) => rank.filter((id) => shown.has(id))).filter((rank) => rank.length);
    const paths = this.router.route(placed, boxes, edges, this.#rules());
    this.drawSvg({ clusters: clusterSvg(boxes, model), shells: shellSvg(boxes, model), connectors: connectorSvg(paths) });
    this.annotate(sketch.notes);
    this.#inject("action-js", sketch.script);
  }

  frame(model: T.DiagramModel, ranks: T.Ranks): void {
    this.#inject("diagram-html", frameHtml(model, ranks));
  }

  measure(): T.NodeBox[] {
    const nodes = this.canvas.querySelectorAll<HTMLElement>("#diagram-html .rank > [id]");
    return [...nodes].map((node) => ({
      id: node.id,
      left: node.offsetLeft,
      top: node.offsetTop,
      width: node.offsetWidth,
      height: node.offsetHeight,
    }));
  }

  drawSvg(layers: T.SvgLayers): void {
    this.#inject("cluster-shells", layers.clusters);
    this.#inject("node-shells", layers.shells);
    this.#inject("connector-paths", layers.connectors);
  }

  // No parse, no frame, and no `await` — `getBoundingClientRect` lays out
  // synchronously, so nothing here can interleave with a draw.
  annotate(notes: T.Note[]): void {
    this.#inject("annotation-html", annotationHtml(notes));
    const layer = this.canvas.querySelector<HTMLElement>("#annotation-html")!;
    const origin = layer.getBoundingClientRect();
    for (const mark of layer.querySelectorAll<HTMLElement>("[data-selector]")) {
      const selector = mark.dataset.selector!;
      const found = document.querySelectorAll(selector);
      // A selector that matches nothing is a typo, and the only useful thing to
      // say is what it was. One that is not a selector throws on its own.
      if (found.length === 0) throw new Error(`annotation selector "${selector}" matches nothing`);
      const at = middle([...found].map((element) => element.getBoundingClientRect()));
      mark.style.setProperty("--anchor-x", `${at.x - origin.left}px`);
      mark.style.setProperty("--anchor-y", `${at.y - origin.top}px`);
    }
  }

  /**
   * The canvas as an SVG that carries HTML rather than shapes (§7).
   *
   * `<foreignObject>` says *this region holds another language, go ask that
   * engine*: Chromium lays the clone out with the engine that painted the
   * screen, so every CSS feature is correct by construction. `scrollWidth` /
   * `scrollHeight`, because the canvas scrolls and its rect is only the visible
   * pane. `XMLSerializer`, because the file is XML and HTML serialization leaves
   * `<img>` unclosed. The CSS sits in CDATA because `<` opens a tag in XML.
   */
  snapshot(css: string): string {
    const html = new XMLSerializer().serializeToString(this.canvas.cloneNode(true));
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.canvas.scrollWidth}" height="${this.canvas.scrollHeight}">` +
      `<style><![CDATA[${css}]]></style>` +
      `<foreignObject width="100%" height="100%">${html}</foreignObject>` +
      `</svg>`
    );
  }

  #inject(sink: string, text: string): void {
    SINKS.get(sink)!(this.canvas.querySelector(`#${sink}`)!, text);
  }

  // The router's numbers are CSS tokens, and a pure player cannot read CSS (§4).
  // `em` is the canvas's.
  #rules(): T.RouteRules {
    const style = getComputedStyle(this.canvas);
    const em = parseFloat(style.fontSize);
    const px = (token: string) => {
      const value = style.getPropertyValue(token).trim();
      return value.endsWith("em") ? parseFloat(value) * em : parseFloat(value);
    };
    return {
      gap: px("--gap"),
      clear: px("--node-clearance"),
      inset: px("--connector-inset"),
      lane: px("--connector-lane"),
      radius: px("--connector-radius"),
    };
  }
}

// The centre of the box that contains every match, in viewport coordinates.
function middle(rects: DOMRect[]): T.Point {
  return {
    x: (Math.min(...rects.map((rect) => rect.left)) + Math.max(...rects.map((rect) => rect.right))) / 2,
    y: (Math.min(...rects.map((rect) => rect.top)) + Math.max(...rects.map((rect) => rect.bottom))) / 2,
  };
}

// One frame, or a turn of the event loop — whichever comes first.
//
// The SVG is drawn around *measured* boxes, which are only real once the browser
// has laid the HTML out; `rAF` asks for that. But `rAF` does not fire in a
// background tab or under a virtual clock, and waiting on it alone leaves a
// redraw half-done forever. Layout is synchronous by the time a macrotask runs,
// so the fallback measures the same boxes: a floor under the frame.
function painted(): Promise<void> {
  return new Promise((done) => {
    requestAnimationFrame(() => done());
    setTimeout(() => done(), 0);
  });
}

// --- the HTML: model + ranks → `#diagram-html` ---------------------------------

/** Ranks arrive already ordered, so framing is an emit. Size and position are the browser's. */
export function frameHtml(model: T.DiagramModel, ranks: T.Ranks): string {
  const html = ranks.map((rank) => `<div class="rank">${rank.map((id) => shapeHtml(model.nodes.get(id)!)).join("")}</div>`);
  return `<div class="diagram">${html.join("")}</div>`;
}

// --- the SVG: measured boxes → clusters, shells, connectors -------------------

/** How far the shell stands off the measured box, in pixels. */
const SHELL_PAD = 4;
const ICON_SIZE = 18;
const CAPTION_DROP = 12;
const CLUSTER_PAD_X = 16;
const CLUSTER_PAD_BOTTOM = 16;
const CLUSTER_PAD_TOP_LABEL = 28;
const CLUSTER_PAD_TOP_NOLABEL = 16;

const ARROW = `<defs><marker id="connector-arrow" class="arrow" viewBox="0 0 10 10" refX="9" refY="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>`;

type Rect = { x: number; y: number; width: number; height: number };

/** One `<g>` per visible cluster, around every box in it and in its children. */
export function clusterSvg(boxes: T.NodeBox[], model: T.DiagramModel): string {
  const byId = new Map(boxes.map((box) => [box.id, box]));
  return model.clusters
    .filter((cluster) => cluster.name.startsWith("cluster") && !cluster.isInvis)
    .map((cluster) => clusterGroup(cluster, model, byId))
    .join("");
}

function clusterGroup(cluster: T.DiagramCluster, model: T.DiagramModel, byId: Map<T.NodeId, T.NodeBox>): string {
  const members = memberIds(cluster, model).map((id) => byId.get(id)).filter((box): box is T.NodeBox => box !== undefined);
  if (members.length === 0) return "";

  const left = Math.min(...members.map((box) => box.left));
  const top = Math.min(...members.map((box) => box.top));
  const right = Math.max(...members.map((box) => box.left + box.width));
  const bottom = Math.max(...members.map((box) => box.top + box.height));
  const hasLabel = cluster.label.trim().length > 0;
  const padTop = hasLabel ? CLUSTER_PAD_TOP_LABEL : CLUSTER_PAD_TOP_NOLABEL;
  const x = left - CLUSTER_PAD_X;
  const y = top - padTop;
  const width = right - left + CLUSTER_PAD_X * 2;
  const height = bottom - top + padTop + CLUSTER_PAD_BOTTOM;
  const label = hasLabel ? `<text class="label" x="${round(x + 12)}" y="${round(y + 17)}">${escape(cluster.label)}</text>` : "";

  return (
    `<g id="${cluster.name}" class="cluster_">` +
    `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" rx="8" ry="8" />` +
    label +
    `</g>`
  );
}

function memberIds(cluster: T.DiagramCluster, model: T.DiagramModel): T.NodeId[] {
  const ids = new Set<T.NodeId>(cluster.nodes);
  for (const name of cluster.clusters) {
    const child = model.clusters.find((one) => one.name === name);
    if (child) for (const id of memberIds(child, model)) ids.add(id);
  }
  return [...ids];
}

/**
 * The chrome drawn *around* each measured box: an outline, an icon badge, a
 * caption strip. Stroke-only, so it never covers the label the HTML drew.
 *
 * Every shell paints before every caption: a caption sits in the gap between
 * two boxes, and an SVG sibling drawn later covers one drawn earlier.
 */
function shellSvg(boxes: T.NodeBox[], model: T.DiagramModel): string {
  const pairs = boxes.map((box) => [shellRect(box), model.nodes.get(box.id)!] as const);
  return [...pairs.map(([rect, node]) => shell(rect, node)), ...pairs.map(([rect, node]) => caption(rect, node))].join("");
}

function shellRect(box: T.NodeBox): Rect {
  return { x: box.left - SHELL_PAD, y: box.top - SHELL_PAD, width: box.width + SHELL_PAD * 2, height: box.height + SHELL_PAD * 2 };
}

function shell(rect: Rect, node: T.DiagramNode): string {
  const template = node.shell && node.shell !== "none" ? (SHELLS.get(node.shell) ?? SHELLS.get("box")) : undefined;
  const outline = template ? template.replace(/{{(\w+)}}/g, (_, key: keyof Rect) => round(rect[key])) : "";
  const icon = badge(rect, node);
  // `#node-shells > g` already reaches every one of these; a class would be noise.
  return outline || icon ? `<g data-node="${node.id}">${outline}${icon}</g>` : "";
}

// The logo sits on the shell's top-left corner, outside the measured box.
function badge(rect: Rect, node: T.DiagramNode): string {
  const markup = ICONS.get(node.icon);
  if (markup === undefined) return "";
  const x = round(rect.x - ICON_SIZE / 2);
  const y = round(rect.y - ICON_SIZE / 2);
  return `<image class="icon" href="${svgUri(markup)}" x="${x}" y="${y}" width="${ICON_SIZE}" height="${ICON_SIZE}" />`;
}

// A caption strip only when the DOT asked for one: `caption` falls back to
// `label` in the model, and an unasked-for caption would print every label twice.
function caption(rect: Rect, node: T.DiagramNode): string {
  if (node.caption === node.label) return "";
  const x = round(rect.x + rect.width / 2);
  const y = round(rect.y + rect.height + CAPTION_DROP);
  return `<text class="label" x="${x}" y="${y}" text-anchor="middle">${escape(node.caption)}</text>`;
}

/** One arrow marker, then one path per edge. A `style` word is a class, as on
 *  nodes: `edge [style=invis]` holds a rank in place and draws nothing. */
function connectorSvg(paths: T.EdgePath[]): string {
  return (
    ARROW +
    paths
      .map(({ edge, d }) => {
        const classes = ["edge", ...styleWords(edge.style), ...edge.classes].join(" ");
        return `<path id="${edge.id}" class="${classes}" d="${d}" marker-end="url(#connector-arrow)" />`;
      })
      .join("")
  );
}

function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\\[nlr]/g, " ");
}

// Measured geometry is fractional. Half a pixel is enough, and it keeps two
// identical redraws producing identical strings.
function round(value: number): string {
  return (Math.round(value * 2) / 2).toString();
}

// --- the notes: the list → `#annotation-html` ---------------------------------
//
// One direction: the mark is derived from the list, never the list from the mark.

/** A row reaches the sink only when selector and text both say something:
 *  `querySelectorAll("")` throws, so a half-filled row would take the app down. */
export function placed(one: T.Note): boolean {
  return one.selector !== "" && one.text !== "";
}

export function annotationHtml(list: T.Note[]): string {
  return list.filter(placed).map(mark).join("\n");
}

// `--dx` / `--dy` are omitted when blank, so the theme's `var(--dx, 0px)` default
// applies rather than an empty declaration CSS would drop anyway.
function mark(one: T.Note): string {
  const offset = [["--dx", one.dx], ["--dy", one.dy]]
    .filter(([, value]) => value !== "")
    .map(([name, value]) => `${name}: ${value}`)
    .join("; ");
  return (
    `<div data-selector="${attr(one.selector)}"` +
    (one.class === "" ? "" : ` class="${attr(one.class)}"`) +
    (offset === "" ? "" : ` style="${attr(offset)}"`) +
    `>${renderAnnotation(one.text)}</div>`
  );
}

// How text enters an attribute: a selector holds quotes as a matter of course.
function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
