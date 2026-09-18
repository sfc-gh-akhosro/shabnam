// Discovery: what CSSOM gives back when we use it as our CSS parser and
// normaliser (§4). Runs in the browser, not under `bun` — paste the exported
// function into the console, or call it from the JS tab.
//
// Three findings, all of which shaped `src/style/style-merger.ts`:
//
//   1. Native nesting survives. `.cluster_a { &.node { … } }` comes back as a
//      child CSSStyleRule with `selectorText` "&.node" intact, and the parent's
//      `cssText` includes it. Braces inside strings (`content: "}"`) are a
//      non-issue — the one thing a hand-rolled brace scanner can choke on.
//
//   2. `cssText` canonicalises in both directions. Four `border-*-width`
//      longhands serialise back as `border-width: 1px`; two of the four stay
//      longhand. So shorthand-versus-longhand stops being a difference, which is
//      one of the false triggers we are here to kill.
//
//   3. `var()` on a *shorthand* is a trap, and the reason this file exists.
//      `border-color: var(--secondary-color)` enumerates four longhands whose
//      `getPropertyValue()` each return the empty string — the value lives only
//      in `style.cssText`. Reading longhands alone would have emptied
//      `theme/blueprint.css`'s `border-color` and our own preamble's `gap` and
//      `padding`. Hence the whole-rule fallback in `flatten`.

const CSS = `
.node {
  border-width: 1px;
  background-color: #BBDEFB;
  border-color: RED;   /* brand */
}
.cluster_a {
  &.node { background-color: #ddffdd; }
}
.varshorthand { border-color: var(--secondary-color); border-width: 2px; }
.varlonghand  { box-shadow: var(--flat-shadow); stroke: var(--accent-color); }
.weird::after { content: "}"; }
@media print { .node { padding: 0; } }
@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }
`;

export function probe(): unknown {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);

  return {
    // Finding 1 + the round trip every rule type takes in `canonical()`.
    serialized: [...sheet.cssRules].map((rule) => rule.cssText),

    // Findings 2 and 3: what each rule's declarations look like when read
    // property by property, and where an empty value means "ask cssText".
    rules: [...sheet.cssRules].map((rule) => {
      const style = (rule as CSSStyleRule).style;
      if (style === undefined) return { selector: null, type: rule.constructor.name };
      return {
        selector: (rule as CSSStyleRule).selectorText,
        cssText: style.cssText,
        values: [...style].map((property) => [property, style.getPropertyValue(property)]),
        // True when finding 3 applies and this rule has to be compared whole.
        pending: [...style].some((property) => style.getPropertyValue(property) === ""),
      };
    }),
  };
}
