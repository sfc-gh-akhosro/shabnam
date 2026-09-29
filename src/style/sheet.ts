// The one live sheet. `#style-css` is driven through CSSOM only: one
// `CSSStyleRule` per painted selector, a property is `setProperty` /
// `removeProperty`. Nothing here writes `textContent`, and nothing reads a
// sheet back except `serialize`, for export.

import type * as T from "../types.ts";
import { type Book, expand, mixins } from "./book.ts";

const SINK = "style-css";

/**
 * A declaration value split from its priority. `!important` is `setProperty`'s
 * third argument, not part of the value, so a value still carrying it is valid
 * nowhere and CSSOM would drop it without a word. The book keeps the text as
 * typed; the split happens here, on the way to the sheet.
 */
export function priority(value: string): [value: string, priority: string] {
  const match = /^(.*?)\s*!\s*important\s*$/i.exec(value);
  return match === null ? [value, ""] : [match[1]!.trim(), "important"];
}

/** The live sheet as CSS text, for the picture exports. The sheet holds no
 *  `@apply` and no mixin, so there is nothing to resolve. */
export function serialize(): string {
  return [...live().cssRules].map((rule) => rule.cssText).join("\n");
}

export class Sheet {
  #rules = new Map<T.Selector, CSSStyleRule>();

  /** A new book takes the sheet over from whatever painted it before. */
  constructor() {
    this.#clear();
  }

  /** Rebuilds the sheet from the book. An `@apply` changed, so which selectors
   *  are mixins may have too. */
  feed(book: Book): void {
    this.#clear();
    const skip = mixins(book);
    for (const selector of book.keys()) {
      if (!skip.has(selector)) this.paint(selector, expand(book, selector));
    }
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
