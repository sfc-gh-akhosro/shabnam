// Pieces — native controls with a CSS face. None of them knows DOT exists, and
// none imports a player. Each is handed a host the skeleton already holds.
//
// How they talk (§6), one way per direction:
//   owner → piece     a method call       `RowList.render`, `RowList.mark`
//   piece → owner     a bubbling event    `row-edit`, `row-add`, `row-drop`
//   a shared fact     a `Topic`           `Radios` and `Checks` read and write theirs
//   ask and wait      a `Promise`         `DialogAsk.ask`

import type * as T from "../types.ts";

// --- Topic: a fact two parts share without naming each other ------------------
//
// A subscriber that throws, throws; nothing unmounts, so there is no unsub.

export class Topic<V> implements T.Topic<V> {
  #value: V;
  #subs: ((v: V) => void)[] = [];

  constructor(value: V) {
    this.#value = value;
  }

  get value(): V {
    return this.#value;
  }

  pub(v: V): void {
    this.#value = v;
    for (const fn of this.#subs) fn(v);
  }

  sub(fn: (v: V) => void): void {
    this.#subs.push(fn);
  }
}

// --- Radios and Checks: one strip of `label > input`, from `#choice-template` ---
//
// Only the input type and what `change` publishes differ. CSS reads
// `:has(:checked)`: a chosen radio sinks in, a checked check rises and glows.

/** A closed set of choices, key → label, in the order shown. */
type Choices<K extends string> = Map<K, string>;

const CHOICE = document.querySelector<HTMLTemplateElement>("#choice-template")!;

function fill<K extends string>(
  el: HTMLElement,
  type: "radio" | "checkbox",
  name: string,
  choices: Choices<K>,
): HTMLInputElement[] {
  return [...choices].map(([key, label]) => {
    const choice = CHOICE.content.firstElementChild!.cloneNode(true) as HTMLLabelElement;
    const input = choice.querySelector("input")!;
    Object.assign(input, { type, name, value: key });
    choice.querySelector("span")!.textContent = label;
    el.append(choice);
    return input;
  });
}

/** One of a few. */
export class Radios<K extends string> {
  constructor(readonly el: HTMLElement, name: string, choices: Choices<K>, topic: T.Topic<K>) {
    const inputs = fill(el, "radio", name, choices);
    const show = (key: K) => {
      for (const input of inputs) input.checked = input.value === key;
    };
    show(topic.value);
    topic.sub(show);
    el.addEventListener("change", (event) => topic.pub((event.target as HTMLInputElement).value as K));
  }
}

/** Any of a few. The topic holds the set that is on, so a lone check is a one-key set. */
export class Checks<K extends string> {
  constructor(readonly el: HTMLElement, name: string, choices: Choices<K>, topic: T.Topic<Set<K>>) {
    const inputs = fill(el, "checkbox", name, choices);
    const show = (on: Set<K>) => {
      for (const input of inputs) input.checked = on.has(input.value as K);
    };
    show(topic.value);
    topic.sub(show);
    el.addEventListener("change", () =>
      topic.pub(new Set(inputs.filter((input) => input.checked).map((input) => input.value as K))),
    );
  }
}

// --- DialogAsk: a native `<dialog>` you await ----------------------------------
//
// Its `<form method="dialog">` closes it with the pressed button's value; "ok"
// answers with what `read` makes of the form, anything else (Cancel, Escape) is
// undefined. The browser owns focus, backdrop and Escape.

export class DialogAsk<A> {
  constructor(readonly el: HTMLDialogElement, private readonly read: (form: HTMLFormElement) => A) {}

  ask(): Promise<A | undefined> {
    this.el.returnValue = "";
    this.el.showModal();
    return new Promise((answer) =>
      this.el.addEventListener(
        "close",
        () => answer(this.el.returnValue === "ok" ? this.read(this.el.querySelector("form")!) : undefined),
        { once: true },
      ),
    );
  }
}

// --- RowList: `.row`s of inputs between ❌ and ➕, from `#row-template` ---------
//
// The row kind decides the columns. The list keeps no opinion: an edit goes out
// as `row-edit {index, row}`, a button as `row-add` / `row-drop {index}`, and
// the owner answers with `render`.
//
// `render` patches the rows it already has, by position, and only adds or trims
// at the end. A row you are tabbing through stays the same element, so
// committing one box never takes the caret out of the next.

/** One column of a row: which field it edits, and its input's attributes. */
type Column<R> = { field: keyof R & string; attrs(row: R): Record<string, string> };

/** A kind of row decides its columns, and the `data-` hooks a row wears. */
export type RowKind<R> = { columns: Column<R>[]; attrs(row: R): Record<string, string> };

/** What a row edit says: which row, and the row as it now reads. */
export type RowEdit<R> = { index: number; row: R };
/** What ➕ and ❌ say: the row's index. */
export type RowAt = { index: number };

const ROW = document.querySelector<HTMLTemplateElement>("#row-template")!;

export class RowList<R> {
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
