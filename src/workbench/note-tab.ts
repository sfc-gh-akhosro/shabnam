// The notes tab. A row *is* a note: selector · dx · dy · class · text. The list
// is the model and the mark is derived from it, never the other way round.
//
// It reads top-down, so the waiting blank sits at the bottom. A row places a
// mark only once selector and text both say something (`placed`), so a
// half-typed row and the blank travel in the list and draw nothing. An edit
// publishes the whole list; the diagram re-places its marks (no draw) and this
// tab re-renders from what it published.

import { placed } from "../diagram/notes.ts";
import { type RowAt, type RowEdit, type RowKind, RowList } from "../ui/row-list.ts";
import type * as T from "../types.ts";

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

function ready(notes: T.Note[]): T.Note[] {
  const last = notes[notes.length - 1];
  return last !== undefined && !placed(last) ? notes : [...notes, blankNote()];
}

export class NoteTab {
  #list: RowList<T.Note>;
  #notes!: T.Topic<T.Note[]>;
  #rows: T.Note[] = [];

  constructor(el: HTMLElement) {
    this.#list = new RowList(el, NOTE_ROW);
    el.addEventListener("row-edit", (event) => {
      const { index, row } = (event as CustomEvent<RowEdit<T.Note>>).detail;
      this.#pub(this.#rows.map((note, i) => (i === index ? row : note)));
    });
    el.addEventListener("row-add", (event) => {
      const index = (event as CustomEvent<RowAt>).detail.index;
      this.#pub(this.#rows.toSpliced(index + 1, 0, blankNote()));
    });
    el.addEventListener("row-drop", (event) => {
      const index = (event as CustomEvent<RowAt>).detail.index;
      this.#pub(this.#rows.filter((_, i) => i !== index));
    });
  }

  /** Follow a diagram's notes. Open makes a new diagram, and this is called again. */
  show(notes: T.Topic<T.Note[]>): void {
    this.#notes = notes;
    this.#render(notes.value);
    notes.sub((list) => this.#render(list));
  }

  #render(notes: T.Note[]): void {
    this.#rows = ready(notes);
    this.#list.render(this.#rows);
  }

  #pub(notes: T.Note[]): void {
    this.#notes.pub(notes);
  }
}
