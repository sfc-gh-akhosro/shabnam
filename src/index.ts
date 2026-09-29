// The page is already written in `index.html`; the workbench fills it in. The
// layout's wasm loads first, once, so every draw after it is synchronous.

import { GraphvizLayout } from "./layout/graphviz-layout.ts";
import { Workbench } from "./workbench/workbench.ts";

new Workbench(document.body, await GraphvizLayout.load());
