import type * as T from "../src/types.ts";

/** The reader's styles folded back to selector → property → value, which is
 *  how the reader tests read most naturally. */
export function bag(styles: T.Style[]): Map<T.Selector, Map<T.Property, T.CssValue>> {
  const out = new Map<T.Selector, Map<T.Property, T.CssValue>>();
  for (const { selector, property, value } of styles) {
    out.set(selector, (out.get(selector) ?? new Map()).set(property, value));
  }
  return out;
}
