// Inject text into a named sink of the canvas skeleton (§1). One of the two
// places that touch the live page; the other is Measurer.

import type * as T from "../types.ts";

const asHtml = (element: Element, text: string) => {
  element.innerHTML = text;
};

const asText = (element: Element, text: string) => {
  element.textContent = text;
};

// A `<script>` whose text is written after the parser has moved on does not run.
// Replacing the element with a fresh one does, which is how the JS tab executes.
// The canvas skeleton is static — Solid never re-renders it — so swapping a node
// out from under it is safe.
const asScript = (element: Element, text: string) => {
  const script = document.createElement("script");
  script.id = element.id;
  script.textContent = text;
  element.replaceWith(script);
};

// sink id → how its content is written. A markup sink takes markup; a style or
// status sink takes text and must never be parsed as markup; the script sink
// takes text and has to run it.
const SINK_WRITE = new Map<string, (element: Element, text: string) => void>([
  ["main-html", asHtml],
  ["node-shells", asHtml],
  ["connectors", asHtml],
  ["annotation-html", asHtml],
  ["base-css", asText],
  ["my-style", asText],
  ["my-js", asScript],
  ["status", asText],
]);

// Every id the app owns is prefixed, and this is why (§3.1): node ids are DOT
// names now, so a diagram with a node called `connectors` used to have its edge
// markup written into that node's own div — found in the browser on our own
// fixture. The page's ids and the diagram's ids are two spaces, and the prefix
// is the wall between them.
const SINK_PREFIX = "shabnam-";

export class Sinker implements T.Sinker {
  inject(sink: string, text: string): void {
    const write = SINK_WRITE.get(sink)!;
    write(document.getElementById(SINK_PREFIX + sink)!, text);
  }
}
