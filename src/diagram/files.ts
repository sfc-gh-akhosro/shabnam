// File verbs over a diagram: export HTML and the picture snapshot (§7). Opening
// a DOT is not here — it makes a new `Diagram`, and files never touch a pane.

import { asFile } from "../style/book.ts";
import { serialize } from "../style/sheet.ts";
import type * as T from "../types.ts";
import type { Diagram } from "./diagram.ts";

export async function exportHtml(diagram: Diagram): Promise<string> {
  const [css, app] = await Promise.all([asset("app-css"), asset("app-js")]);
  return page(css, app, seed(diagram));
}

/** The painted canvas as a standalone picture, as the options ask. */
export async function exportPicture(options: T.PictureOptions): Promise<Blob> {
  const svg = snapshot(options.transparent);
  if (options.format === "svg") return new Blob([svg], { type: "image/svg+xml" });
  return raster(svg, options.scale);
}

/**
 * The canvas as an SVG that carries HTML rather than shapes (§4.1).
 *
 * `<foreignObject>` is SVG's own escape hatch: it says *this region holds another
 * language, go ask that engine*. So nothing is translated — Chromium lays the clone
 * out with the engine that painted the screen, and every CSS feature is correct by
 * construction, including ones nobody has thought of yet.
 *
 * `scrollWidth`/`scrollHeight` rather than the bounding rect: the canvas is a
 * scroll container, and the rect measures the visible pane. A diagram wider than
 * the pane was cut off at the edge of what happened to be scrolled into view.
 *
 * `XMLSerializer` rather than `innerHTML`, because this file is parsed as XML:
 * HTML serialization leaves `<img>` unclosed and emits `&nbsp;`, either of which
 * blanks the document. It also declares the XHTML namespace by itself, since the
 * clone came from an HTML document and is already in it.
 *
 * The CSS sits in `<![CDATA[ … ]]>` for the same reason — `<` opens a tag in XML,
 * and a style row's value may hold one. That is how text enters XML, not a guard.
 */
function snapshot(transparent: boolean): string {
  const canvas = document.getElementById("diagram-canvas")!;
  const html = new XMLSerializer().serializeToString(canvas.cloneNode(true));
  const css = transparent
    ? `${serialize()}\n#diagram-canvas { background: transparent }`
    : serialize();
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.scrollWidth}" height="${canvas.scrollHeight}">` +
    `<style><![CDATA[${css}]]></style>` +
    `<foreignObject width="100%" height="100%">${html}</foreignObject>` +
    `</svg>`
  );
}

export function download(name: string, body: string | Blob, type: string): void {
  const url = URL.createObjectURL(typeof body === "string" ? new Blob([body], { type }) : body);
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

async function raster(svg: string, scale: number): Promise<Blob> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const target = document.createElement("canvas");
  target.width = Math.ceil(image.naturalWidth * scale);
  target.height = Math.ceil(image.naturalHeight * scale);
  const pen = target.getContext("2d")!;
  pen.scale(scale, scale);
  pen.drawImage(image, 0, 0);
  return new Promise((done) => target.toBlob((blob) => done(blob!), "image/png"));
}

async function asset(id: string): Promise<string> {
  const element = document.getElementById(id)!;
  const url = element.getAttribute("src") ?? element.getAttribute("href");
  if (url !== null) return (await fetch(url)).text();
  return element.dataset.encoding === "base64" ? decode(element.textContent!) : element.textContent!;
}

function encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const chunks: string[] = [];
  for (let at = 0; at < bytes.length; at += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(at, at + 8192)));
  }
  return btoa(chunks.join(""));
}

function decode(base64: string): string {
  const binary = atob(base64.trim());
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** The seed the exported page boots from: both text tabs, the whole book, and the
 *  annotation list. The list travels, not the marks — the rows are the model, and
 *  the exported page derives its own HTML from them exactly as this one does. */
function seed(diagram: Diagram): string {
  const text: T.TabText = { dot: diagram.dot.value, action: diagram.script.value };
  const styles = asFile(diagram.styleBook.styles());
  return JSON.stringify({ ...text, styles, annotations: diagram.notes.value }).replace(/</g, "\\u003c");
}

function page(css: string, app: string, json: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Shabnam — exported diagram</title>
    <style id="app-css">${css}</style>
  </head>
  <body>
    <script type="application/json" id="app-seed">${json}</script>
    <script type="text/plain" id="app-js" data-encoding="base64">${encode(app)}</script>
    <script type="module">
      const source = atob(document.getElementById("app-js").textContent.trim());
      const bytes = Uint8Array.from(source, (char) => char.charCodeAt(0));
      import(URL.createObjectURL(new Blob([bytes], { type: "text/javascript" })));
    </script>
  </body>
</html>
`;
}
