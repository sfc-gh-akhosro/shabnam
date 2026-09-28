// Workbench runtime: redraw, sinks, measure, place.
//
// The style sink is not here. `#style-css` belongs to the `Stylist`,
// which drives it through CSSOM (§3) — writing its `textContent` from `inject`
// would wipe every rule the Stylist inserted, so the sink is not in the map.

import { Diagram } from "../diagram/diagram.ts";
import { Vizer } from "../diagram/vizer.ts";
import { bagEntries, Stylist } from "../stylist/stylist.ts";
import * as T from "../types.ts";

const asHtml = (element: Element, text: string) => {
  element.innerHTML = text;
};

const asScript = (element: Element, text: string) => {
  const script = document.createElement("script");
  script.id = element.id;
  script.textContent = text;
  element.replaceWith(script);
};

const SINK_WRITE = new Map<string, (element: Element, text: string) => void>([
  ["diagram-html", asHtml],
  ["cluster-shells", asHtml],
  ["node-shells", asHtml],
  ["connector-paths", asHtml],
  ["annotation-html", asHtml],
  ["action-js", asScript],
]);

export class Engine implements T.Workbench {
  private vizer = new Vizer();
  private diagram = new Diagram();

  constructor(
    private text: T.TabText,
    private stylist: Stylist,
  ) {}

  async redraw(): Promise<void> {
    const json = await this.vizer.render(this.text.dot);

    const model = this.diagram.bag(json);
    // The book is kept, not flushed (§1). The DOT's rules arrive at source 1 and
    // are refused wherever the user has written at 2, so a redraw cannot take a
    // typed row back off them. `absorb` paints once at the end.
    this.stylist.absorb(bagEntries(this.diagram.derived(model), T.SOURCE.dot));

    this.inject("diagram-html", this.diagram.frame(model));
    this.inject("annotation-html", this.text.annotation);

    await painted();
    const boxes = this.measure();
    this.inject("cluster-shells", this.diagram.clusters(boxes, model));
    this.inject("node-shells", this.diagram.shells(boxes, model));
    this.inject("connector-paths", this.diagram.connectors(boxes, model, this.metrics()));
    this.place();
    this.inject("action-js", this.text.action);
  }

  inject(sink: string, text: string): void {
    const write = SINK_WRITE.get(sink)!;
    write(document.getElementById(sink)!, text);
  }

  measure(): T.Box[] {
    const nodes = document.querySelectorAll<HTMLElement>("#diagram-html .rank > [id]");
    return [...nodes].map((node) => ({
      id: node.id,
      left: node.offsetLeft,
      top: node.offsetTop,
      width: node.offsetWidth,
      height: node.offsetHeight,
    }));
  }

  // The other half of measuring: the two numbers the router needs are CSS, and a
  // pure worker cannot read CSS (§3.4). `1em` is the clearance a route prefers to
  // keep off a foreign node; `--connector-radius` curves its bends.
  private metrics(): T.ConnectorMetrics {
    const canvas = document.getElementById("diagram-canvas")!;
    const style = getComputedStyle(canvas);
    const em = parseFloat(style.fontSize);
    return { clearance: em, radius: px(style.getPropertyValue("--connector-radius"), em) };
  }

  // Annotations are positioned by CSS, not by us. An offset is whatever CSS
  // accepts — `200px`, `3em`, `50%`, `min(10vw, 4em)` — so we must not add it:
  // arithmetic on a length we did not parse is arithmetic we cannot do. What only
  // the page knows is where a thing ended up, so that is all this publishes, as
  // two custom properties. The theme spends them:
  //
  //   left: calc(var(--anchor-x) + var(--dx, 0px));
  //   top:  calc(var(--anchor-y) + var(--dy, 0px));
  //   transform: translate(-50%, -50%);
  //
  // A `%` in an offset therefore resolves against the annotation layer, and a
  // malformed one makes the declaration invalid at computed-value time — CSS
  // drops it and the mark sits at the layer's corner. That is CSS reporting a bad
  // value, so there is nothing here to validate.
  //
  // `data-selector` is a CSS selector, run as one, against the whole document —
  // not a node id. A node is `#core`, but so is a rank, a cluster, a class of
  // nodes, or the canvas itself, and none of those needed a feature. Several
  // matches anchor to the box that contains them all, so `.rank` is a row and
  // `#annotation-html` is the drawing's own frame — which is how "from the
  // origin" is said: its centre, less half of itself.
  //
  // Measured off the annotation layer rather than the canvas, because the layer
  // is what `left`/`top` on a mark are relative to. It is absolutely positioned
  // inside a scroller, so it travels with the content and its corner *is* the
  // coordinate origin — no scroll term, and no separate case for the canvas.
  place(): void {
    const layer = document.getElementById("annotation-html")!;
    const origin = layer.getBoundingClientRect();
    for (const mark of layer.querySelectorAll<HTMLElement>("[data-selector]")) {
      const selector = mark.dataset.selector!;
      const found = document.querySelectorAll(selector);
      // A selector that matches nothing is a typo, and the only useful thing to
      // say about it is what it was. A selector that is not a selector throws
      // from `querySelectorAll`, already naming itself.
      if (found.length === 0) throw new Error(`annotation selector "${selector}" matches nothing`);
      const at = middle([...found].map((element) => element.getBoundingClientRect()));
      mark.style.setProperty("--anchor-x", `${at.x - origin.left}px`);
      mark.style.setProperty("--anchor-y", `${at.y - origin.top}px`);
    }
  }
}

// The centre of the box that contains every match, in viewport coordinates. One
// match is the ordinary case and falls out of the same arithmetic.
function middle(rects: DOMRect[]): T.Point {
  return {
    x: (Math.min(...rects.map((rect) => rect.left)) + Math.max(...rects.map((rect) => rect.right))) / 2,
    y: (Math.min(...rects.map((rect) => rect.top)) + Math.max(...rects.map((rect) => rect.bottom))) / 2,
  };
}

// One frame, or a turn of the event loop — whichever comes first.
//
// The wait exists because the SVG layer is drawn around *measured* boxes (§3.4),
// and the boxes are only real once the browser has laid the HTML out. `rAF` is
// how you ask for that. But `rAF` is also a promise the browser does not always
// keep: it does not fire in a background tab, and it does not fire under a
// virtual clock. Waiting on it alone means a redraw started in a hidden tab never
// finishes and leaves the picture half-drawn, with no way back but another
// Redraw.
//
// So it is a race, not a wait. Layout is synchronous by the time a macrotask
// runs, so the fallback measures the same boxes; it is a floor under the frame,
// not a substitute for it.
function painted(): Promise<void> {
  return new Promise((done) => {
    requestAnimationFrame(() => done());
    setTimeout(() => done(), 0);
  });
}

// A CSS length in the two units a theme actually writes a radius in. Anything
// else, or nothing at all, falls back to the default rather than throwing: a
// missing token is a theme that did not say, not a broken diagram.
const RADIUS_DEFAULT = 6;

function px(value: string, em: number): number {
  const text = value.trim();
  const measure = parseFloat(text);
  if (Number.isNaN(measure)) return RADIUS_DEFAULT;
  return text.endsWith("em") ? measure * em : measure;
}
