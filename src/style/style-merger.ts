// Base CSS is derived *and* editable (§4), which is a contradiction unless a
// Redraw can tell the user's typing apart from its own last output. That is the
// whole job of this file.
//
//   userEdits = edited − derived           what the user actually changed
//   myStyle'  = myStyle ⊎ userEdits        merged by selector, in CSSOM notation
//
// Diffing against the *last derived text* rather than against the next one is
// the point. A rule the DOT legitimately dropped appears in `derived` too, so it
// cancels and never migrates; a rule the user typed does not, so it always
// survives. Diffing old-derived against new-derived would silt My Style up with
// styling for nodes that no longer exist.
//
// **The browser is the parser and the normaliser.** We hand CSS to CSSOM and
// read it back, so every difference that is only notation — whitespace, a
// comment, `RED` against `red`, `#BBDEFB` against `rgb(187, 222, 251)`,
// `border-width: 1px` against its four longhands — has already collapsed by the
// time we compare. Those are the false triggers; suppressing them is the
// requirement, and it costs us no code and no dependency. A hand-written
// comparison would have to reimplement CSS value semantics to get there.
//
// Redraw is also the moment the tabs and the DOM are made to agree, so My Style
// comes back in the browser's own notation. Comments and formatting are lost;
// nothing that *does* anything is.

import type * as T from "../types.ts";

// A rule, keyed by its nesting path. A declaration map when the browser resolved
// every property, and the rule's own serialization when it did not — see
// `readRule` for the one case that forces it, and `research-lab/probe-cssom.ts`
// for how it was found.
type Rule = Map<string, string> | string;

const NESTED = " >> ";

export class StyleMerger implements T.StyleMerger {
  rebase(beforeDerived: string, newDerived: string, effects: string): T.StyleRebase {
    if (newDerived === beforeDerived && effects !== "") return { myStyle: effects, moved: 0 };
    if (typeof CSSStyleSheet === "undefined") {
      const combined = effects ? `${newDerived}\n\n${effects}` : newDerived;
      return { myStyle: combined, moved: 1 };
    }

    const incoming = flatten(newDerived);
    if (incoming.size === 0) return { myStyle: effects, moved: 0 };

    const mine = flatten(effects);
    for (const [path, rule] of incoming) {
      mine.set(path, overlay(mine.get(path), rule));
    }

    return {
      myStyle: [...mine].map(([path, rule]) => emit(path, rule)).join("\n\n"),
      moved: incoming.size,
    };
  }
}

// Off-document, so nothing is applied, nothing reflows, and nothing depends on
// what the live page currently holds. The tab text is the source of truth.
function parse(css: string): CSSStyleSheet {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  return sheet;
}

// ------------------------------------------------------------------ flattening

// Path → rule, walking nested rules and at-rules. A nested rule's path carries
// its ancestors, so `.cluster_a { &.node { } }` is one entry keyed
// `.cluster_a >> &.node` and the two levels never collide.
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

    // A style rule can carry a bag *and* hold `&.node`; a conditional group only
    // holds children. A leaf keeps its children inside its own text.
    const nested = (rule as CSSGroupingRule).cssRules;
    if (nested !== undefined && own !== rule.cssText) walk([...nested], path + NESTED, flat);
  }
}

// `selectorText` for a style rule, the condition for a conditional group, and
// the whole serialization for a leaf — `@keyframes` has neither, and using its
// text as its own key is both unique and stable.
function label(rule: CSSRule): string {
  const style = rule as CSSStyleRule;
  if (style.selectorText !== undefined) return style.selectorText;
  if (isConditional(rule)) return `@${atRule(rule)} ${(rule as CSSConditionRule).conditionText}`;
  return rule.cssText;
}

// `CSSMediaRule` → `media`. The constructor name is the only handle the DOM
// gives us for this, and it is stable across browsers.
function atRule(rule: CSSRule): string {
  return rule.constructor.name.replace(/^CSS|Rule$/g, "").toLowerCase();
}

// The one subtlety of using CSSOM, and the reason a whole-rule fallback exists.
//
// `border-color: var(--secondary-color)` enumerates four longhands, and every
// one of them reads back as the empty string — a `var()` on a shorthand is a
// *pending-substitution value*, and it survives only in `style.cssText`. Reading
// longhands alone would empty every `var()` shorthand in a theme. So when any
// property fails to resolve, the rule is compared and carried whole.
//
// Three kinds of rule, and the order matters:
//
//   • it has declarations — a style rule, `@font-face`, one keyframe step — so
//     read them, coarse or fine. A nested child is *not* included here; `walk`
//     reaches it separately, which is what keeps the two levels distinct.
//   • it is a conditional group — `@media`, `@supports` — so it has nothing of
//     its own to compare. Returning its text as well as walking its children
//     would count the same declarations twice and emit the rule twice.
//   • anything else — `@keyframes`, `@import`, `@layer` — is a leaf carried
//     verbatim. Nothing has to be modelled for it to survive.
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

// --------------------------------------------------------------------- diffing

// What `edited` says that `before` did not. Undefined when they agree, which is
// the common case and the whole reason this is cheap.
function changed(before: Rule | undefined, edited: Rule): Rule | undefined {
  if (typeof edited === "string" || typeof before === "string" || before === undefined) {
    return same(before, edited) ? undefined : edited;
  }

  const drift = new Map(
    [...edited].filter(([property, value]) => before.get(property) !== value),
  );
  return drift.size === 0 ? undefined : drift;
}

function same(before: Rule | undefined, edited: Rule): boolean {
  if (before === undefined) return false;
  if (typeof before === "string" || typeof edited === "string") return before === edited;
  return serialize(before) === serialize(edited);
}

function serialize(rule: Map<string, string>): string {
  return [...rule].map(([property, value]) => `${property}:${value}`).join(";");
}

// A rule the user already had, plus what they just changed. Two declaration maps
// merge key by key; anything carried as text is merged by handing both to CSSOM
// and letting the later one win, which is what the cascade would have done.
//
// This case is not hypothetical: `theme/blueprint.css` styles `.node` with
// `border-color: var(--secondary-color)`, so that rule is carried whole — and
// replacing it outright with a one-declaration edit would take its border,
// radius and shadow with it.
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

// -------------------------------------------------------------------- emitting

// A path back into a selector. Nesting is flattened to a compound selector —
// `.cluster_a >> &.node` becomes `.cluster_a.node` — because a bare `&` with no
// parent means nothing, and flat is the rule we set for Base CSS (§3.2). An
// at-rule stays a wrapper, because that is the only thing it can be.
function emit(path: string, drift: Rule): string {
  const steps = path.split(NESTED);
  const wrappers = steps.filter((step) => step.startsWith("@"));
  const selector = steps.filter((step) => !step.startsWith("@")).join("").replaceAll("&", "");
  const body = typeof drift === "string" ? drift : declarations(drift);

  const rule = selector === "" ? body : `${selector} { ${body} }`;
  return wrappers.reduceRight((inner, wrapper) => `${wrapper} { ${inner} }`, rule);
}

// Only the properties that changed, handed back to the browser so it collapses
// them into the tightest shorthand it can: four `border-*-width` come out as
// `border-width`, two of the four stay longhand. So a one-declaration edit stays
// a one-declaration edit.
function declarations(drift: Map<string, string>): string {
  const style = scratch();

  for (const [property, value] of drift) style.setProperty(property, value);
  return style.cssText;
}

// An empty declaration block to assemble into. The browser owns the
// serialization; we only put values in and read the text back out.
function scratch(): CSSStyleDeclaration {
  return (parse(".shabnam-scratch {}").cssRules[0] as CSSStyleRule).style;
}
