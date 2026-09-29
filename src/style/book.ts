// The book as data: who may write, and what `@apply` expands to.
//
// Pure — no DOM — so the interesting half of the style book runs under
// `bun test`. The `StyleBook` adds the CSSOM half: asking the browser whether a
// value is valid, and painting the sheet.

import * as T from "../types.ts";

export const APPLY = "@apply";

/** The theme the book is founded on, named so a saved document can say so. */
const THEME_NAME = "basic-theme.json";

/**
 * selector → property → style. Insertion order is row order. A selector's key
 * is never deleted, so a mixin stays defined when its last property goes.
 */
export type Book = Map<T.Selector, Map<T.Property, T.Style>>;

/**
 * Whether the book lets a style in, before CSSOM is asked (architecture §5).
 * A lower source never overwrites a higher one, and an `@apply` may only name
 * selectors the book already has and may nest at most `NEST` deep — which is
 * also what refuses a loop, since a loop nests forever.
 */
export function admits(book: Book, style: T.Style): boolean {
  const existing = book.get(style.selector)?.get(style.property);
  if (existing !== undefined && style.source < existing.source) return false;
  if (style.property !== APPLY) return true;
  if (!names(style.value).every((name) => book.has(name))) return false;
  const own = new Map(book.get(style.selector)).set(APPLY, style);
  return nests(new Map(book).set(style.selector, own), style.selector, 0);
}

/** How many `@apply` hops a selector may take: `.node → .brand → .paper → .glass`. */
const NEST = 3;

function nests(book: Book, selector: T.Selector, depth: number): boolean {
  if (depth > NEST) return false;
  const apply = book.get(selector)?.get(APPLY);
  return apply === undefined || names(apply.value).every((name) => nests(book, name, depth + 1));
}

/**
 * One selector's declarations with every `@apply` expanded in place, so the
 * selector's own later properties win. A read: what comes back is destined for
 * the sheet and never becomes a book entry.
 */
export function expand(book: Book, selector: T.Selector): Map<T.Property, T.CssValue> {
  const out = new Map<T.Property, T.CssValue>();
  for (const [property, style] of book.get(selector)!) {
    if (property !== APPLY) {
      out.set(property, style.value);
      continue;
    }
    for (const name of names(style.value)) {
      for (const entry of expand(book, name)) out.set(...entry);
    }
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

// --- files: the book written down, and read back ----------------------------

/** Styles as a file: `{ selector: { property: { value, source } } }`. */
export function asFile(styles: T.Style[]): T.StyleFile {
  const file: T.StyleFile = {};
  for (const { selector, property, value, source } of styles) {
    (file[selector] ??= {})[property] = { value, source };
  }
  return file;
}

/** What Save styles writes: the user's rules only, over a named theme. */
export function asDocument(styles: T.Style[]): T.StyleDocument {
  return { theme: THEME_NAME, style: asFile(styles.filter((style) => style.source === 2)) };
}

/** A file's styles, in order, each at its own source. The theme, an export seed. */
export function fileStyles(file: T.StyleFile): T.Style[] {
  return Object.entries(file).flatMap(([selector, properties]) =>
    Object.entries(properties).map(([property, { value, source }]) => ({ selector, property, value, source })),
  );
}

/**
 * The styles of either shape a style JSON arrives in: a saved document, or the
 * bare file an export seed carries. A document is told apart by `theme` holding
 * a string; in a file every top-level value is a map of declarations.
 */
export function documentStyles(parsed: T.StyleFile | T.StyleDocument): T.Style[] {
  const style = typeof parsed.theme === "string" ? (parsed as T.StyleDocument).style : (parsed as T.StyleFile);
  return fileStyles(style);
}
