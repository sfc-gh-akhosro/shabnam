// Workbench — the side panel: four tabs, their editors, hover and pin (§6).
//
// It holds what you wrote — the sketch, as Topics — and the stylist that holds
// your styles, and hands both to the Painter on a draw. Tabs flip `hidden`, so
// nothing mounts or unmounts, a textarea keeps its caret, and no listener is
// ever removed.
//
// Adopting is a replacement, not a reset: a new sketch of Topics and a new
// stylist seeded from the theme, and the tabs pointed at them. Files never touch
// a pane; adopt does, once.
//
// The aside gives way to the diagram: clicking the canvas hides it and a strip
// at main's right edge brings it back, unless the pin is checked.

import { placed } from "../engine/painter.ts";
import { Stylist } from "../engine/stylist.ts";
import * as T from "../types.ts";
import { Checks, Radios, type RowAt, type RowEdit, type RowKind, RowList, Topic } from "./pieces.ts";

/** The tabs, in order: the strip's labels, and `Cmd+1…4`. */
export const TABS = new Map<T.TabId, string>([
  ["dot", "DOT"],
  ["styles", "styles"],
  ["notes", "notes"],
  ["script", "JS"],
]);

export class Workbench implements T.Workbench {
  readonly tab = new Topic<T.TabId>("dot");
  readonly pinned = new Topic(new Set(["pinned"]));
  readonly shown = new Topic(true);
  #sketch!: T.Topics<T.Sketch>;
  #stylist!: Stylist;
  #styleTab: StyleTab;
  #noteTab: NoteTab;
  #dot: HTMLTextAreaElement;
  #script: HTMLTextAreaElement;

  constructor(body: HTMLElement, private readonly painter: T.Painter) {
    const $ = <E extends Element>(selector: string) => body.querySelector<E>(selector)!;
    this.#styleTab = new StyleTab($("[data-tab=styles]"));
    this.#noteTab = new NoteTab($(".rows.notes"));
    this.#dot = $("[data-tab=dot] > textarea");
    this.#script = $("[data-tab=script] > textarea");
    this.#dot.addEventListener("input", () => this.#sketch.dot.pub(this.#dot.value));
    this.#script.addEventListener("input", () => this.#sketch.script.pub(this.#script.value));
    new Radios($("aside > .radios"), "tab", TABS, this.tab);
    new Checks($(".checks.pin"), "pin", new Map([["pinned", ""]]), this.pinned);
    this.#bindView(body);
  }

  get sketch(): T.Topics<T.Sketch> {
    return this.#sketch;
  }

  get stylist(): T.Stylist {
    return this.#stylist;
  }

  async adopt(sketch: T.Sketch, styles: T.Style[]): Promise<void> {
    this.#sketch = { dot: new Topic(sketch.dot), notes: new Topic(sketch.notes), script: new Topic(sketch.script) };
    this.#stylist = new Stylist();
    for (const style of styles) this.#stylist.add(style);
    // A note edit re-places the marks; it never draws.
    this.#sketch.notes.sub((notes) => this.painter.annotate(notes));
    this.#dot.value = sketch.dot;
    this.#script.value = sketch.script;
    this.#noteTab.show(this.#sketch.notes);
    this.#styleTab.read(this.#stylist);
    await this.draw();
  }

  /** Draw, then re-read the book: the DOT's styles are in it now. */
  async draw(): Promise<void> {
    const { dot, notes, script } = this.#sketch;
    await this.painter.draw({ dot: dot.value, notes: notes.value, script: script.value }, this.#stylist);
    this.#styleTab.read(this.#stylist);
  }

  #bindView(body: HTMLElement): void {
    const aside = body.querySelector<HTMLElement>("aside")!;
    const zone = body.querySelector<HTMLElement>("#hover-zone")!;
    this.tab.sub((tab) => {
      for (const section of aside.querySelectorAll<HTMLElement>(":scope > section")) section.hidden = section.dataset.tab !== tab;
      if (tab === "styles") this.#styleTab.read(this.#stylist);
    });
    this.shown.sub((shown) => {
      aside.hidden = !shown;
      zone.hidden = shown;
    });
    body.querySelector("#diagram-canvas")!.addEventListener("click", () => this.pinned.value.size > 0 || this.shown.pub(false));
    zone.addEventListener("mouseenter", () => this.shown.pub(true));
  }
}

// --- the styles tab -----------------------------------------------------------
//
// The book as rows, filtered by source. A row is selector · property · value,
// which is all a style has ever been.
//
// The list is the book re-read (`read`), plus one untouched blank at the end.
// `.rows` is `column-reverse`, so that blank sits at the top of the screen.
// Between re-reads the list is this tab's own: a refused row keeps its text and
// wears `.invalid` while the book keeps the last good value, until the next
// re-read — showing the tab, a draw, or Open — replaces it.
//
// A row commits on `change`, never on `input`: a half-typed selector must not
// reach `insertRule`. It reaches the book only when all three boxes say
// something. An empty value is not a rule, so clearing it removes the rule.

/** A row as the list holds it: the book's style, and whether the book refused it. */
type Listed = T.Style & { refused: boolean };

const COLOR = new Set(["color", "background", "background-color", "border-color", "fill", "stroke"]);

// `type=color` only speaks six-digit hex. A `var()` or a `color-mix()` keeps the
// text box rather than a swatch that would show black and mean nothing.
const HEX = /^#[0-9a-f]{6}$/i;

const swatched = (row: T.Style) => COLOR.has(row.property) && (row.value === "" || HEX.test(row.value));

// Each box carries its own `title`: the pane is narrow, so a long selector or
// value is read by hovering rather than by clicking in.
const STYLE_ROW: RowKind<Listed> = {
  columns: [
    { field: "selector", attrs: (row) => ({ list: "selector-list", placeholder: "selector", title: row.selector }) },
    { field: "property", attrs: (row) => ({ list: "property-list", placeholder: "property", title: row.property }) },
    { field: "value", attrs: (row) => ({ type: swatched(row) ? "color" : "text", placeholder: "value", title: row.value }) },
  ],
  attrs: (row) => ({ "data-source": String(row.source), "data-selector": row.selector, "data-property": row.property }),
};

const blankStyle = (): Listed => ({ selector: "", property: "", value: "", source: 2, refused: false });
const keyed = (row: T.Style) => row.selector !== "" && row.property !== "" && row.value !== "";

class StyleTab {
  /** View state only: hiding a source writes nothing and paints nothing. */
  readonly sources = new Topic(new Set(T.SOURCE.values()));
  #list: RowList<Listed>;
  #selectors: HTMLDataListElement;
  #book!: T.Stylist;
  #rows: Listed[] = [];
  /** Where each row on screen sits in `#rows`. Every verb addresses a row by its
   *  place in the list, so hiding the theme cannot re-aim the ❌ above it. */
  #shown: number[] = [];

  constructor(section: HTMLElement) {
    const names = new Map([...T.SOURCE.values()].map((name) => [name, name]));
    new Checks(section.querySelector(".checks")!, "source", names, this.sources);
    this.sources.sub(() => this.#render());
    this.#selectors = section.querySelector("#selector-list")!;
    this.#list = new RowList(section.querySelector(".rows")!, STYLE_ROW);
    const { el } = this.#list;
    el.addEventListener("row-edit", (event) => this.#edit((event as CustomEvent<RowEdit<Listed>>).detail));
    el.addEventListener("row-add", (event) => this.#add(this.#shown[(event as CustomEvent<RowAt>).detail.index]!));
    el.addEventListener("row-drop", (event) => this.#drop(this.#shown[(event as CustomEvent<RowAt>).detail.index]!));
  }

  /** The book, re-read, with a blank waiting at the end. */
  read(book: T.Stylist): void {
    this.#book = book;
    this.#rows = ready(book.styles().map((style) => ({ ...style, refused: false })), keyed, blankStyle);
    this.#render();
  }

  #render(): void {
    const on = this.sources.value;
    this.#shown = this.#rows.flatMap((row, at) => (on.has(T.SOURCE.get(row.source)!) ? [at] : []));
    this.#list.render(this.#shown.map((at) => this.#rows[at]!));
    this.#shown.forEach((at, i) => this.#list.mark(i, this.#rows[at]!.refused));
    const names = new Set(this.#rows.map((row) => row.selector).filter((name) => name !== ""));
    this.#selectors.replaceChildren(...[...names].map((value) => Object.assign(document.createElement("option"), { value })));
  }

  #edit({ index, row }: RowEdit<Listed>): void {
    const at = this.#shown[index]!;
    const before = this.#rows[at]!;
    const after: Listed = { ...row, source: 2 };
    // Only a changed key removes the old entry, and even when the new value is
    // refused below, so a rekeyed row cannot leave a stale entry under its old name.
    const rekeyed = before.selector !== after.selector || before.property !== after.property;
    if (rekeyed && keyed(before)) this.#book.remove(before);
    this.#rows[at] = this.#commit(after);
    this.#rows = ready(this.#rows, keyed, blankStyle);
    this.#render();
  }

  /** The row into the book, or not at all: a refused row is **not written**, so
   *  the picture never flickers through a broken value on the way to a good one. */
  #commit(row: Listed): Listed {
    if (!keyed(row)) return { ...row, refused: false };
    const { selector, property, value, source } = row;
    const refused = !this.#book.add({ selector, property, value, source });
    if (refused) console.error(`[styles] ${selector} { ${property}: ${value} } refused by the style book`);
    return { ...row, refused };
  }

  #add(at: number): void {
    this.#rows.splice(at + 1, 0, blankStyle());
    this.#render();
  }

  #drop(at: number): void {
    const [row] = this.#rows.splice(at, 1);
    if (keyed(row!)) this.#book.remove(row!);
    this.#rows = ready(this.#rows, keyed, blankStyle);
    this.#render();
  }
}

// --- the notes tab ------------------------------------------------------------
//
// A row *is* a note: selector · dx · dy · class · text. The list is the model and
// the mark is derived from it, never the other way round. It reads top-down, so
// the waiting blank sits at the bottom. A half-typed row and the blank travel in
// the list and draw nothing (`placed`). An edit publishes the whole list; the
// painter re-places its marks (no draw) and this tab re-renders from it.

// The text box is the second line: it follows the ➕ on screen (`app.css`).
const box = (field: keyof T.Note & string, placeholder: string) => ({
  field,
  attrs: (note: T.Note) => ({ placeholder, title: note[field] }),
});

const NOTE_ROW: RowKind<T.Note> = {
  columns: [box("selector", "selector"), box("dx", "dx"), box("dy", "dy"), box("class", "class"), box("text", "markdown — \\n breaks a line")],
  attrs: () => ({}),
};

const blankNote = (): T.Note => ({ selector: "", dx: "", dy: "", class: "", text: "" });

class NoteTab {
  #list: RowList<T.Note>;
  #notes!: T.Topic<T.Note[]>;
  #rows: T.Note[] = [];

  constructor(el: HTMLElement) {
    this.#list = new RowList(el, NOTE_ROW);
    el.addEventListener("row-edit", (event) => {
      const { index, row } = (event as CustomEvent<RowEdit<T.Note>>).detail;
      this.#notes.pub(this.#rows.map((note, i) => (i === index ? row : note)));
    });
    el.addEventListener("row-add", (event) => {
      this.#notes.pub(this.#rows.toSpliced((event as CustomEvent<RowAt>).detail.index + 1, 0, blankNote()));
    });
    el.addEventListener("row-drop", (event) => {
      const index = (event as CustomEvent<RowAt>).detail.index;
      this.#notes.pub(this.#rows.filter((_, i) => i !== index));
    });
  }

  /** Follow a sketch's notes. Adopt makes a new sketch, and this is called again. */
  show(notes: T.Topic<T.Note[]>): void {
    this.#notes = notes;
    this.#render(notes.value);
    notes.sub((list) => this.#render(list));
  }

  #render(notes: T.Note[]): void {
    this.#rows = ready(notes, placed, blankNote);
    this.#list.render(this.#rows);
  }
}

/** Both lists always end with one untouched blank; filling it appends the next. */
function ready<R>(rows: R[], filled: (row: R) => boolean, blank: () => R): R[] {
  const last = rows[rows.length - 1];
  return last !== undefined && !filled(last) ? rows : [...rows, blank()];
}
