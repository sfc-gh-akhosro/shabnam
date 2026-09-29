// The style book: every style rule, and the one live sheet they paint.
//
// `add` is the only way in (architecture §5). Theme, DOT and user all arrive
// through it, each style carrying its own source, so the "a lower source never
// overwrites a higher one" guard lives in exactly one place. An accepted
// overwrite is destructive: removing a row is not a revert, except for whatever
// `@apply` still supplies, which the repaint of its expansion shows by itself.
//
// There is no reset. A new book is seeded from the theme and takes the sheet
// over; that is what opening a DOT does.

import * as T from "../types.ts";
import { Topic } from "../ui/topic.ts";
import { admits, APPLY, type Book, expand, fileStyles, painted } from "./book.ts";
import { priority, Sheet } from "./sheet.ts";
import basicTheme from "../../theme/basic-theme.json";

export class StyleBook implements T.StyleBook {
  readonly changed = new Topic(0);
  #book: Book = new Map();
  #sheet = new Sheet();

  constructor() {
    for (const style of fileStyles(basicTheme as T.StyleFile)) this.add(style);
  }

  /** False when the book refuses it (a higher source owns it, or an `@apply`
   *  names a selector not yet here) or CSSOM would drop the value. */
  add(style: T.Style): boolean {
    if (!admits(this.#book, style) || !valid(style)) return false;
    const own = this.#book.get(style.selector) ?? new Map<T.Property, T.Style>();
    this.#book.set(style.selector, own.set(style.property, style));
    this.#paint(style);
    return true;
  }

  remove(style: T.Style): void {
    if (this.#book.get(style.selector)?.delete(style.property)) this.#paint(style);
  }

  styles(): T.Style[] {
    return [...this.#book.values()].flatMap((own) => [...own.values()]);
  }

  #paint(style: T.Style): void {
    if (style.property === APPLY) this.#sheet.feed(this.#book);
    else for (const one of painted(this.#book, style.selector)) this.#sheet.paint(one, expand(this.#book, one));
    this.changed.pub(this.changed.value + 1);
  }
}

// `CSS.supports` is the parse `setProperty` does, asked out loud. `@apply` is
// ours, and `admits` has already judged it.
function valid(style: T.Style): boolean {
  return style.property === APPLY || CSS.supports(style.property, priority(style.value)[0]);
}
