// DiagramPainter facade. Workers in this folder stay private; this is the package API.

import type * as T from "../types.ts";
import { EdgeDrawer } from "./edge-drawer.ts";
import { LayoutFramer } from "./layout-framer.ts";
import { NodeSheller } from "./node-sheller.ts";

export class DiagramPainter implements T.DiagramPainter {
  private framer = new LayoutFramer();
  private sheller = new NodeSheller();
  private edger = new EdgeDrawer();

  frame(model: T.DiagramModel, ranks: T.Ranks): string {
    return this.framer.frame(model, ranks);
  }

  svg(boxes: T.Box[], model: T.DiagramModel, metrics: T.ConnectorMetrics): T.SvgLayers {
    return {
      clusters: this.sheller.clusters(boxes, model),
      shells: this.sheller.shells(boxes, model),
      connectors: this.edger.draw(boxes, model, metrics),
    };
  }
}
