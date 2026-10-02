// Chrome — the nav bar: the verbs, the chords that ask for them, and files in
// and out (§6, §7).
//
// One `ACTIONS` map from verb to what it does, shared by the toolbar's
// `data-action` buttons and the keyboard, so a verb is an entry and nobody
// touches a switch. A chord is `Cmd` on macOS and `Ctrl` elsewhere — one
// intent, so both read as one modifier. A key without it is typing.
//
// Files never touch a pane: whatever comes in is handed to `workbench.adopt`.

import { asProject, asFile, fileStyles } from "../engine/stylist.ts";
import type * as T from "../types.ts";
import { Checks, DialogAsk, Radios, Topic } from "./pieces.ts";
import { TABS } from "./workbench.ts";

import logo from "../../icon/shabnam-logo.svg";

const LOGO_URI = `data:image/svg+xml,${encodeURIComponent(logo)}`;

/** Verb → what it does. */
const ACTIONS = new Map<T.Action, (chrome: Chrome) => void | Promise<void>>([
  ["draw", (chrome) => chrome.workbench.draw()],
  ["open", (chrome) => chrome.projectPicker.click()],
  ["save", (chrome) => chrome.save()],
  ["load-dot", (chrome) => chrome.dotPicker.click()],
  ["export-picture", (chrome) => chrome.exportPicture()],
  ["export-html", (chrome) => chrome.exportHtml()],
]);

/** Key → verb. The browser-claimed ones (`p`, `s`, `o`, `l`) are
 *  `preventDefault`ed by the listener, which is why `Cmd+P` exports. */
const CHORDS = new Map<string, T.Action>([
  ["enter", "draw"],
  ["o", "open"],
  ["s", "save"],
  ["l", "load-dot"],
  ["p", "export-picture"],
  ["e", "export-html"],
]);

const STARTER_DOT = `digraph starter {
  rankdir=LR

  subgraph cluster_source {
    label = "Source"
    blobs [label="![bucket](bucket.svg) Blobs" caption="Object Store"]
  }

  core [label="![star](star.svg) Platform Core"]
  app  [label="App"]

  blobs -> core
  core -> app
}
`;

/** The two cases worth seeing: a node anchor offset downwards, and the layer
 *  itself used as an origin — its centre, less half of itself. */
const STARTER_NOTES: T.Note[] = [
  { selector: "#core", dx: "", dy: "4em", class: "", text: "the one place DOT cannot reach" },
  { selector: "#annotation-html", dx: "calc(-50% + 1em)", dy: "calc(-50% + 1em)", class: "", text: "from the origin" },
];

export class Chrome implements T.Chrome {
  readonly projectPicker: HTMLInputElement;
  readonly dotPicker: HTMLInputElement;
  /** The frame as `index.html` wrote it, before any piece filled it: an
   *  exported page boots the same app over the same frame. */
  readonly #skeleton: string;
  readonly #dialog: ExportDialog;

  constructor(body: HTMLElement, skeleton: string, readonly workbench: T.Workbench, private readonly painter: T.Painter) {
    this.#skeleton = skeleton;
    const $ = <E extends Element>(selector: string) => body.querySelector<E>(selector)!;
    this.projectPicker = $("main > nav > input[data-picks=project]");
    this.dotPicker = $("main > nav > input[data-picks=dot]");
    this.#dialog = new ExportDialog($("dialog"));
    this.projectPicker.addEventListener("change", () => this.#open());
    this.dotPicker.addEventListener("change", () => this.#loadDot());
    $("main > nav").addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
      if (button) this.run(button.dataset.action as T.Action);
    });
    const tabs = [...TABS.keys()];
    document.addEventListener("keydown", (event) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      const action = CHORDS.get(key);
      const tab = tabs[Number(key) - 1];
      if (action === undefined && tab === undefined) return;
      event.preventDefault();
      if (action !== undefined) this.run(action);
      else workbench.tab.pub(tab!);
    });
    ($("main > nav > img") as HTMLImageElement).src = LOGO_URI;
    document.head.append(Object.assign(document.createElement("link"), { rel: "icon", href: LOGO_URI }));

    const seed = seeded();
    workbench.adopt(seed, fileStyles(seed.styles));
  }

  async run(action: T.Action): Promise<void> {
    await ACTIONS.get(action)!(this);
  }

  save(): void {
    const project = asProject(this.workbench.sketch.dot.value, this.workbench.stylist.styles());
    download("diagram.shabnam.json", JSON.stringify(project, null, 2), "application/json");
  }

  async exportPicture(): Promise<void> {
    const options = await this.#dialog.ask();
    if (options === undefined) return;
    const css = this.workbench.stylist.css();
    const svg = this.painter.snapshot(options.transparent ? `${css}\n#diagram-canvas { background: transparent }` : css);
    const picture = options.format === "svg" ? new Blob([svg], { type: "image/svg+xml" }) : await raster(svg, options.scale);
    download(`diagram.${options.format}`, picture, picture.type);
  }

  /** A standalone page: the skeleton, the bundle, and the seed it boots from. */
  async exportHtml(): Promise<void> {
    const [css, app] = await Promise.all([asset("app-css"), asset("app-js")]);
    download("diagram.html", page(css, app, this.#skeleton, this.#seed()), "text/html");
  }

  /** A project: its DOT, and your rules laid over a fresh theme. The notes and
   *  script stay. */
  async #open(): Promise<void> {
    const project: T.Project = JSON.parse(await this.projectPicker.files![0]!.text());
    this.projectPicker.value = "";
    this.#replace(project.dot, fileStyles(project["user-styles"]));
  }

  /** A bare DOT: a fresh book, the theme only. */
  async #loadDot(): Promise<void> {
    const dot = await this.dotPicker.files![0]!.text();
    this.dotPicker.value = "";
    this.#replace(dot, []);
  }

  #replace(dot: string, styles: T.Style[]): void {
    const { notes, script } = this.workbench.sketch;
    this.workbench.adopt({ dot, notes: notes.value, script: script.value }, styles);
  }

  /** The DOT, the script, the whole book, and the notes. The notes travel, not
   *  the marks — the exported page derives its own marks exactly as this one does. */
  #seed(): string {
    const { dot, notes, script } = this.workbench.sketch;
    const seed: T.Seed = { dot: dot.value, script: script.value, styles: asFile(this.workbench.stylist.styles()), notes: notes.value };
    return JSON.stringify(seed).replace(/</g, "\\u003c");
  }
}

/**
 * The export dialog: format, transparency, scale. Transparent is on by default:
 * these are architecture diagrams, and one that drops onto any slide is the
 * useful one. Scale is disabled, not hidden, for SVG: a control you can see is
 * inapplicable explains itself.
 */
const FORMATS = new Map<T.PictureFormat, string>([
  ["svg", "SVG"],
  ["png", "PNG"],
]);

class ExportDialog extends DialogAsk<T.PictureOptions> {
  constructor(el: HTMLDialogElement) {
    const format = new Topic<T.PictureFormat>("svg");
    const transparent = new Topic(new Set(["transparent"]));
    const scale = el.querySelector<HTMLInputElement>("[name=scale]")!;
    super(el, () => ({ format: format.value, transparent: transparent.value.size > 0, scale: scale.valueAsNumber }));
    new Radios(el.querySelector(".radios")!, "format", FORMATS, format);
    new Checks(el.querySelector(".checks")!, "transparent", new Map([["transparent", "transparent"]]), transparent);
    const disable = (chosen: T.PictureFormat) => (scale.disabled = chosen === "svg");
    disable(format.value);
    format.sub(disable);
  }
}

/** What an exported page boots from, or the starter. */
function seeded(): T.Seed {
  const seed = document.getElementById("app-seed");
  if (seed === null) return { dot: STARTER_DOT, script: "", notes: STARTER_NOTES, styles: {} };
  return JSON.parse(seed.textContent!);
}

function download(name: string, body: string | Blob, type: string): void {
  const url = URL.createObjectURL(typeof body === "string" ? new Blob([body], { type }) : body);
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

/** The SVG through `Image` → `<canvas>` → `toBlob`, at `scale`. */
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

/** The page's own CSS or bundle: fetched when linked, read when inline. */
async function asset(id: string): Promise<string> {
  const element = document.getElementById(id)!;
  const url = element.getAttribute("src") ?? element.getAttribute("href");
  if (url !== null) return (await fetch(url)).text();
  return element.dataset.encoding === "base64" ? decode(element.textContent!) : element.textContent!;
}

function encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const chunks: string[] = [];
  for (let at = 0; at < bytes.length; at += 8192) chunks.push(String.fromCharCode(...bytes.subarray(at, at + 8192)));
  return btoa(chunks.join(""));
}

function decode(base64: string): string {
  const binary = atob(base64.trim());
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function page(css: string, app: string, skeleton: string, json: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Shabnam — exported diagram</title>
    <style id="app-css">${css}</style>
  </head>
  <body>
    ${skeleton}
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
