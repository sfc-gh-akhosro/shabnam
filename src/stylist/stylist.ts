// Stylist — three rule layers, one merge, one live sheet.
//
// theme ← derived ← user, per property, later wins (§1). A row the user edits is
// always written into the user layer, so the theme file stays a theme and a
// redraw can replace the derived layer wholesale without touching a thing the
// user typed.
//
// `feed` is public but not on the interface: the redraw conductor calls it once
// per draw (§5). A row edit does not need it — that is the short path.

import type * as T from "../types.ts";
import { applyBound, Sheet, serialize } from "./sheet.ts";
import basicTheme from "../../theme/basic-theme.json";

const APPLY = "@apply";
const USER_FILE = "user-style.json";

export class Stylist implements T.Stylist {
  private sheet = new Sheet();
  private theme = asRules(basicTheme as T.StyleFile);
  private derived: T.StyleRules = new Map();
  private user: T.StyleRules = new Map();

  addRule(selector: string, property: string, value: string): void {
    own(this.user, selector).set(property, value);
    if (property === APPLY || applyBound(selector, this.merged())) return this.feed();
    this.sheet.set(selector, property, value);
  }

  removeRule(selector: string, property: string): void {
    this.user.get(selector)?.delete(property);
    if (property === APPLY || applyBound(selector, this.merged())) return this.feed();
    const under = this.merged().get(selector)?.get(property);
    if (under === undefined) this.sheet.clear(selector, property);
    else this.sheet.set(selector, property, under);
  }

  setDerived(rules: T.StyleRules): void {
    this.derived = rules;
  }

  cleanup(): void {
    for (const [selector, properties] of this.user) {
      if (properties.size === 0) this.user.delete(selector);
    }
    this.feed();
  }

  rows(): T.StyleRow[] {
    return [
      ...layerRows(this.theme, "theme"),
      ...layerRows(this.derived, "derived"),
      ...layerRows(this.user, "user"),
    ];
  }

  save(): void {
    download(USER_FILE, JSON.stringify(asFile(this.user), null, 2));
  }

  serialize(): string {
    return serialize(this.merged());
  }

  /** Paints the merged map. The redraw conductor, after `setDerived`. */
  feed(): void {
    this.sheet.feed(this.merged());
  }

  private merged(): T.StyleRules {
    const out: T.StyleRules = new Map();
    for (const layer of [this.theme, this.derived, this.user]) {
      for (const [selector, properties] of layer) {
        for (const entry of properties) own(out, selector).set(...entry);
      }
    }
    return out;
  }
}

export function asRules(file: T.StyleFile): T.StyleRules {
  return new Map(Object.entries(file).map(([selector, properties]) => [selector, new Map(Object.entries(properties))]));
}

export function asFile(rules: T.StyleRules): T.StyleFile {
  return Object.fromEntries([...rules].map(([selector, properties]) => [selector, Object.fromEntries(properties)]));
}

function own(rules: T.StyleRules, selector: string): Map<string, string> {
  const properties = rules.get(selector) ?? new Map<string, string>();
  rules.set(selector, properties);
  return properties;
}

function layerRows(rules: T.StyleRules, origin: T.StyleOrigin): T.StyleRow[] {
  return [...rules].flatMap(([selector, properties]) =>
    [...properties].map(([property, value]) => ({ selector, property, value, origin })),
  );
}

function download(name: string, body: string): void {
  const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}
