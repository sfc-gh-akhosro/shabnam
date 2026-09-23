// The one live sheet, and the `@apply` resolution that happens on the way in.
//
// `#shabnam-style-css` is driven through CSSOM only (§3): one `CSSStyleRule` per
// selector, a property is `setProperty` / `removeProperty`. Nothing here writes
// `textContent`, and nothing asks the browser to read a sheet back.
//
// `resolve` and `serialize` are pure: rules in, rules or text out, no DOM. That
// is what makes the interesting half of this file testable under bun, which has
// no CSSOM at all.

import type * as T from "../types.ts";

const SINK = "shabnam-style-css";
const APPLY = "@apply";

/** Expands every `@apply` in place, so the selector's own later properties win. */
export function resolve(rules: T.StyleRules): T.StyleRules {
  const out: T.StyleRules = new Map();
  for (const selector of rules.keys()) out.set(selector, flatten(selector, rules, []));
  return out;
}

/** CSS text. Export HTML and Save PNG only — see `Stylist.serialize`. */
export function serialize(rules: T.StyleRules): string {
  return [...resolve(rules)]
    .map(([selector, own]) => `${selector} {\n${declarations(own)}\n}`)
    .join("\n\n");
}

/** True when some `@apply` names this selector, so a change to it must re-feed. */
export function applyBound(selector: string, rules: T.StyleRules): boolean {
  for (const own of rules.values()) {
    const names = own.get(APPLY);
    if (names !== undefined && names.trim().split(/\s+/).includes(selector)) return true;
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
      for (const [property, value] of own) rule.style.setProperty(property, value);
    }
  }

  set(selector: string, property: string, value: string): void {
    this.rule(selector).style.setProperty(property, value);
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
  const element = document.getElementById(SINK) as HTMLStyleElement;
  if (element.sheet === null) throw new Error(`#${SINK} has no sheet: not in the document yet`);
  return element.sheet;
}

function flatten(selector: string, rules: T.StyleRules, seen: string[]): Map<string, string> {
  if (seen.includes(selector)) throw new Error(`@apply cycle: ${[...seen, selector].join(" → ")}`);
  const own = rules.get(selector);
  if (own === undefined) throw new Error(`@apply ${selector}: not defined`);

  const out = new Map<string, string>();
  for (const [property, value] of own) {
    if (property !== APPLY) {
      out.set(property, value);
      continue;
    }
    for (const name of value.trim().split(/\s+/)) {
      for (const entry of flatten(name, rules, [...seen, selector])) out.set(...entry);
    }
  }
  return out;
}

function declarations(own: Map<string, string>): string {
  return [...own].map(([property, value]) => `  ${property}: ${value};`).join("\n");
}
