// `.row`s of inputs between ❌ and ➕, cloned from `#row-template`. The row kind
// decides the columns. The list keeps no opinion: an edit goes out as
// `row-edit {index, row}`, a button as `row-add` / `row-drop {index}`, and the
// owner answers with `render`.

import type * as UI from "./types.ts";
import type { Column, RowKind } from "./types.ts";

const ROW = document.querySelector<HTMLTemplateElement>("#row-template")!;

export class RowList<R> implements UI.RowList<R> {
  #rows: R[] = [];

  constructor(readonly el: HTMLElement, private readonly kind: RowKind<R>) {
    el.addEventListener("change", (event) => this.#edit(event.target as HTMLInputElement));
    el.addEventListener("click", (event) => this.#press(event.target as HTMLElement));
  }

  render(rows: R[]): void {
    this.#rows = rows;
    this.el.replaceChildren(...rows.map((row, index) => this.#row(row, index)));
  }

  mark(i: number, invalid: boolean): void {
    this.el.children[i]!.classList.toggle("invalid", invalid);
  }

  #row(row: R, index: number): HTMLElement {
    const el = ROW.content.firstElementChild!.cloneNode(true) as HTMLElement;
    el.dataset.index = String(index);
    for (const [name, value] of Object.entries(this.kind.attrs(row))) el.setAttribute(name, value);
    el.lastElementChild!.before(...this.kind.columns.map((column) => this.#input(column, row)));
    return el;
  }

  #input(column: Column<R>, row: R): HTMLInputElement {
    const input = document.createElement("input");
    for (const [name, value] of Object.entries(column.attrs)) input.setAttribute(name, value);
    input.name = column.field;
    input.value = String(row[column.field]);
    return input;
  }

  #edit(input: HTMLInputElement): void {
    const index = at(input);
    const row = { ...this.#rows[index]!, [input.name]: input.value } as R;
    this.#say("row-edit", { index, row } satisfies UI.RowEdit<R>);
  }

  #press(target: HTMLElement): void {
    const button = target.closest("button");
    if (!button) return; // a click in an input
    this.#say(`row-${button.value}`, { index: at(button) } satisfies UI.RowAt);
  }

  #say(type: string, detail: unknown): void {
    this.el.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  }
}

function at(el: Element): number {
  return Number(el.closest<HTMLElement>(".row")!.dataset.index);
}
