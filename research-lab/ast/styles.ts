// research-lab/ast/styles.ts — the record → what the author said about looks.
//
// **Provenance is kept here.** A declaration's scope *is* the selector we want,
// so nothing is pushed down onto members: `node [fillcolor=coral]` inside
// `cluster_a` becomes `.cluster_a.node`, not three `#id` rules. Values pass
// through exactly as typed — `height=0` stays `"0"`.

import type {
  CssValue,
  DotStyles,
  Property,
  Scope,
  Selector,
  Written,
} from "./types.ts";
import { ATTR_CSS } from "./types.ts";

/** Appearance only. An attribute `ATTR_CSS` does not know is not style. */
export function buildStyles(written: Written): DotStyles {
  const styles: DotStyles = new Map();

  for (const { scope, about, attrs } of written.declarations) {
    for (const [attr, value] of attrs) add(styles, selectorFor(about, scope), attr, value);
  }
  for (const { id, attrs } of written.nodes) {
    for (const [attr, value] of attrs) add(styles, `#${id}`, attr, value);
  }
  for (const { id, attrs } of written.edges) {
    for (const [attr, value] of attrs) add(styles, `#${id}`, attr, value);
  }
  for (const [name, said] of written.scopes) {
    if (name === "") continue;
    for (const [attr, value] of said) add(styles, `.${name}`, attr, value);
  }
  return styles;
}

/** The same walk, untranslated — every DOT attribute, for reading the record. */
export function buildDotAttrs(written: Written): DotStyles {
  const raw: DotStyles = new Map();
  const keep = (where: Selector, attr: string, value: string) => {
    if (!raw.has(where)) raw.set(where, new Map());
    raw.get(where)!.set(attr, value);
  };
  for (const { scope, about, attrs } of written.declarations) {
    for (const [attr, value] of attrs) keep(selectorFor(about, scope), attr, value);
  }
  for (const { id, attrs } of [...written.nodes, ...written.edges]) {
    for (const [attr, value] of attrs) keep(`#${id}`, attr, value);
  }
  for (const [name, said] of written.scopes) {
    if (name === "") continue;
    for (const [attr, value] of said) keep(`.${name}`, attr, value);
  }
  return raw;
}

/**
 * `node [...]` at the root is `.node, .record`; the same inside `cluster_a` is
 * `.cluster_a.node, .cluster_a.record`. Composed flat, because a subgraph name
 * is a class on the node element and there is no wrapper to descend from.
 */
function selectorFor(about: "node" | "edge" | "graph", scope: Scope): Selector {
  const nesting = scope.map((name) => `.${name}`).join("");
  if (about === "graph") return nesting === "" ? ":root, svg" : nesting;
  if (about === "edge") return `${nesting}.edge`;
  return `${nesting}.node, ${nesting}.record`;
}

function add(styles: DotStyles, where: Selector, attr: string, value: CssValue): void {
  const property: Property | undefined = ATTR_CSS.get(attr);
  if (!property) return;
  if (!styles.has(where)) styles.set(where, new Map());
  styles.get(where)!.set(property, value);
}
