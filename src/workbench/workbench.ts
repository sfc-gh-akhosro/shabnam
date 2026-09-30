// The page. It finds the skeleton `index.html` already wrote, fills in the
// pieces, binds them to the diagram, and runs the verbs. Tabs flip `hidden`, so
// nothing mounts or unmounts, a textarea keeps its caret, and no listener is
// ever removed.
//
// The diagram is replaced, not reset: Open makes a new `Diagram`, whose new
// style book is seeded from the theme, and `#adopt` points the panes at it.
// Files never touch a textarea; the workbench does, once, on adopt.
//
// The aside gives way to the diagram: clicking the canvas hides it and a strip
// at main's right edge brings it back, unless the pin is checked.

import { Diagram } from "../diagram/diagram.ts";
import { documentStyles, fileStyles } from "../style/book.ts";
import { Checks } from "../ui/checks.ts";
import { Radios } from "../ui/radios.ts";
import { Topic } from "../ui/topic.ts";
import type * as T from "../types.ts";
import { chords, commands } from "./commands.ts";
import { ExportDialog } from "./export-dialog.ts";
import { NoteTab } from "./note-tab.ts";
import { StyleTab } from "./style-tab.ts";

import logo from "../../icon/shabnam-logo.svg";

const LOGO_URI = `data:image/svg+xml,${encodeURIComponent(logo)}`;

const TABS = new Map<T.TabId, string>([
  ["dot", "DOT"],
  ["styles", "styles"],
  ["notes", "notes"],
  ["script", "JS"],
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

/** What an exported page boots from (`files.ts`), or the starter. */
type Seed = { dot: string; script: string; notes: T.Note[]; styles: T.StyleFile | T.StyleDocument };

function seeded(): Seed {
  const seed = document.getElementById("app-seed");
  if (seed === null) return { dot: STARTER_DOT, script: "", notes: STARTER_NOTES, styles: {} };
  return JSON.parse(seed.textContent!);
}

export class Workbench {
  diagram!: Diagram;
  /** The frame as `index.html` wrote it, before any piece filled it. */
  readonly skeleton: string;
  readonly view = {
    tab: new Topic<T.TabId>("dot"),
    pinned: new Topic(new Set(["pinned"])),
    shown: new Topic(true),
  };
  readonly projectPicker: HTMLInputElement;
  readonly dotPicker: HTMLInputElement;
  readonly exportDialog: ExportDialog;
  #styleTab: StyleTab;
  #noteTab: NoteTab;
  #dot: HTMLTextAreaElement;
  #script: HTMLTextAreaElement;
  #layout: T.GraphvizLayout;

  constructor(body: HTMLElement, layout: T.GraphvizLayout) {
    this.#layout = layout;
    this.skeleton = [...body.children].filter((el) => el.tagName !== "SCRIPT").map((el) => el.outerHTML).join("\n");
    const $ = <E extends Element>(selector: string) => body.querySelector<E>(selector)!;
    this.projectPicker = $("main > nav > input[data-picks=project]");
    this.dotPicker = $("main > nav > input[data-picks=dot]");
    this.exportDialog = new ExportDialog($("dialog"));
    this.#styleTab = new StyleTab($("[data-tab=styles]"));
    this.#noteTab = new NoteTab($(".rows.notes"));
    this.#dot = $("[data-tab=dot] > textarea");
    this.#script = $("[data-tab=script] > textarea");
    this.#dot.addEventListener("input", () => this.diagram.dot.pub(this.#dot.value));
    this.#script.addEventListener("input", () => this.diagram.script.pub(this.#script.value));

    new Radios($("aside > .radios"), "tab", TABS, this.view.tab);
    new Checks($(".checks.pin"), "pin", new Map([["pinned", ""]]), this.view.pinned);
    this.#bindView(body);
    this.#bindVerbs(body);
    this.projectPicker.addEventListener("change", () => this.#open());
    this.dotPicker.addEventListener("change", () => this.#loadDot());

    ($("main > nav > img") as HTMLImageElement).src = LOGO_URI;
    document.head.append(Object.assign(document.createElement("link"), { rel: "icon", href: LOGO_URI }));

    const seed = seeded();
    this.#adopt(new Diagram(this.#layout, seed.dot, seed.script, seed.notes, documentStyles(seed.styles)));
    this.draw();
  }

  /** Draw, then re-read the book: the DOT's styles are in it now. */
  async draw(): Promise<void> {
    await this.diagram.draw();
    this.#styleTab.read(this.diagram.styleBook);
  }

  #adopt(diagram: Diagram): void {
    this.diagram = diagram;
    this.#dot.value = diagram.dot.value;
    this.#script.value = diagram.script.value;
    this.#noteTab.show(diagram.notes);
    this.#styleTab.read(diagram.styleBook);
  }

  /** A project: its DOT, and your rules laid over a fresh theme. */
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
    const old = this.diagram;
    this.#adopt(new Diagram(this.#layout, dot, old.script.value, old.notes.value, styles));
    this.draw();
  }

  #bindView(body: HTMLElement): void {
    const aside = body.querySelector<HTMLElement>("aside")!;
    const zone = body.querySelector<HTMLElement>("#hover-zone")!;
    this.view.tab.sub((tab) => {
      for (const section of aside.querySelectorAll<HTMLElement>(":scope > section")) section.hidden = section.dataset.tab !== tab;
      if (tab === "styles") this.#styleTab.read(this.diagram.styleBook);
    });
    this.view.shown.sub((shown) => {
      aside.hidden = !shown;
      zone.hidden = shown;
    });
    body.querySelector("#diagram-canvas")!.addEventListener("click", () => this.view.pinned.value.size > 0 || this.view.shown.pub(false));
    zone.addEventListener("mouseenter", () => this.view.shown.pub(true));
  }

  #bindVerbs(body: HTMLElement): void {
    const verbs = commands(this);
    const keys = chords(verbs, [...TABS.keys()], this.view.tab);
    body.querySelector("main > nav")!.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-command]");
      if (button) verbs.get(button.dataset.command as T.Command)!();
    });
    document.addEventListener("keydown", (event) => {
      const chord = (event.metaKey || event.ctrlKey) && keys.get(event.key.toLowerCase());
      if (!chord) return;
      event.preventDefault();
      chord();
    });
  }
}
