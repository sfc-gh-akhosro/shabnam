// File verbs: DOT load/save, export HTML / PNG.

import { Stylist } from "../stylist/stylist.ts";
import type * as T from "../types.ts";

const PNG_SCALE = 2;
const PNG_MARGIN = 12;

export class Files implements T.Files {
  constructor(
    private text: T.TabText,
    private setTab: T.SetTab,
    private stylist: Stylist,
  ) {}

  loadDot(dot: string): void {
    this.setTab("dot", dot);
    // A new diagram starts on a blank book holding the theme (§1). Redraw keeps
    // the book; Load is the one verb that does not.
    this.stylist.reset();
  }

  saveDot(): string {
    return this.text.dot;
  }

  async exportHtml(): Promise<string> {
    const [css, app] = await Promise.all([asset("app-css"), asset("app-js")]);
    return page(css, app, seed(this.text, bookFile(this.stylist.rows())));
  }

  async exportPng(): Promise<Blob> {
    const canvas = document.getElementById("diagram-canvas")!;
    const frame = framing(canvas);
    const svg = snapshot(canvas, frame, [await asset("app-css"), this.stylist.serialize()]);
    return raster(svg, frame.crop);
  }
}

export function download(name: string, body: string | Blob, type: string): void {
  const url = URL.createObjectURL(typeof body === "string" ? new Blob([body], { type }) : body);
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

/** The whole book, as the export seed carries it: an export paints what you see.
 *  Each entry keeps its source, so the exported page reproduces the same book. */
export function bookFile(rows: T.StyleRow[]): T.StyleFile {
  const file: T.StyleFile = {};
  for (const row of rows) {
    (file[row.selector] ??= {})[row.property] = { value: row.value, source: row.source };
  }
  return file;
}

type Framing = { page: { width: number; height: number }; crop: T.Box };

function framing(canvas: HTMLElement): Framing {
  const origin = canvas.getBoundingClientRect();
  const painted = [...canvas.querySelectorAll(".rank > [id], #node-shells > g, #connector-paths path, #annotation-html *")];
  const boxes = painted.map((element) => element.getBoundingClientRect());
  const left = Math.min(...boxes.map((box) => box.left)) - origin.left + canvas.scrollLeft;
  const top = Math.min(...boxes.map((box) => box.top)) - origin.top + canvas.scrollTop;
  const right = Math.max(...boxes.map((box) => box.right)) - origin.left + canvas.scrollLeft;
  const bottom = Math.max(...boxes.map((box) => box.bottom)) - origin.top + canvas.scrollTop;
  return {
    page: { width: canvas.scrollWidth, height: canvas.scrollHeight },
    crop: {
      id: "canvas",
      left: left - PNG_MARGIN,
      top: top - PNG_MARGIN,
      width: right - left + PNG_MARGIN * 2,
      height: bottom - top + PNG_MARGIN * 2,
    },
  };
}

function snapshot(canvas: HTMLElement, frame: Framing, styles: string[]): string {
  const clone = canvas.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("style, script").forEach((element) => element.remove());
  const wrapper = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
  wrapper.setAttribute("id", "diagram-canvas");
  wrapper.setAttribute(
    "style",
    `position:relative;overflow:hidden;font:${getComputedStyle(canvas).font};` +
      `width:${frame.page.width}px;height:${frame.page.height}px`,
  );
  wrapper.append(...clone.childNodes);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.crop.width}" height="${frame.crop.height}">` +
    `<style>${styles.join("\n")}</style>` +
    `<rect width="100%" height="100%" fill="#ffffff" />` +
    `<foreignObject x="${-frame.crop.left}" y="${-frame.crop.top}"` +
    ` width="${frame.page.width}" height="${frame.page.height}">` +
    new XMLSerializer().serializeToString(wrapper) +
    `</foreignObject></svg>`
  );
}

async function raster(svg: string, crop: T.Box): Promise<Blob> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const target = document.createElement("canvas");
  target.width = Math.ceil(crop.width * PNG_SCALE);
  target.height = Math.ceil(crop.height * PNG_SCALE);
  const pen = target.getContext("2d")!;
  pen.scale(PNG_SCALE, PNG_SCALE);
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

function seed(text: T.TabText, styles: T.StyleFile): string {
  return JSON.stringify({ ...text, styles }).replace(/</g, "\\u003c");
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
