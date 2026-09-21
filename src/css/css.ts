// Css facade. CSSOM is the only parser. Missing CSSStyleSheet throws.

import type * as T from "../types.ts";
import { expandCss } from "./expander.ts";

type Rule = Map<string, string> | string;

const NESTED = " >> ";

export class Css implements T.Css {
  plus(derived: string, style: string): string {
    if (typeof CSSStyleSheet === "undefined") {
      throw new Error("Css.plus requires CSSOM (CSSStyleSheet)");
    }
    const incoming = flatten(derived);
    const mine = flatten(style);
    for (const [path, rule] of incoming) {
      mine.set(path, overlay(mine.get(path), rule));
    }
    const entries = [...mine];
    entries.sort(([a], [b]) => Number(b.startsWith(":root")) - Number(a.startsWith(":root")));
    return entries.map(([path, rule]) => emit(path, rule)).join("\n\n");
  }

  expand(css: string, theme: string): string {
    return expandCss(css, theme);
  }
}

function parse(css: string): CSSStyleSheet {
  const sheet = new CSSStyleSheet();
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
    const path = prefix + label(rule);
    const own = readRule(rule);
    if (own !== undefined) flat.set(path, own);
    const nested = (rule as CSSGroupingRule).cssRules;
    if (nested !== undefined && own !== rule.cssText) walk([...nested], path + NESTED, flat);
  }
}

function label(rule: CSSRule): string {
  const style = rule as CSSStyleRule;
  if (style.selectorText !== undefined) return style.selectorText;
  if (isConditional(rule)) return `@${atRule(rule)} ${(rule as CSSConditionRule).conditionText}`;
  return rule.cssText;
}

function atRule(rule: CSSRule): string {
  return rule.constructor.name.replace(/^CSS|Rule$/g, "").toLowerCase();
}

function readRule(rule: CSSRule): Rule | undefined {
  const style = (rule as CSSStyleRule).style;
  if (style !== undefined) {
    if (style.length === 0) return undefined;
    const properties = [...style];
    if (properties.some((property) => style.getPropertyValue(property) === "")) {
      return style.cssText;
    }
    return new Map(properties.map((property) => [property, style.getPropertyValue(property)]));
  }
  return isConditional(rule) ? undefined : rule.cssText;
}

function isConditional(rule: CSSRule): boolean {
  return (rule as CSSConditionRule).conditionText !== undefined;
}

function overlay(mine: Rule | undefined, drift: Rule): Rule {
  if (mine === undefined) return drift;
  if (typeof mine !== "string" && typeof drift !== "string") {
    return new Map([...mine, ...drift]);
  }
  const style = scratch();
  style.cssText = `${asText(mine)} ${asText(drift)}`;
  return style.cssText;
}

function asText(rule: Rule): string {
  return typeof rule === "string" ? rule : declarations(rule);
}

function emit(path: string, drift: Rule): string {
  const steps = path.split(NESTED);
  const wrappers = steps.filter((step) => step.startsWith("@"));
  const selector = steps.filter((step) => !step.startsWith("@")).join("").replaceAll("&", "");
  const body = typeof drift === "string" ? drift : declarations(drift);
  const rule = selector === "" ? body : `${selector} { ${body} }`;
  return wrappers.reduceRight((inner, wrapper) => `${wrapper} { ${inner} }`, rule);
}

function declarations(drift: Map<string, string>): string {
  const style = scratch();
  for (const [property, value] of drift) style.setProperty(property, value);
  return style.cssText;
}

function scratch(): CSSStyleDeclaration {
  return (parse(".shabnam-scratch {}").cssRules[0] as CSSStyleRule).style;
}
