// Diagram facade. Workers in this folder stay private; this is the package API.

import type * as T from "../types.ts";
import { CssBagger } from "./css-bagger.ts";
import { DiagramBagger } from "./diagram-bagger.ts";
import { EdgeDrawer } from "./edge-drawer.ts";
import { LayoutFramer } from "./layout-framer.ts";
import { NodeSheller } from "./node-sheller.ts";

export class Diagram implements T.Diagram {
  private bagger = new DiagramBagger();
  private framer = new LayoutFramer();
  private css = new CssBagger();
  private sheller = new NodeSheller();
  private edger = new EdgeDrawer();

  bag(json: T.VizJson): T.DiagramModel {
    return this.bagger.bag(json);
  }

  frame(model: T.DiagramModel): string {
    return this.framer.frame(model);
  }

  derived(model: T.DiagramModel): T.StyleRules {
    return this.css.bag(model);
  }

  clusters(boxes: T.Box[], model: T.DiagramModel): string {
    return this.sheller.clusters(boxes, model);
  }

  shells(boxes: T.Box[], model: T.DiagramModel): string {
    return this.sheller.shells(boxes, model);
  }

  connectors(boxes: T.Box[], model: T.DiagramModel): string {
    return this.edger.draw(boxes, model);
  }
}
