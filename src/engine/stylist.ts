// Stylist — the style book and the one live sheet it paints (§5).
//
// `add` is the only way in. Theme, DOT and user all arrive through it, each
// style carrying its own source, so "a lower source never overwrites a higher
// one" lives in exactly one place. An accepted overwrite is destructive:
// removing a row is not a revert, except for whatever `@apply` still supplies.
//
// There is no reset. A new stylist is seeded from the theme and takes the sheet
// over; that is what opening a DOT does.
//
// The book's rules (`admits`, `expand`, `mixins`, `painted`) and the files are
// pure functions, so the interesting half runs under `bun test`. The class adds
// the CSSOM half: asking the browser whether a value is valid, and painting.

import type * as T from "../types.ts";
import basicTheme from "../../theme/basic-theme.json";

const APPLY = "@apply";

/** The theme the book is founded on, named so a saved project can say so. */
const THEME_NAME = "basic-theme.json";

/** How many `@apply` hops a selector may take: `.node → .brand → .paper → .glass`. */
const NEST = 3;

/** `#style-css` — driven through CSSOM only, never `textContent`. */
const SINK = "style-css";

/** selector → property → style. Insertion order is row order. A selector's key
 *  is never deleted, so a mixin stays defined when its last property goes. */
export type Book = Map<T.Selector, Map<T.Property, T.Style>>;

export class Stylist implements T.Stylist {
  #book: Book = new Map();
  #sheet = new Sheet();

  constructor() {
    for (const style of fileStyles(basicTheme as T.StyleFile)) this.add(style);
  }

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

  /** The sheet holds no `@apply` and no mixin, so there is nothing to resolve. */
  css(): string {
    return [...live().cssRules].map((rule) => rule.cssText).join("\n");
  }

  #paint(style: T.Style): void {
    if (style.property === APPLY) this.#sheet.feed(this.#book);
    else for (const one of painted(this.#book, style.selector)) this.#sheet.paint(one, expand(this.#book, one));
  }
}

/** One `CSSStyleRule` per painted selector; a property is `setProperty` /
 *  `removeProperty`. Nothing reads the sheet back but `css()`. */
class Sheet {
  #rules = new Map<T.Selector, CSSStyleRule>();

  /** A new stylist takes the sheet over from whatever painted it before. */
  constructor() {
    this.#clear();
  }

  /** Rebuilds the sheet: an `@apply` changed, so which selectors are mixins may have too. */
  feed(book: Book): void {
    this.#clear();
    const skip = mixins(book);
    for (const selector of book.keys()) if (!skip.has(selector)) this.paint(selector, expand(book, selector));
  }

  /** One selector's rule, emptied and written again from its expansion. */
  paint(selector: T.Selector, declarations: Map<T.Property, T.CssValue>): void {
    const style = this.#rule(selector).style;
    for (let at = style.length - 1; at >= 0; at--) style.removeProperty(style.item(at));
    for (const [property, value] of declarations) style.setProperty(property, ...priority(value));
  }

  #rule(selector: T.Selector): CSSStyleRule {
    const known = this.#rules.get(selector);
    if (known !== undefined) return known;
    const sheet = live();
    const rule = sheet.cssRules[sheet.insertRule(`${selector} {}`, sheet.cssRules.length)] as CSSStyleRule;
    this.#rules.set(selector, rule);
    return rule;
  }

  #clear(): void {
    const sheet = live();
    while (sheet.cssRules.length > 0) sheet.deleteRule(0);
    this.#rules.clear();
  }
}

// A <style> element has no `.sheet` until it is in the document, so it is found
// on use, which is after mount.
function live(): CSSStyleSheet {
  return (document.getElementById(SINK) as HTMLStyleElement).sheet!;
}

// `CSS.supports` is the parse `setProperty` does, asked out loud. `@apply` is
// ours, and `admits` has already judged it.
function valid(style: T.Style): boolean {
  return style.property === APPLY || CSS.supports(style.property, priority(style.value)[0]);
}

/** A value split from its priority: `!important` is `setProperty`'s third
 *  argument, so a value still carrying it is valid nowhere. The book keeps the
 *  text as typed; the split happens on the way to the sheet. */
export function priority(value: string): [value: string, priority: string] {
  const match = /^(.*?)\s*!\s*important\s*$/i.exec(value);
  return match === null ? [value, ""] : [match[1]!.trim(), "important"];
}

// --- the book's rules — pure ---------------------------------------------------

/** Whether the book lets a style in, before CSSOM is asked. A lower source never
 *  overwrites a higher one, and an `@apply` may only name selectors the book
 *  already has and nest at most `NEST` deep — which also refuses a loop. */
export function admits(book: Book, style: T.Style): boolean {
  const existing = book.get(style.selector)?.get(style.property);
  if (existing !== undefined && style.source < existing.source) return false;
  if (style.property !== APPLY) return true;
  if (!names(style.value).every((name) => book.has(name))) return false;
  const own = new Map(book.get(style.selector)).set(APPLY, style);
  return nests(new Map(book).set(style.selector, own), style.selector, 0);
}

function nests(book: Book, selector: T.Selector, depth: number): boolean {
  if (depth > NEST) return false;
  const apply = book.get(selector)?.get(APPLY);
  return apply === undefined || names(apply.value).every((name) => nests(book, name, depth + 1));
}

/** One selector's declarations with every `@apply` expanded in place, so the
 *  selector's own later properties win. Destined for the sheet, never the book. */
export function expand(book: Book, selector: T.Selector): Map<T.Property, T.CssValue> {
  const out = new Map<T.Property, T.CssValue>();
  for (const [property, style] of book.get(selector)!) {
    if (property !== APPLY) {
      out.set(property, style.value);
      continue;
    }
    for (const name of names(style.value)) for (const entry of expand(book, name)) out.set(...entry);
  }
  return out;
}

/** Every selector some `@apply` names. These never reach CSSOM on their own. */
export function mixins(book: Book): Set<T.Selector> {
  const out = new Set<T.Selector>();
  for (const own of book.values()) {
    const apply = own.get(APPLY);
    if (apply !== undefined) for (const name of names(apply.value)) out.add(name);
  }
  return out;
}

/** What a change to `selector` must repaint: itself and whatever applies it,
 *  less the mixins, which are never painted. */
export function painted(book: Book, selector: T.Selector): T.Selector[] {
  const skip = mixins(book);
  return [selector, ...appliers(book, selector)].filter((one) => !skip.has(one));
}

function appliers(book: Book, selector: T.Selector): T.Selector[] {
  const direct = [...book]
    .filter(([, own]) => {
      const apply = own.get(APPLY);
      return apply !== undefined && names(apply.value).includes(selector);
    })
    .map(([one]) => one);
  return direct.flatMap((one) => [one, ...appliers(book, one)]);
}

function names(value: T.CssValue): T.Selector[] {
  return value.trim().split(/\s+/);
}

// --- files: the book written down, and read back ------------------------------

export function asFile(styles: T.Style[]): T.StyleFile {
  const file: T.StyleFile = {};
  for (const { selector, property, value, source } of styles) (file[selector] ??= {})[property] = { value, source };
  return file;
}

/** A file's styles, in order, each at its own source. */
export function fileStyles(file: T.StyleFile): T.Style[] {
  return Object.entries(file).flatMap(([selector, properties]) =>
    Object.entries(properties).map(([property, { value, source }]) => ({ selector, property, value, source })),
  );
}

/** What Save writes: the theme by name, the DOT, and the user's rules only. */
export function asProject(dot: string, styles: T.Style[]): T.Project {
  return { theme: THEME_NAME, dot, "user-styles": asFile(styles.filter((style) => style.source === 2)) };
}
