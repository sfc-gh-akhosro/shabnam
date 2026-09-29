// `.row`s of inputs between ❌ and ➕, cloned from `#row-template`. The row kind
// decides the columns. The list keeps no opinion: an edit goes out as
// `row-edit {index, row}`, a button as `row-add` / `row-drop {index}`, and the
// owner answers with `render`.
//
// `render` patches the rows it already has, by position, and only adds or
// trims at the end. A row you are tabbing through stays the same element, so
// committing one box never takes the caret out of the next.

import type * as T from "../types.ts";

/** One column of a row: which field it edits, and its input's attributes. */
export type Column<R> = { field: keyof R & string; attrs(row: R): Record<string, string> };

/** A kind of row decides its columns, and the `data-` hooks a row wears. */
export type RowKind<R> = { columns: Column<R>[]; attrs(row: R): Record<string, string> };

/** What a row edit says: which row, and the row as it now reads. */
export type RowEdit<R> = { index: number; row: R };
/** What ➕ and ❌ say: the row's index. */
export type RowAt = { index: number };

const ROW = document.querySelector<HTMLTemplateElement>("#row-template")!;

export class RowList<R> implements T.RowList<R> {
  #rows: R[] = [];

  constructor(readonly el: HTMLElement, private readonly kind: RowKind<R>) {
    el.addEventListener("change", (event) => this.#edit(event.target as HTMLInputElement));
    el.addEventListener("click", (event) => this.#press(event.target as HTMLElement));
  }

  render(rows: R[]): void {
    this.#rows = rows;
    rows.forEach((row, index) => this.#fill(this.#row(index), row, index));
    while (this.el.children.length > rows.length) this.el.lastElementChild!.remove();
  }

  mark(i: number, invalid: boolean): void {
    this.el.children[i]!.classList.toggle("invalid", invalid);
  }

  #row(index: number): HTMLElement {
    const known = this.el.children[index];
    if (known !== undefined) return known as HTMLElement;
    const el = ROW.content.firstElementChild!.cloneNode(true) as HTMLElement;
    el.lastElementChild!.before(...this.kind.columns.map((column) => Object.assign(document.createElement("input"), { name: column.field })));
    this.el.append(el);
    return el;
  }

  #fill(el: HTMLElement, row: R, index: number): void {
    el.dataset.index = String(index);
    for (const [name, value] of Object.entries(this.kind.attrs(row))) el.setAttribute(name, value);
    for (const column of this.kind.columns) {
      const input = el.querySelector<HTMLInputElement>(`input[name="${column.field}"]`)!;
      for (const [name, value] of Object.entries(column.attrs(row))) input.setAttribute(name, value);
      input.value = String(row[column.field]);
    }
  }

  #edit(input: HTMLInputElement): void {
    const index = at(input);
    const row = { ...this.#rows[index]!, [input.name]: input.value } as R;
    this.#say("row-edit", { index, row } satisfies RowEdit<R>);
  }

  #press(target: HTMLElement): void {
    const button = target.closest("button");
    if (!button) return; // a click in an input
    this.#say(`row-${button.value}`, { index: at(button) } satisfies RowAt);
  }

  #say(type: string, detail: unknown): void {
    this.el.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  }
}

function at(el: Element): number {
  return Number(el.closest<HTMLElement>(".row")!.dataset.index);
}
