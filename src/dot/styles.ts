// The walk's record → what the author said about looks (§3.2).
//
// **Provenance is kept here.** A declaration's scope *is* the selector we want,
// so nothing is pushed down onto members: `node [fillcolor=coral]` inside
// `cluster_a` becomes `.cluster_a.node, .cluster_a.record`, not three `#id`
// rules and a statistical guess at which value had been the default.

import type * as T from "../types.ts";

/** DOT attribute → CSS property. Absent means it is not appearance (§3.2). */
const ATTR_CSS: T.AttrCss = new Map([
  ["fillcolor", "background-color"],
  ["bgcolor", "background-color"],
  ["color", "border-color"],
  ["fontcolor", "color"],
  ["fontname", "font-family"],
  ["fontsize", "font-size"],
  ["penwidth", "border-width"],
  ["width", "width"],
  ["height", "height"],
]);

/** Appearance only. An attribute `ATTR_CSS` does not know is not style. */
export function buildStyles(written: T.Written): T.DotStyles {
  const styles: T.DotStyles = new Map();

  for (const { scope, about, attrs } of written.declarations) {
    for (const [attr, value] of attrs) add(styles, selectorFor(about, scope), attr, value);
  }
  for (const { id, attrs } of [...written.nodes, ...written.edges]) {
    for (const [attr, value] of attrs) add(styles, `#${id}`, attr, value);
  }
  for (const [name, said] of written.scopes) {
    for (const [attr, value] of said) add(styles, scopeSelector(name), attr, value);
  }
  return styles;
}

/**
 * A scope's own attributes. The root graph is `:root, svg` — both, because a
 * sheet attached to the page is not guaranteed to resolve custom properties
 * inside an SVG subtree from `:root` alone (§3.2). A subgraph is its class.
 */
const scopeSelector = (name: T.SubgraphName): T.Selector =>
  name === "" ? ":root, svg" : `.${name}`;

/**
 * `node [...]` at the root is `.node, .record`; the same inside `cluster_a` is
 * `.cluster_a.node, .cluster_a.record`. Composed flat, because a subgraph name
 * is a class on the node element and there is no wrapper to descend from.
 */
function selectorFor(about: "node" | "edge" | "graph", scope: T.Scope): T.Selector {
  const nesting = scope.map((name) => `.${name}`).join("");
  if (about === "graph") return scopeSelector(scope.at(-1) ?? "");
  if (about === "edge") return `${nesting}.edge`;
  return `${nesting}.node, ${nesting}.record`;
}

function add(styles: T.DotStyles, where: T.Selector, attr: T.DotAttr, value: T.DotValue): void {
  const property = ATTR_CSS.get(attr);
  if (!property) return;
  if (!styles.has(where)) styles.set(where, new Map());
  styles.get(where)!.set(property, lengthy(value));
}

// A DOT length is a bare number, and `font-size: 12` is invalid CSS — a
// `<length>` needs a unit unless it is zero — so the rule was being refused and
// never painted. Units are the one thing we correct (§3.2), and `px` is it. No
// colour or font-family value is ever a bare number, so one test covers all four.
const lengthy = (value: T.DotValue): T.CssValue =>
  /^\d*\.?\d+$/.test(value) ? `${value}px` : value;
