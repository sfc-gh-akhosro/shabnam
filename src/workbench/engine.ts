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
    this.inject("connector-paths", this.diagram.connectors(boxes, model));
    this.place(boxes);
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

  place(boxes: T.Box[]): void {
    const byId = new Map(boxes.map((box) => [box.id, box]));
    for (const mark of document.querySelectorAll<HTMLElement>("#annotation-html [data-anchor]")) {
      const spec = mark.dataset.anchor!;
      const at = spec.includes(",") ? pair(spec) : center(byId.get(spec)!);
      const offset = pair(mark.dataset.offset ?? "0,0");
      mark.style.left = `${at.x + offset.x}px`;
      mark.style.top = `${at.y + offset.y}px`;
    }
  }
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

function pair(spec: string): T.Point {
  const [x, y] = spec.split(",");
  return { x: Number(x), y: Number(y) };
}

function center(box: T.Box): T.Point {
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}
