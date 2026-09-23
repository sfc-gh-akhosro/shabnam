// Workbench runtime: redraw, sinks, measure, place.

import { Css } from "../css/css.ts";
import { Diagram } from "../diagram/diagram.ts";
import { Vizer } from "../diagram/vizer.ts";
import type * as T from "../types.ts";
import { appliedSheet, themeSheet } from "./files.ts";

const asHtml = (element: Element, text: string) => {
  element.innerHTML = text;
};

const asText = (element: Element, text: string) => {
  element.textContent = text;
};

const asScript = (element: Element, text: string) => {
  const script = document.createElement("script");
  script.id = element.id;
  script.textContent = text;
  element.replaceWith(script);
};

const SINK_WRITE = new Map<string, (element: Element, text: string) => void>([
  ["main-html", asHtml],
  ["clusters", asHtml],
  ["node-shells", asHtml],
  ["connectors", asHtml],
  ["annotation-html", asHtml],
  ["theme-css", asText],
  ["style-css", asText],
  ["action-js", asScript],
  ["status", asText],
]);

const SINK_PREFIX = "shabnam-";

export class Engine implements T.Workbench {
  private vizer = new Vizer();
  private diagram = new Diagram();
  private css = new Css();
  private lastDerived = "";
  private model: T.DiagramModel | undefined;

  constructor(
    private text: T.TabText,
    private setTab: T.SetTab,
    private selectedTheme: () => string,
  ) {}

  discardDerived(): void {
    this.lastDerived = "";
  }

  lastModel(): T.DiagramModel | undefined {
    return this.model;
  }

  async redraw(): Promise<void> {
    const started = performance.now();
    const json = await this.parse(this.text.dot);
    if (json === null) return;

    const model = this.diagram.bag(json);
    this.model = model;
    const derived = this.diagram.derived(model);
    const style = this.css.plus(this.css.minus(this.text.style, this.lastDerived), derived);
    this.lastDerived = derived;
    this.setTab("style", style);

    const sheet = themeSheet(this.selectedTheme(), this.text.theme);
    this.inject("theme-css", "");
    this.inject("style-css", appliedSheet(style, sheet, this.css));
    this.inject("main-html", this.diagram.frame(model));
    this.inject("annotation-html", this.text.annotation);

    await painted();
    const boxes = this.measure();
    this.inject("clusters", this.diagram.clusters(boxes, model));
    this.inject("node-shells", this.diagram.shells(boxes, model));
    this.inject("connectors", this.diagram.connectors(boxes, model));
    this.place(boxes);
    this.inject("status", `${model.nodes.length} nodes, ${model.edges.length} edges — redrawn in ${Math.round(performance.now() - started)} ms`);
    this.inject("action-js", this.text.action);
  }

  inject(sink: string, text: string): void {
    const write = SINK_WRITE.get(sink)!;
    write(document.getElementById(SINK_PREFIX + sink)!, text);
  }

  measure(): T.Box[] {
    const nodes = document.querySelectorAll<HTMLElement>("#shabnam-main-html .rank > [id]");
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
    for (const mark of document.querySelectorAll<HTMLElement>("#shabnam-annotation-html [data-anchor]")) {
      const spec = mark.dataset.anchor!;
      const at = spec.includes(",") ? pair(spec) : center(byId.get(spec)!);
      const offset = pair(mark.dataset.offset ?? "0,0");
      mark.style.left = `${at.x + offset.x}px`;
      mark.style.top = `${at.y + offset.y}px`;
    }
  }

  private async parse(dot: string) {
    try {
      return await this.vizer.render(dot);
    } catch (error) {
      this.inject("status", String(error));
      return null;
    }
  }
}

function painted(): Promise<void> {
  return new Promise((done) => requestAnimationFrame(() => done()));
}

function pair(spec: string): T.Point {
  const [x, y] = spec.split(",");
  return { x: Number(x), y: Number(y) };
}

function center(box: T.Box): T.Point {
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}
