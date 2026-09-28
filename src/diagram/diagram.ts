// Diagram facade. Workers in this folder stay private; this is the package API.

import type * as T from "../types.ts";
import { EdgeDrawer } from "./edge-drawer.ts";
import { LayoutFramer } from "./layout-framer.ts";
import { NodeSheller } from "./node-sheller.ts";

export class Diagram implements T.Diagram {
  private framer = new LayoutFramer();
  private sheller = new NodeSheller();
  private edger = new EdgeDrawer();

  frame(model: T.DiagramModel, positions: T.Positions): string {
    return this.framer.frame(model, positions);
  }

  clusters(boxes: T.Box[], model: T.DiagramModel): string {
    return this.sheller.clusters(boxes, model);
  }

  shells(boxes: T.Box[], model: T.DiagramModel): string {
    return this.sheller.shells(boxes, model);
  }

  connectors(boxes: T.Box[], model: T.DiagramModel, metrics: T.ConnectorMetrics): string {
    return this.edger.draw(boxes, model, metrics);
  }
}
