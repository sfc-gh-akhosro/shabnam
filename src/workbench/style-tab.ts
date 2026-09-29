// The styles tab: the book as rows, filtered by source. Not an editor — a row
// is selector · property · value, which is all a style has ever been.
//
// The list is the book re-read (`read`), plus one untouched blank at the end.
// `.rows` is `column-reverse`, so that blank sits at the top of the screen and
// the next thing you type is the first thing you see. Between re-reads the
// list is this tab's own: a refused row keeps its text and wears `.invalid`
// while the book keeps the last good value, until the next re-read — showing
// the tab, a draw, or Open — replaces it with what the book holds.
//
// A row commits on `change`, never on `input`: a half-typed selector must not
// reach `insertRule`. It reaches the book only when all three boxes say
// something. An empty value is not a rule, which gives clearing it its natural
// meaning: the rule is removed.

import { Checks } from "../ui/checks.ts";
import { type RowAt, type RowEdit, type RowKind, RowList } from "../ui/row-list.ts";
import { Topic } from "../ui/topic.ts";
import * as T from "../types.ts";

/** A row as the list holds it: the book's style, and whether the book refused it. */
type Listed = T.Style & { refused: boolean };

const COLOR = new Set(["color", "background", "background-color", "border-color", "fill", "stroke"]);

// `type=color` only speaks six-digit hex. A `var()` or a `color-mix()` keeps
// the text box rather than a swatch that would show black and mean nothing.
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

const blank = (): Listed => ({ selector: "", property: "", value: "", source: 2, refused: false });
const keyed = (row: T.Style) => row.selector !== "" && row.property !== "" && row.value !== "";

/** The list always ends with an untouched blank; filling it appends the next. */
function ready(rows: Listed[]): Listed[] {
  const last = rows[rows.length - 1];
  return last !== undefined && !keyed(last) ? rows : [...rows, blank()];
}

export class StyleTab {
  /** View state only: hiding a source writes nothing and paints nothing. */
  readonly sources = new Topic(new Set(T.SOURCE.values()));
  #list: RowList<Listed>;
  #selectors: HTMLDataListElement;
  #book!: T.StyleBook;
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
  read(book: T.StyleBook): void {
    this.#book = book;
    this.#rows = ready(book.styles().map((style) => ({ ...style, refused: false })));
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
    this.#rows = ready(this.#rows);
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
    this.#rows.splice(at + 1, 0, blank());
    this.#render();
  }

  #drop(at: number): void {
    const [row] = this.#rows.splice(at, 1);
    if (keyed(row!)) this.#book.remove(row!);
    this.#rows = ready(this.#rows);
    this.#render();
  }
}
