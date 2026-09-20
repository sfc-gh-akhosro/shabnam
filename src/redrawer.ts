// The conductor. It owns the sequence of §5 and nothing else.

import { CssBagger } from "./diagram/css-bagger.ts";
import { DiagramBagger } from "./diagram/diagram-bagger.ts";
import { EdgeDrawer } from "./diagram/edge-drawer.ts";
import { LayoutFramer } from "./diagram/layout-framer.ts";
import { NodeSheller } from "./diagram/node-sheller.ts";
import { Vizer } from "./diagram/vizer.ts";
import { StyleMerger } from "./style/style-merger.ts";
import type * as T from "./types.ts";
import { Annotator } from "./workbench/annotator.ts";
import { Measurer } from "./workbench/measurer.ts";
import { Sinker } from "./workbench/sinker.ts";

export class Redrawer implements T.Redrawer {
  private vizer = new Vizer();
  private bagger = new DiagramBagger();
  private cssBagger = new CssBagger();
  private merger = new StyleMerger();
  private framer = new LayoutFramer();
  private measurer = new Measurer();
  private sheller = new NodeSheller();
  private edger = new EdgeDrawer();
  private annotator = new Annotator();

  private derived: string;

  constructor(
    private sinker: Sinker,
    private text: T.TabText,
    private setTab: T.SetTab,
  ) {
    this.derived = "";
  }

  async redraw(dot: string): Promise<void> {
    const started = performance.now();
    const json = await this.parse(dot);
    if (json === null) return;

    const model = this.bagger.bag(json);
    const derived = this.cssBagger.bag(model);

    const rebased = this.merger.rebase(this.derived, derived, this.text.style);
    this.derived = derived;
    this.setTab("style", rebased.myStyle);
    this.sinker.inject("style-css", rebased.myStyle);

    this.sinker.inject("main-html", this.framer.frame(model));
    this.sinker.inject("annotation-html", this.text.annotation);

    await painted();
    const boxes = this.measurer.measure();
    this.sinker.inject("clusters", this.sheller.clusters(boxes, model));
    this.sinker.inject("node-shells", this.sheller.shells(boxes, model));
    this.sinker.inject("connectors", this.edger.draw(boxes, model));
    this.annotator.place(boxes);
    this.sinker.inject("status", timing(model, performance.now() - started));

    // The user's script runs last, so it sees a finished canvas.
    this.sinker.inject("action-js", this.text.action);
  }

  // A fresh DOT file starts afresh (§4): the baseline moves up.
  discardEdits(): void {
    this.derived = "";
  }

  // The one sanctioned catch (§5).
  private async parse(dot: string) {
    try {
      return await this.vizer.render(dot);
    } catch (error) {
      this.sinker.inject("status", String(error));
      return null;
    }
  }
}

// The "[ browser paints ]" step of §5. Base CSS reaches the page through the tab
// store, whose effect runs on a later microtask, so measuring in the same tick
// would size the boxes against the *previous* redraw's CSS. Waiting for a frame
// flushes the effect and the layout it causes.
function painted(): Promise<void> {
  return new Promise((done) => requestAnimationFrame(() => done()));
}

// §5 asks for well under a second, so the status line reports the number rather
// than leaving it to be trusted. It also clears the last parse error.
function timing(model: T.DiagramModel, ms: number): string {
  return `${model.nodes.length} nodes, ${model.edges.length} edges — redrawn in ${Math.round(ms)} ms`;
}
