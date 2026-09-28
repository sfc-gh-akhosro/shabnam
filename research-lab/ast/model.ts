// research-lab/ast/model.ts — the record → the semantics.
//
// **Markup is resolved here.** A node has to know its own shape, so a
// `node [shape=record]` written on a cluster is pushed down onto every member,
// innermost winning. Appearance is not resolved — see styles.ts for why.

import type {
  DiagramCluster,
  DiagramEdge,
  DiagramModel,
  DiagramNode,
  DotAttr,
  DotValue,
  NodeId,
  Scope,
  SubgraphName,
  Written,
} from "./types.ts";

export function buildModel(written: Written): DiagramModel {
  return {
    rankdir: written.rankdir,
    nodes: [...written.members.keys()].map((id) => node(id, written)),
    edges: written.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      classes: [...edge.scope],
    } satisfies DiagramEdge)),
    clusters: [...written.scopes.keys()]
      .filter((name) => name.startsWith("cluster"))
      .map((name) => cluster(name, written)),
  };
}

function node(id: NodeId, written: Written): DiagramNode {
  const classes = [...(written.members.get(id) ?? [])];
  const markup = resolve(id, classes, written);
  return {
    id,
    classes,
    shape: markup.get("shape") ?? "box",
    label: markup.get("label") ?? id,
    icon: markup.get("icon") ?? "",
    caption: markup.get("caption") ?? "",
  };
}

/**
 * Every `node [...]` whose scope encloses this node, outermost first, then the
 * node's own statement. Later writes win, so the innermost declaration and then
 * the node itself have the last word.
 */
function resolve(id: NodeId, classes: SubgraphName[], written: Written): Map<DotAttr, DotValue> {
  const resolved = new Map<DotAttr, DotValue>();
  const enclosing = written.declarations
    .filter((one) => one.about === "node" && encloses(one.scope, classes))
    .sort((a, b) => a.scope.length - b.scope.length);
  for (const one of enclosing) for (const [key, value] of one.attrs) resolved.set(key, value);
  for (const own of written.nodes) {
    if (own.id === id) for (const [key, value] of own.attrs) resolved.set(key, value);
  }
  return resolved;
}

/** A declaration reaches a node when the node is inside every scope it sits in. */
const encloses = (scope: Scope, classes: SubgraphName[]): boolean =>
  scope.every((name) => classes.includes(name));

function cluster(name: SubgraphName, written: Written): DiagramCluster {
  const said = written.scopes.get(name) ?? new Map();
  return {
    name,
    label: said.get("label") ?? "",
    isInvis: (said.get("style") ?? "").split(",").includes("invis"),
    nodes: membersOf(name, written),
    clusters: [...written.nesting]
      .filter(([, scope]) => scope.at(-1) === name)
      .map(([child]) => child),
  };
}

export const membersOf = (name: SubgraphName, written: Written): NodeId[] =>
  [...written.members].filter(([, scopes]) => scopes.has(name)).map(([id]) => id);
