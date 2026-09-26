// The one live sheet, and the `@apply` expansion that happens on the way in.
//
// `#style-css` is driven through CSSOM only (§3): one `CSSStyleRule` per
// selector, a property is `setProperty` / `removeProperty`. Nothing here writes
// `textContent`, and nothing asks the browser to read a sheet back.
//
// A rule id never appears here. CSSOM offers no handle on a single declaration —
// only on the block — so an id reaches paint the only way it can: through the
// book, as `(selector, property)`. The id lives in the entry, not in the sheet.
//
// `expand`, `resolve` and `serialize` are pure: rules in, rules or text out, no
// DOM. That is what makes the interesting half of this file testable under bun,
// which has no CSSOM at all.

import type * as T from "../types.ts";

const SINK = "style-css";
const APPLY = "@apply";

/**
 * One selector's declarations, with every `@apply` expanded in place so the
 * selector's own later properties win.
 *
 * Expansion is a **read**: what comes back is destined for the sheet and never
 * becomes a book entry, which is why an expanded declaration has no id and no
 * source to argue about.
 */
export function expand(rules: T.StyleRules, selector: string): Map<string, string> {
  return flatten(selector, rules, []);
}

/** Every selector, expanded. What `feed` and `serialize` both walk. */
export function resolve(rules: T.StyleRules): T.StyleBag {
  const out: T.StyleBag = new Map();
  for (const selector of rules.keys()) out.set(selector, expand(rules, selector));
  return out;
}

/**
 * A declaration value split from its priority.
 *
 * `!important` is `setProperty`'s third argument, not part of the value, so a
 * value still carrying it is not a valid value of anything and CSSOM drops the
 * whole declaration without a word. The book keeps the text as typed — that is
 * what the user wrote, and `serialize` emits correct CSS for it — so the split
 * happens here, on the way to the sheet, and nowhere else.
 */
export function priority(value: string): [value: string, priority: string] {
  const match = /^(.*?)\s*!\s*important\s*$/i.exec(value);
  return match === null ? [value, ""] : [match[1]!.trim(), "important"];
}

/**
 * The book as CSS text. The picture exports only — see `Stylist.serialize`.
 *
 * Read off the live sheet, because `feed` already expanded every `@apply` on the
 * way in — the sheet holds none, so there is nothing to resolve here. `cssText`
 * gives declared values, so `var()` and `color-mix()` survive as written.
 */
export function serialize(): string {
  return [...live().cssRules].map((rule) => rule.cssText).join("\n");
}

/** True when some `@apply` names this selector, so a change to it must re-feed. */
export function applyBound(selector: string, rules: T.StyleRules): boolean {
  for (const own of rules.values()) {
    const names = own.get(APPLY);
    if (names !== undefined && names.value.trim().split(/\s+/).includes(selector)) return true;
  }
  return false;
}

export class Sheet {
  private handles = new Map<string, CSSStyleRule>();

  /** Rebuilds the sheet from the merged map. */
  feed(rules: T.StyleRules): void {
    const sheet = live();
    while (sheet.cssRules.length > 0) sheet.deleteRule(0);
    this.handles.clear();
    for (const [selector, own] of resolve(rules)) {
      const at = sheet.insertRule(`${selector} {}`, sheet.cssRules.length);
      const rule = sheet.cssRules[at] as CSSStyleRule;
      this.handles.set(selector, rule);
      for (const [property, value] of own) rule.style.setProperty(property, ...priority(value));
    }
  }

  set(selector: string, property: string, value: string): void {
    this.rule(selector).style.setProperty(property, ...priority(value));
  }

  clear(selector: string, property: string): void {
    this.rule(selector).style.removeProperty(property);
  }

  private rule(selector: string): CSSStyleRule {
    const known = this.handles.get(selector);
    if (known !== undefined) return known;
    const sheet = live();
    const at = sheet.insertRule(`${selector} {}`, sheet.cssRules.length);
    const rule = sheet.cssRules[at] as CSSStyleRule;
    this.handles.set(selector, rule);
    return rule;
  }
}

// A <style> element has no `.sheet` until it is in the document, so the element
// is found on first use — which is after mount — rather than in a constructor.
function live(): CSSStyleSheet {
  return (document.getElementById(SINK) as HTMLStyleElement).sheet!;
}

function flatten(selector: string, rules: T.StyleRules, seen: string[]): Map<string, string> {
  if (seen.includes(selector)) throw new Error(`@apply cycle: ${[...seen, selector].join(" → ")}`);
  const own = rules.get(selector);
  if (own === undefined) throw new Error(`@apply ${selector}: not defined`);

  const out = new Map<string, string>();
  for (const [property, rule] of own) {
    if (property !== APPLY) {
      out.set(property, rule.value);
      continue;
    }
    for (const name of rule.value.trim().split(/\s+/)) {
      for (const entry of flatten(name, rules, [...seen, selector])) out.set(...entry);
    }
  }
  return out;
}

