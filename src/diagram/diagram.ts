// The diagram: the living state of the page. It holds the DOT, the style book,
// the notes and the script, and draws itself into `#diagram-canvas`.
//
// The style sink is not here. `#style-css` belongs to the `StyleBook`,
// which drives it through CSSOM — writing its `textContent` from `inject`
// would wipe every rule the book inserted, so the sink is not in the map.

import { Connectors } from "../connectors/connectors.ts";
import type { ConnectorRules } from "../connectors/types.ts";
import { DiagramPainter } from "../paint/diagram-painter.ts";
import { DotReader } from "../read/dot-reader.ts";
import { StyleBook } from "../style/style-book.ts";
import * as T from "../types.ts";
import { Topic } from "../ui/topic.ts";
import { annotationHtml } from "./notes.ts";

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

export class Diagram implements T.Diagram {
  readonly dot: Topic<string>;
  readonly notes: Topic<T.Note[]>;
  readonly script: Topic<string>;
  /** New with the diagram and seeded from the theme: that is the reset (§5). */
  readonly styleBook = new StyleBook();
  private painter = new DiagramPainter();

  /** Loaded once at boot and shared by every diagram the page adopts. */
  constructor(private readonly layout: T.GraphvizLayout, dot: string, script: string, notes: T.Note[], styles: T.Style[]) {
    this.dot = new Topic(dot);
    this.script = new Topic(script);
    this.notes = new Topic(notes);
    for (const style of styles) this.styleBook.add(style);
    // A note edit re-places the marks; it never draws.
    this.notes.sub(() => this.place());
  }

  async draw(): Promise<void> {
    let reader: DotReader;
    try {
      reader = new DotReader(this.dot.value);
    } catch (error) {
      // The one sanctioned catch (§2): malformed DOT is what you have after
      // most edits. `alert` is the message; the last picture is whatever is
      // still in the sinks. Nothing else here is allowed a catch.
      alert(error instanceof Error ? error.message : String(error));
      return;
    }
    const model = reader.model();
    // The book is kept, not flushed. The DOT's styles arrive at source 1 and are
    // refused wherever the user has written at 2, so a draw cannot take a
    // typed row back off them.
    for (const style of reader.styles()) this.styleBook.add(style);

    const ranks = this.layout.layout(reader.points());
    this.inject("diagram-html", this.painter.frame(model, ranks));

    await painted();
    const boxes = this.measure();
    const connectors = new Connectors(Connectors.place(ranks, boxes), this.rules());
    const svg = this.painter.svg(boxes, model, connectors.paths(model.edges));
    this.inject("cluster-shells", svg.clusters);
    this.inject("node-shells", svg.shells);
    this.inject("connector-paths", svg.connectors);
    this.place();
    this.inject("action-js", this.script.value);
  }

  // The short path: the notes are the model, so re-deriving the sink and
  // re-anchoring is all an edit needs. No parse, no frame, and no `await` —
  // `getBoundingClientRect` lays out synchronously, so nothing here can
  // interleave with a draw.
  place(): void {
    this.inject("annotation-html", annotationHtml(this.notes.value));
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

  private inject(sink: string, text: string): void {
    const write = SINK_WRITE.get(sink)!;
    write(document.getElementById(sink)!, text);
  }

  private measure(): T.Box[] {
    const nodes = document.querySelectorAll<HTMLElement>("#diagram-html .rank > [id]");
    return [...nodes].map((node) => ({
      id: node.id,
      left: node.offsetLeft,
      top: node.offsetTop,
      width: node.offsetWidth,
      height: node.offsetHeight,
    }));
  }

  // The other half of measuring: the connectors' numbers are CSS tokens in px,
  // and a pure package cannot read CSS (§4).
  private rules(): ConnectorRules {
    const style = getComputedStyle(document.getElementById("diagram-canvas")!);
    const px = (token: string) => parseFloat(style.getPropertyValue(token));
    return { clearance: px("--node-clearance"), inset: MARKER_INSET, lane: px("--connector-lane"), radius: px("--connector-radius") };
  }
}

/** Room the arrowhead needs at a face, so an attachment never sits on a corner. */
const MARKER_INSET = 6;

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
