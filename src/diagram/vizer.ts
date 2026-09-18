// The only viz.js caller in the app (§2). Nothing else reads DOT.

import { instance } from "@viz-js/viz";
import type * as T from "../types.ts";

type VizInstance = Awaited<ReturnType<typeof instance>>;

export class Vizer implements T.Vizer {
  private viz: VizInstance | undefined;

  // instance() compiles the wasm module, so it is loaded once and kept.
  async render(dot: string): Promise<T.VizJson> {
    if (!this.viz) this.viz = await instance();
    return this.viz.renderJSON(dot);
  }
}
