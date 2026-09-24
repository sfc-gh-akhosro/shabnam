// Stylist — one book of rules, one live sheet.
//
// The book is `selector → property → (value, id, source)` and it is the source of
// truth for style (§1). There are no layers and no merge: a repeated key is an
// overwrite, and `source` decides whether that overwrite is allowed.
//
//   0 theme · 1 dot · 2 user, and a write is refused when its source is lower
//   than the entry already there.
//
// That one guard is what the three layers used to be for. Load DOT resets to a
// blank book holding the theme; a redraw absorbs the DOT's bag at source 1 and is
// refused wherever the user has written at 2; a row edit writes at 2.
//
// An accepted overwrite is destructive and immediate, by design. The value
// underneath is not kept anywhere, so removing a row is not a revert — except for
// whatever `@apply` still supplies, which `removeRule` resolves for.
//
// `absorb` and `feed` are public but not on the interface: they are the redraw and
// load conductor's plumbing (§5), not part of the styling contract. A row edit
// needs neither — that is the short path.

import * as T from "../types.ts";
import { applyBound, expand, Sheet, serialize } from "./sheet.ts";
import basicTheme from "../../theme/basic-theme.json";

const APPLY = "@apply";
const STYLE_FILE = "style-rules.json";

/** The theme the book is founded on, named so a saved document can say so. */
const THEME_NAME = "basic-theme.json";

export class Stylist implements T.Stylist {
  private sheet = new Sheet();
  private rules: T.StyleRules = new Map();
  // Starts at 1: `REFUSED` is 0, and the rows tab uses 0 for a row it has
  // invented that has not reached the book yet, so no entry may ever carry it.
  private counter = 1;

  addRule(selector: string, property: string, value: string, source: T.Source): number {
    const id = this.write(selector, property, value, source);
    if (id === REFUSED) return REFUSED;
    if (property === APPLY || applyBound(selector, this.rules)) this.feed();
    else this.sheet.set(selector, property, value);
    return id;
  }

  removeRule(selector: string, property: string): void {
    this.rules.get(selector)?.delete(property);
    if (property === APPLY || applyBound(selector, this.rules)) return this.feed();
    // Delete is not revert — but `@apply` may still supply this property, and
    // what `feed` paints is the expansion, not the selector's own entries. So
    // resolve first, or removing a row un-paints an inherited value instead of
    // falling back to it.
    const under = expand(this.rules, selector).get(property);
    if (under === undefined) this.sheet.clear(selector, property);
    else this.sheet.set(selector, property, under);
  }

  /** Blank book, theme back in. Load DOT calls this; Redraw does not (§1). */
  reset(): void {
    this.rules = new Map();
    this.counter = 1;
    this.absorb(fileEntries(basicTheme as T.StyleFile));
  }

  cleanup(): void {
    for (const [selector, properties] of this.rules) {
      if (properties.size === 0) this.rules.delete(selector);
    }
    this.feed();
  }

  rows(): T.StyleRow[] {
    return [...this.rules].flatMap(([selector, properties]) =>
      [...properties].map(([property, rule]) => ({ selector, property, ...rule })),
    );
  }

  save(): void {
    download(STYLE_FILE, JSON.stringify(asDocument(THEME_NAME, this.rules), null, 2));
  }

  serialize(): string {
    return serialize(this.rules);
  }

  /**
   * A whole bag or file through the same guard, painted once at the end.
   *
   * This cannot be a loop over `addRule`: a file may name a mixin in `@apply`
   * before the mixin's own entry arrives, and `addRule` paints as it goes, so the
   * forward reference would throw mid-absorb. One feed after the last write sees
   * a complete book.
   */
  absorb(entries: Iterable<Written>): void {
    for (const [selector, property, value, source] of entries) {
      this.write(selector, property, value, source);
    }
    this.feed();
  }

  /** Paints the book. The redraw conductor, after absorbing the derived bag. */
  feed(): void {
    this.sheet.feed(this.rules);
  }

  /** The guard and the book. The id the entry carries, or `REFUSED`. */
  private write(selector: string, property: string, value: string, source: T.Source): number {
    const written = writeRule(this.rules, selector, property, value, source, this.counter);
    if (written === this.counter) this.counter += 1;
    return written;
  }
}

/** A refused write, and the id a row that is not in the book carries. */
export const REFUSED = 0;

/**
 * The guard, and the book write it allows. `candidate` is the next id the caller
 * has to give; what comes back is the id the entry actually carries — the
 * existing one when this was an overwrite, `REFUSED` when the write was refused.
 * So the caller advances its counter only when the candidate was taken.
 *
 * Pure, and the only place the source rule is expressed. The counter and the
 * paint that follow belong to the `Stylist`.
 */
export function writeRule(
  rules: T.StyleRules,
  selector: string,
  property: string,
  value: string,
  source: T.Source,
  candidate: number,
): number {
  const existing = rules.get(selector)?.get(property);
  if (existing !== undefined && source < existing.source) return REFUSED;
  const id = existing?.id ?? candidate;
  own(rules, selector).set(property, { value, id, source });
  return id;
}

/** selector, property, value, source — one accepted-or-refused write. */
type Written = [string, string, string, T.Source];

/** A producer's bag, all at one source. The derived rules arrive this way. */
export function* bagEntries(bag: T.StyleBag, source: T.Source): Generator<Written> {
  for (const [selector, properties] of bag) {
    for (const [property, value] of properties) yield [selector, property, value, source];
  }
}

/** A file, each entry at its own source. The theme, and a saved book. */
export function* fileEntries(file: T.StyleFile): Generator<Written> {
  for (const [selector, properties] of Object.entries(file)) {
    for (const [property, entry] of Object.entries(properties)) {
      yield [selector, property, entry.value, entry.source];
    }
  }
}

/** The book as a file: `{ selector: { property: { value, source } } }`. No ids.
 *  `only` keeps one source — what Save Styles narrows to; absent keeps all,
 *  which is what the export seed wants. */
export function asFile(rules: T.StyleRules, only?: T.Source): T.StyleFile {
  const file: T.StyleFile = {};
  for (const [selector, properties] of rules) {
    for (const [property, rule] of properties) {
      if (only !== undefined && rule.source !== only) continue;
      (file[selector] ??= {})[property] = { value: rule.value, source: rule.source };
    }
  }
  return file;
}

/** The book as a saved document: the user's rules, over a named theme. */
export function asDocument(theme: string, rules: T.StyleRules): T.StyleDocument {
  return { theme, style: asFile(rules, T.SOURCE.user) };
}

/**
 * The entries of either shape a style JSON can arrive in: a document, or the
 * bare file an export seed carries. The discriminator is `theme` holding a
 * string: in a file every top-level value is a map of declarations, so a
 * selector named `theme` still cannot look like this.
 */
export function* documentEntries(parsed: T.StyleFile | T.StyleDocument): Generator<Written> {
  yield* fileEntries(isDocument(parsed) ? parsed.style : parsed);
}

/** The theme a document names, or the founding one when it is a bare file. */
export function themeOf(parsed: T.StyleFile | T.StyleDocument): string {
  return isDocument(parsed) ? parsed.theme : THEME_NAME;
}

function isDocument(parsed: T.StyleFile | T.StyleDocument): parsed is T.StyleDocument {
  return typeof (parsed as T.StyleDocument).theme === "string";
}

function own(rules: T.StyleRules, selector: string): Map<string, T.Rule> {
  const properties = rules.get(selector) ?? new Map<string, T.Rule>();
  rules.set(selector, properties);
  return properties;
}

function download(name: string, body: string): void {
  const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}
