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
  private framer = new LayoutFramer();
  private measurer = new Measurer();
  private sheller = new NodeSheller();
  private edger = new EdgeDrawer();
  private annotator = new Annotator();
  private merger = new StyleMerger();

  // The exact text CssBagger produced last time, which is what the Base CSS tab
  // is diffed against (§4). It starts as whatever the tab starts with — an
  // exported page seeds it with derived text, and treating that as user edits
  // would copy the whole of Base CSS into My Style on the first Redraw.
  private derived: string;

  // Base CSS and My Style are tab text, and the workbench owns tab text — so
  // they are written back through `setTab` rather than injected here. The
  // store's own effect reaches the sink, which is also how My Style restyles the
  // picture without a Redraw. The other two user sinks are read straight off the
  // store, because injecting them is part of the sequence rather than a reaction
  // to a keystroke.
  constructor(
    private sinker: Sinker,
    private text: T.TabText,
    private setTab: T.SetTab,
  ) {
    this.derived = text["base-css"];
  }

  async redraw(dot: string): Promise<void> {
    const started = performance.now();
    const json = await this.parse(dot);
    if (json === null) return;

    const model = this.bagger.bag(json);
    const moved = this.rebase(this.cssBagger.bag(model));
    this.sinker.inject("main-html", this.framer.frame(model));
    this.sinker.inject("annotation-html", this.text.html);

    await painted();
    const boxes = this.measurer.measure();
    this.sinker.inject("node-shells", this.sheller.shells(boxes, model));
    this.sinker.inject("connectors", this.edger.draw(boxes, model));
    this.annotator.place(boxes);
    this.sinker.inject("status", timing(model, performance.now() - started, moved));

    // The user's script runs last, so it sees a finished canvas — and so it can
    // have the last word on any sink, the status line included.
    this.sinker.inject("my-js", this.text.js);
  }

  // A fresh DOT file starts afresh (§4): the baseline moves up to whatever the
  // tab holds, so nothing pending is carried into My Style.
  discardEdits(): void {
    this.derived = this.text["base-css"];
  }

  // Rewrite Base CSS, but move whatever the user typed there into My Style
  // first. My Style comes back canonical, because Redraw is when the tabs and
  // the DOM are made to agree (§4).
  private rebase(derived: string): number {
    const rebased = this.merger.rebase(this.derived, this.text["base-css"], this.text["my-style"]);
    if (rebased.myStyle !== this.text["my-style"]) this.setTab("my-style", rebased.myStyle);
    this.setTab("base-css", derived);
    this.derived = derived;
    return rebased.moved;
  }

  // The one sanctioned catch (§5). A workbench sees malformed DOT between
  // keystrokes; the message goes to the status line and the last good output
  // stays on the page. Everything after a successful parse throws freely.
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
// than leaving it to be trusted. It also clears the last parse error — and says
// when Base CSS edits were moved into My Style, so that never happens silently.
function timing(model: T.DiagramModel, ms: number, moved: number): string {
  const rebased = moved === 0 ? "" : ` — ${moved} edited rule${moved === 1 ? "" : "s"} moved to My Style`;
  return `${model.nodes.length} nodes, ${model.edges.length} edges — redrawn in ${Math.round(ms)} ms${rebased}`;
}
