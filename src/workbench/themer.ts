// The file verbs (§4): Load / Save DOT, Load / Save Theme, Export HTML, Save PNG.
// A theme is My Style text and nothing else — Base CSS is derived, so a theme
// that carried it would be a theme that goes stale the next time Redraw runs.
//
// What "standalone" means, settled in iteration 5: an exported file depends on
// nothing but a browser. It carries the workbench chrome CSS, the whole app
// bundle (viz.js inside it), and the five tab texts as a seed — so it opens,
// mounts, redraws, and can be edited and exported again with no network.

import type * as T from "../types.ts";

/** How much bigger than CSS pixels the PNG is rendered. */
const PNG_SCALE = 2;

/** Breathing room around the diagram, in CSS pixels. */
const PNG_MARGIN = 12;

export class Themer implements T.Themer {
  constructor(
    private text: T.TabText,
    private setTab: T.SetTab,
    private discardEdits: () => void,
  ) {}

  // A loaded file is a fresh start, so any pending Base CSS edit is dropped
  // rather than migrated into My Style (§4).
  loadDot(dot: string): void {
    this.discardEdits();
    this.setTab("dot", dot);
  }

  saveDot(): string {
    return this.text.dot;
  }

  load(css: string): void {
    this.setTab("theme", css);
  }

  save(): string {
    return this.text.style || this.text.theme;
  }

  async exportHtml(): Promise<string> {
    const [css, app] = await Promise.all([asset("shabnam-css"), asset("shabnam-app")]);
    return page(css, app, seed(this.text));
  }

  // The canvas is three stacked layers, two of them HTML, so there is no
  // `<canvas>` to read back — the picture has to be rebuilt as one SVG first.
  // `foreignObject` is what carries the whole stack across, and the browser is
  // the only thing that renders it: no rasterizer dependency, and no second
  // layout engine to disagree with the one on screen (§0).
  async exportPng(): Promise<Blob> {
    const canvas = document.getElementById("shabnam-canvas")!;
    const frame = framing(canvas);
    const chrome = await asset("shabnam-css");
    const svg = snapshot(canvas, frame, [chrome, this.text.theme, this.text.style]);
    return raster(svg, frame.crop);
  }
}

/** Hand a generated file to the user. The one browser download path we have. */
export function download(name: string, body: string | Blob, type: string): void {
  const url = URL.createObjectURL(typeof body === "string" ? new Blob([body], { type }) : body);
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------- PNG

// A PNG that is four fifths empty is not the diagram anyone asked for, so the
// picture is cropped to what is painted — but it has to be *laid out* at the
// canvas's full size or the columns reflow. So two rectangles: `page` is the
// canvas as the browser laid it out, `crop` is the window onto it.
type Framing = {
  page: Extent;
  crop: T.Box;
};

type Extent = {
  width: number;
  height: number;
};

// The layers share the canvas origin (§3.4), and shells and captions paint
// outside the boxes they surround, so the crop is the union of everything
// painted — not `scrollWidth`, which knows nothing about the SVG layer.
function framing(canvas: HTMLElement): Framing {
  const origin = canvas.getBoundingClientRect();
  const painted = [...canvas.querySelectorAll(".node, #shabnam-node-shells > g, #shabnam-connectors line, #shabnam-annotation-html *")];
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

// The canvas, rebuilt as one standalone SVG. Three things this has to get right,
// all learned from a first attempt that produced HTML boxes and no shells:
//
//   • The stylesheets come along inline. A serialized SVG is its own document
//     and inherits nothing from the page it was cut from.
//   • The clone is serialized as **XML**, not as HTML. `innerHTML` drops the SVG
//     namespace, and an `<svg>` without it is an unknown XHTML element — the
//     shells and connectors silently do not draw.
//   • The wrapper keeps `id="shabnam-canvas"` and inherits the canvas's own font, because
//     the chrome CSS positions the SVG and annotation layers against that id and
//     the font it would otherwise fall back to is the browser's serif default.
function snapshot(canvas: HTMLElement, frame: Framing, styles: string[]): string {
  const clone = canvas.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("style, script").forEach((element) => element.remove());

  const wrapper = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
  wrapper.setAttribute("id", "canvas");
  wrapper.setAttribute(
    "style",
    `position:relative;overflow:hidden;font:${getComputedStyle(canvas).font};` +
      `width:${frame.page.width}px;height:${frame.page.height}px`,
  );
  wrapper.append(...clone.childNodes);

  // The page is laid out at full size and then slid under the crop, which is
  // what a negative `x` / `y` on the foreignObject is for.
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

// Decode through an `Image`, draw, read back. Icons and shells already travel as
// data URIs (§3.4), so nothing is fetched and the canvas is never tainted.
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

// --------------------------------------------------------------------- HTML

// The dev page links its CSS and its bundle; an exported page has both inline.
// Two shipping paths, not a guard — an export of an export reads the inline one,
// which is base64 and has to be decoded back.
async function asset(id: string): Promise<string> {
  const element = document.getElementById(id)!;
  const url = element.getAttribute("src") ?? element.getAttribute("href");
  if (url !== null) return (await fetch(url)).text();
  return element.dataset.encoding === "base64" ? decode(element.textContent!) : element.textContent!;
}

// Why base64, learned the hard way: an inline `<script>` ends at the first
// `</script` *the HTML parser* sees, and the bundle contains this very file —
// including the template below. Escaping it in the source did not survive the
// bundler, which normalised `<\/script>` back. Base64 has no `<` in its
// alphabet, so the question cannot come up again.
function encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const chunks: string[] = [];

  // String.fromCharCode(...bytes) on a 2 MB bundle overflows the call stack.
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

// `</script>` inside user text would end the seed element early. `<` as \u003c
// is valid JSON and makes that impossible.
function seed(text: T.TabText): string {
  return JSON.stringify(text).replace(/</g, "\\u003c");
}

// The bundle rides as inert base64 text; a three-line bootstrap imports it as a
// module. That bootstrap is the only executable markup this function writes, and
// it contains no `<` of its own.
function page(css: string, app: string, json: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Shabnam — exported diagram</title>
    <style id="shabnam-css">${css}</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="application/json" id="shabnam-seed">${json}</script>
    <script type="text/plain" id="shabnam-app" data-encoding="base64">${encode(app)}</script>
    <script type="module">
      const source = atob(document.getElementById("shabnam-app").textContent.trim());
      const bytes = Uint8Array.from(source, (char) => char.charCodeAt(0));
      import(URL.createObjectURL(new Blob([bytes], { type: "text/javascript" })));
    </script>
  </body>
</html>
`;
}
