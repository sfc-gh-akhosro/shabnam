// Css facade. CSSOM is the only parser. Missing CSSStyleSheet throws.

import type * as T from "../types.ts";
import { expandCss } from "./expander.ts";

type Rule = Map<string, string> | string;

const NESTED = " >> ";

export class Css implements T.Css {
  plus(style: string, derived: string): string {
    const mine = flatten(style);
    for (const [path, rule] of flatten(derived)) {
      mine.set(path, overlay(rule, mine.get(path)));
    }
    return emitAll(mine);
  }

  minus(style: string, take: string): string {
    const mine = flatten(style);
    for (const [path, rule] of flatten(take)) {
      const left = subtract(mine.get(path), rule);
      if (left === undefined) mine.delete(path);
      else mine.set(path, left);
    }
    return emitAll(mine);
  }

  expand(css: string, theme: string): string {
    return expandCss(css, theme);
  }
}

function requireSheet(): CSSStyleSheet {
  if (typeof CSSStyleSheet === "undefined") {
    throw new Error("Css requires CSSOM (CSSStyleSheet)");
  }
  return new CSSStyleSheet();
}

function parse(css: string): CSSStyleSheet {
  const sheet = requireSheet();
  sheet.replaceSync(css);
  return sheet;
}

function flatten(css: string): Map<string, Rule> {
  const flat = new Map<string, Rule>();
  walk([...parse(css).cssRules], "", flat);
  return flat;
}

function walk(rules: CSSRule[], prefix: string, flat: Map<string, Rule>): void {
  for (const rule of rules) {
    const style = rule as CSSStyleRule;
    if (style.selectorText !== undefined) {
      const own = readRule(rule);
      if (own !== undefined) put(flat, prefix + style.selectorText, own);
    }
    const nested = (rule as CSSGroupingRule).cssRules;
    if (nested !== undefined) {
      const next = isConditional(rule) ? prefix + label(rule) + NESTED : prefix;
      walk([...nested], next, flat);
    } else if (style.selectorText === undefined) {
      put(flat, prefix + rule.cssText, rule.cssText);
    }
  }
}

function put(flat: Map<string, Rule>, path: string, own: Rule): void {
  const prev = flat.get(path);
  flat.set(path, prev === undefined ? own : overlay(prev, own));
}

function label(rule: CSSRule): string {
  if (isConditional(rule)) return `@${atRule(rule)} ${(rule as CSSConditionRule).conditionText}`;
  return rule.cssText;
}

function atRule(rule: CSSRule): string {
  return rule.constructor.name.replace(/^CSS|Rule$/g, "").toLowerCase();
}

function readRule(rule: CSSRule): Rule | undefined {
  const style = (rule as CSSStyleRule).style;
  if (style === undefined) return isConditional(rule) ? undefined : rule.cssText;
  if (style.length === 0) return undefined;
  const properties = [...style];
  if (properties.some((property) => style.getPropertyValue(property) === "")) {
    return style.cssText;
  }
  return new Map(properties.map((property) => [property, declared(style, property)]));
}

function declared(style: CSSStyleDeclaration, property: string): string {
  const important = style.getPropertyPriority(property) === "important" ? " !important" : "";
  return style.getPropertyValue(property) + important;
}

function isConditional(rule: CSSRule): boolean {
  return (rule as CSSConditionRule).conditionText !== undefined;
}

function overlay(base: Rule, over: Rule | undefined): Rule {
  if (over === undefined) return base;
  if (typeof base !== "string" && typeof over !== "string") {
    return new Map([...base, ...over]);
  }
  const style = scratch();
  style.cssText = `${asText(base)} ${asText(over)}`;
  return style.cssText;
}

function subtract(mine: Rule | undefined, take: Rule): Rule | undefined {
  if (mine === undefined) return undefined;
  if (typeof mine !== "string" && typeof take !== "string") {
    const left = new Map(mine);
    for (const [property, value] of take) {
      if (left.get(property) === value) left.delete(property);
    }
    return left.size === 0 ? undefined : left;
  }
  if (asText(mine) === asText(take)) return undefined;
  return mine;
}

function asText(rule: Rule): string {
  return typeof rule === "string" ? rule : [...rule].map(([property, value]) => `${property}: ${value};`).join(" ");
}

function emitAll(rules: Map<string, Rule>): string {
  const entries = [...rules];
  entries.sort(([a], [b]) => Number(b.startsWith(":root")) - Number(a.startsWith(":root")));
  return entries.map(([path, rule]) => emit(path, rule)).join("\n\n");
}

function emit(path: string, drift: Rule): string {
  const steps = path.split(NESTED);
  const wrappers = steps.filter((step) => step.startsWith("@"));
  const selector = steps.filter((step) => !step.startsWith("@")).at(-1) ?? "";
  const body = typeof drift === "string" ? drift : declarations(drift);
  const rule = selector === "" ? body : `${selector} {\n  ${body}\n}`;
  return wrappers.reduceRight((inner, wrapper) => `${wrapper} {\n${pad(inner)}\n}`, rule);
}

function declarations(drift: Map<string, string>): string {
  return [...drift].map(([property, value]) => `${property}: ${value};`).join("\n  ");
}

function pad(block: string): string {
  return block.split("\n").map((line) => (line === "" ? line : `  ${line}`)).join("\n");
}

function scratch(): CSSStyleDeclaration {
  return (parse(".shabnam-scratch {}").cssRules[0] as CSSStyleRule).style;
}
