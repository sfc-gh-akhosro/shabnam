// The walk's record → the semantics (§3.1).
//
// **Markup is resolved here.** A node has to know its own shape, so a
// `node [shape=record]` written on a cluster is pushed down onto every member,
// innermost winning. Appearance is not resolved — see `styles.ts` for why.

import type * as T from "../types.ts";

/** The attributes that decide markup, and so belong to the model, not to style. */
const ATTR_MARKUP = ["shape", "label", "icon", "caption", "shell", "style"] as const;

export function buildModel(written: T.Written): T.DiagramModel {
  return {
    rankdir: written.rankdir,
    nodes: new Map([...written.members.keys()].map((id) => [id, node(id, written)])),
    edges: written.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      classes: [...edge.scope],
      style: resolveEdge(edge, written),
    } satisfies T.DiagramEdge)),
    clusters: [...written.scopes.keys()]
      .filter((name) => name.startsWith("cluster"))
      .map((name) => cluster(name, written)),
  };
}

function node(id: T.NodeId, written: T.Written): T.DiagramNode {
  const classes = [...(written.members.get(id) ?? [])];
  const markup = resolve(id, classes, written);
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

/** An `edge [...]` whose scope encloses this statement, then the edge itself. */
function resolveEdge(edge: T.EdgeStated, written: T.Written): string {
  const resolved = new Map<T.DotAttr, T.DotValue>();
  const enclosing = written.declarations
    .filter((one) => one.about === "edge" && encloses(one.scope, edge.scope))
    .sort((a, b) => a.scope.length - b.scope.length);
  for (const one of enclosing) keep(resolved, one.attrs);
  keep(resolved, edge.attrs);
  return resolved.get("style") ?? "";
}

/**
 * Every `node [...]` whose scope encloses this node, outermost first, then the
 * node's own statement. Later writes win, so the innermost declaration and then
 * the node itself have the last word. Markup only — appearance is `styles.ts`'s.
 */
function resolve(
  id: T.NodeId,
  classes: T.SubgraphName[],
  written: T.Written,
): Map<T.DotAttr, T.DotValue> {
  const resolved = new Map<T.DotAttr, T.DotValue>();
  const enclosing = written.declarations
    .filter((one) => one.about === "node" && encloses(one.scope, classes))
    .sort((a, b) => a.scope.length - b.scope.length);
  for (const one of enclosing) keep(resolved, one.attrs);
  for (const own of written.nodes) if (own.id === id) keep(resolved, own.attrs);
  return resolved;
}

const keep = (into: Map<T.DotAttr, T.DotValue>, attrs: Map<T.DotAttr, T.DotValue>): void => {
  for (const attr of ATTR_MARKUP) if (attrs.has(attr)) into.set(attr, attrs.get(attr)!);
};

/** A declaration reaches a node when the node is inside every scope it sits in. */
const encloses = (scope: T.Scope, classes: T.SubgraphName[]): boolean =>
  scope.every((name) => classes.includes(name));

function cluster(name: T.SubgraphName, written: T.Written): T.DiagramCluster {
  const said = written.scopes.get(name) ?? new Map();
  return {
    name,
    label: named(said.get("label") ?? "", "G", name),
    isInvis: (said.get("style") ?? "").split(",").includes("invis"),
    nodes: membersOf(name, written),
    clusters: [...written.nesting]
      .filter(([, scope]) => scope.at(-1) === name)
      .map(([child]) => child),
  };
}

const membersOf = (name: T.SubgraphName, written: T.Written): T.NodeId[] =>
  [...written.members].filter(([, scopes]) => scopes.has(name)).map(([id]) => id);

// Graphviz's label escapes, substituted on one already-parsed field rather than
// in a pass over DOT (§3.1): `\N` is the node's own name, `\G` a cluster's.
// Matching whole `\x` pairs is what leaves `\\N` and the `\n` break contract be.
const named = (label: string, escape: string, name: string): string =>
  label.replace(/\\(.)/g, (whole, char) => (char === escape ? name : whole));
