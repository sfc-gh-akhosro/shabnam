// The page is already written in `index.html`; the players fill it in. The
// skeleton is taken first, before any piece fills it, so an exported page boots
// the same app over the same frame. The layout's wasm loads once, so every draw
// after it is synchronous.

import { Layout } from "./engine/layout.ts";
import { Painter } from "./engine/painter.ts";
import { Parser } from "./engine/parser.ts";
import { Router } from "./engine/router.ts";
import { Chrome } from "./ui/chrome.ts";
import { Workbench } from "./ui/workbench.ts";

const body = document.body;
const skeleton = [...body.children].filter((el) => el.tagName !== "SCRIPT").map((el) => el.outerHTML).join("\n");
const painter = new Painter(body.querySelector<HTMLElement>("#diagram-canvas")!, new Parser(), await Layout.load(), new Router());
new Chrome(body, skeleton, new Workbench(body, painter), painter);
