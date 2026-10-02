// Parser — the only reader of DOT (§2).
//
// `@ts-graphviz/ast` is visible here and nowhere else. One walk records what was
// written and where (`Written`); the model and the styles are pure readings of
// that record, which is why they can disagree about resolution. The points are
// the same tree afterwards, trimmed and printed.

import { parse, stringify } from "@ts-graphviz/ast";
import type * as T from "../types.ts";

/** A DOT name, made safe to use as an id. Nothing more is owed to a typo (§3). */
export const idOf = (name: string): T.NodeId => name.replace(/ /g, "_");

// --- the walk's record: what was written, and where -------------------------

/** Enclosing subgraph names, outermost first; `[]` is the root graph. The
 *  provenance the whole design rests on. */
type Scope = T.SubgraphName[];

/** `node [...]` / `edge [...]` / `graph [...]`, kept at its branch. */
type Declaration = { scope: Scope; about: "node" | "edge" | "graph"; attrs: Map<T.DotAttr, T.DotValue> };

/** A node or edge statement that carried attributes of its own. */
type Stated = { id: string; scope: Scope; attrs: Map<T.DotAttr, T.DotValue> };
type EdgeStated = Stated & { from: T.NodeId; to: T.NodeId };

type Written = {
  rankdir: T.Rankdir;
  /** What each subgraph said about itself: `label`, `rank`, `style`. */
  scopes: Map<T.SubgraphName, Map<T.DotAttr, T.DotValue>>;
  /** Where each subgraph sits, so nesting can be recovered. */
  nesting: Map<T.SubgraphName, Scope>;
  /** Cumulative: a node named in two subgraphs belongs to both. */
  members: Map<T.NodeId, Set<T.SubgraphName>>;
  declarations: Declaration[];
  nodes: Stated[];
  edges: EdgeStated[];
};

/** Attributes that only give a node, a label or a cluster title a size. A
 *  deny-list on purpose: whatever `dot` reads to rank and order survives because
 *  nobody took it out. */
const SIZE = new Set([
  "label", "xlabel", "headlabel", "taillabel",
  "shape", "width", "height", "fixedsize", "margin", "peripheries", "sides", "regular",
  "fontsize", "fontname", "image",
]);

/** First in the root: every node a point, since the trim removed anything that said otherwise. */
const POINTS = `node [shape=point width=0 height=0 label=""]`;

/** The attributes that decide markup, and so belong to the model, not to style. */
const ATTR_MARKUP = ["shape", "label", "icon", "caption", "shell", "style"] as const;

/** DOT attribute → CSS property. Absent means it is not appearance (§2). */
const ATTR_CSS = new Map<T.DotAttr, T.Property>([
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

export class Parser implements T.Parser {
  #written!: Written;

  parse(dot: string): T.Parsed {
    this.#written = { rankdir: "TB", scopes: new Map(), nesting: new Map(), members: new Map(), declarations: [], nodes: [], edges: [] };
    const tree = parse(dot) as any;
    const root = tree.children.find((child: any) => child.type === "Graph");
    this.#walk(root, []);
    this.#written.rankdir = (this.#written.scopes.get("")?.get("rankdir") ?? "TB") as T.Rankdir;
    return { model: modelOf(this.#written), styles: stylesOf(this.#written), points: pointsOf(tree, root) };
  }

  #walk(scope: any, at: Scope): void {
    for (const child of scope.children ?? []) {
      if (child.type === "Attribute") this.#said(child, at);
      if (child.type === "AttributeList") this.#declared(child, at);
      if (child.type === "Node") this.#node(child, at);
      if (child.type === "Edge") this.#edge(child, at);
      if (child.type === "Subgraph") this.#subgraph(child, at);
    }
  }

  /** An unnamed subgraph is there for `dot`, not for styling: it is no scope,
   *  and its statements belong to the one around it (§3). */
  #subgraph(child: any, at: Scope): void {
    if (!child.id) return this.#walk(child, at);
    const name = idOf(child.id.value);
    this.#written.nesting.set(name, at);
    if (!this.#written.scopes.has(name)) this.#written.scopes.set(name, new Map());
    this.#walk(child, [...at, name]);
  }

  /** `label = "Sources"` — the scope talking about itself. */
  #said(attr: any, at: Scope): void {
    const name = at.at(-1) ?? "";
    if (!this.#written.scopes.has(name)) this.#written.scopes.set(name, new Map());
    this.#written.scopes.get(name)!.set(attr.key.value, attr.value.value);
  }

  /** `node [...]` — a default, kept at its branch instead of pushed onto leaves. */
  #declared(list: any, at: Scope): void {
    const about = String(list.kind).toLowerCase() as Declaration["about"];
    this.#written.declarations.push({ scope: at, about, attrs: attrsOf(list) });
  }

  #node(stmt: any, at: Scope): void {
    const id = idOf(stmt.id.value);
    this.#join(id, at);
    const attrs = attrsOf(stmt);
    if (attrs.size > 0) this.#written.nodes.push({ id, scope: at, attrs });
  }

  /** `a -> b -> c` is a chain; `{a b} -> {c d}` is a cross product. */
  #edge(stmt: any, at: Scope): void {
    const steps: T.NodeId[][] = stmt.targets.map((target: any) => refs(target));
    for (const step of steps) for (const id of step) this.#join(id, at);
    for (let i = 0; i < steps.length - 1; i += 1) {
      for (const from of steps[i]!) {
        for (const to of steps[i + 1]!) {
          this.#written.edges.push({ id: `${from}_${to}`, from, to, scope: at, attrs: attrsOf(stmt) });
        }
      }
    }
  }

  /** Naming a node anywhere makes it a member of every scope it sits in. */
  #join(id: T.NodeId, at: Scope): void {
    if (!this.#written.members.has(id)) this.#written.members.set(id, new Set());
    for (const name of at) this.#written.members.get(id)!.add(name);
  }
}

// --- the library's shapes, read in one place ---------------------------------

function attrsOf(stmt: any): Map<T.DotAttr, T.DotValue> {
  const attrs = new Map<T.DotAttr, T.DotValue>();
  for (const child of stmt.children ?? []) {
    if (child.type === "Attribute") attrs.set(child.key.value, child.value.value);
  }
  return attrs;
}

/** One `->` target: a node, or a `{ … }` group of them. Ports are dropped. */
function refs(target: any): T.NodeId[] {
  if (target.type === "NodeRef") return [idOf(target.id.value)];
  return (target.children ?? []).map((child: any) => idOf(child.id.value));
}

// --- answer 1: the model. Markup is resolved here -----------------------------
//
// A node has to know its own shape, so a `node [shape=record]` written on a
// cluster is pushed down onto every member, innermost winning.

function modelOf(written: Written): T.DiagramModel {
  return {
    rankdir: written.rankdir,
    nodes: new Map([...written.members.keys()].map((id) => [id, nodeOf(id, written)])),
    edges: written.edges.map((edge): T.DiagramEdge => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      classes: [...edge.scope],
      style: resolve(written, "edge", edge.scope, [edge]).get("style") ?? "",
    })),
    clusters: [...written.scopes.keys()].filter((name) => name.startsWith("cluster")).map((name) => clusterOf(name, written)),
  };
}

function nodeOf(id: T.NodeId, written: Written): T.DiagramNode {
  const classes = [...(written.members.get(id) ?? [])];
  const markup = resolve(written, "node", classes, written.nodes.filter((own) => own.id === id));
  const label = named(markup.get("label") ?? id, "N", id);
  return {
    id,
    classes,
    shape: markup.get("shape") ?? "box",
    label,
    icon: markup.get("icon") ?? "",
    caption: named(markup.get("caption") ?? label, "N", id),
    shell: markup.get("shell") ?? "",
    style: markup.get("style") ?? "",
  };
}

/** Every declaration whose scope encloses `classes`, outermost first, then the
 *  statement's own attributes. Later writes win. Markup only. */
function resolve(written: Written, about: "node" | "edge", classes: T.SubgraphName[], own: Stated[]): Map<T.DotAttr, T.DotValue> {
  const resolved = new Map<T.DotAttr, T.DotValue>();
  const enclosing = written.declarations
    .filter((one) => one.about === about && one.scope.every((name) => classes.includes(name)))
    .sort((a, b) => a.scope.length - b.scope.length);
  for (const { attrs } of [...enclosing, ...own]) {
    for (const attr of ATTR_MARKUP) if (attrs.has(attr)) resolved.set(attr, attrs.get(attr)!);
  }
  return resolved;
}

function clusterOf(name: T.SubgraphName, written: Written): T.DiagramCluster {
  const said = written.scopes.get(name) ?? new Map();
  return {
    name,
    label: named(said.get("label") ?? "", "G", name),
    isInvis: (said.get("style") ?? "").split(",").includes("invis"),
    nodes: [...written.members].filter(([, scopes]) => scopes.has(name)).map(([id]) => id),
    clusters: [...written.nesting].filter(([, scope]) => scope.at(-1) === name).map(([child]) => child),
  };
}

// Graphviz's label escapes, substituted on one already-parsed field rather than
// in a pass over DOT: `\N` is the node's own name, `\G` a cluster's. Matching
// whole `\x` pairs is what leaves `\\N` and the `\n` break contract be.
const named = (label: string, escape: string, name: string): string =>
  label.replace(/\\(.)/g, (whole, char) => (char === escape ? name : whole));

// --- answer 2: the styles. Provenance is kept here ----------------------------
//
// A declaration's scope *is* the selector we want, so nothing is pushed down:
// `node [fillcolor=coral]` inside `cluster_a` becomes `.cluster_a.node,
// .cluster_a.record`, not three `#id` rules and a guess at the default.

function stylesOf(written: Written): T.Style[] {
  const bag = new Map<T.Selector, Map<T.Property, T.CssValue>>();
  const add = (where: T.Selector, attr: T.DotAttr, value: T.DotValue) => {
    const property = ATTR_CSS.get(attr);
    if (!property) return;
    if (!bag.has(where)) bag.set(where, new Map());
    bag.get(where)!.set(property, lengthy(value));
  };
  for (const { scope, about, attrs } of written.declarations) {
    for (const [attr, value] of attrs) add(selectorFor(about, scope), attr, value);
  }
  for (const { id, attrs } of [...written.nodes, ...written.edges]) {
    for (const [attr, value] of attrs) add(`#${id}`, attr, value);
  }
  for (const [name, said] of written.scopes) {
    for (const [attr, value] of said) add(scopeSelector(name), attr, value);
  }
  return [...bag].flatMap(([selector, properties]) =>
    [...properties].map(([property, value]): T.Style => ({ selector, property, value, source: 1 })),
  );
}

/** A scope's own attributes. A subgraph is its class. The root graph is
 *  `#diagram-canvas` — the element a `bgcolor` means — and **not** `:root`,
 *  which is `<html>` on screen and the `<svg>` after export. */
const scopeSelector = (name: T.SubgraphName): T.Selector => (name === "" ? "#diagram-canvas" : `.${name}`);

/** `node [...]` at the root is `.node, .record`; inside `cluster_a` it is
 *  `.cluster_a.node, .cluster_a.record`. Composed flat: a subgraph name is a
 *  class on the node element, and there is no wrapper to descend from. */
function selectorFor(about: Declaration["about"], scope: Scope): T.Selector {
  const nesting = scope.map((name) => `.${name}`).join("");
  if (about === "graph") return scopeSelector(scope.at(-1) ?? "");
  if (about === "edge") return `${nesting}.edge`;
  return `${nesting}.node, ${nesting}.record`;
}

// A DOT length is a bare number, and `font-size: 12` is invalid CSS, so the rule
// was refused and never painted. Units are the one thing we correct, and `px` is
// it. No colour or font-family value is ever a bare number.
const lengthy = (value: T.DotValue): T.CssValue => (/^\d*\.?\d+$/.test(value) ? `${value}px` : value);

// --- answer 3: the points — the walked tree, trimmed and printed --------------

// The walk is done and kept only strings, so the tree is free to cut.
function pointsOf(tree: any, root: any): T.PointDot {
  trim(root);
  const points = (parse(`digraph { ${POINTS} }`) as any).children[0].children[0];
  root.children.unshift(points);
  return stringify(tree);
}

function trim(branch: any): void {
  branch.children = branch.children.filter((child: any) => !(child.type === "Attribute" && SIZE.has(child.key.value)));
  for (const child of branch.children) trim(child);
}
