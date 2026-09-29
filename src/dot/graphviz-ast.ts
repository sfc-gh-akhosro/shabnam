// The only DOT reader (§2).
//
// `@ts-graphviz/ast` is visible here and nowhere else. One walk records what was
// written and where (`Written`); the three answers are pure readings of that
// record, which is why they can disagree about resolution.

import { parse } from "@ts-graphviz/ast";
import * as T from "../types.ts";
import { buildModel } from "./model.ts";
import { buildStyles } from "./styles.ts";
import { buildPoints } from "./points.ts";

/** A DOT name, made safe to use as an id. Nothing more is owed to a typo (§3.1). */
const idOf = (name: string): T.NodeId => name.replace(/ /g, "_");

export class GraphvizAst implements T.Ast {
  private readonly written: T.Written;
  private anonymous = 0;
  /** `tail_head`, then `_2`, `_3` … so parallel edges keep separate ids (§3.1). */
  private readonly drawn = new Map<string, number>();

  constructor(dot: string) {
    this.written = {
      rankdir: "TB",
      scopes: new Map(),
      nesting: new Map(),
      members: new Map(),
      declarations: [],
      nodes: [],
      edges: [],
    };
    const root = (parse(dot) as any).children.find((child: any) => child.type === "Graph");
    this.walk(root, []);
    this.written.rankdir = (this.written.scopes.get("")?.get("rankdir") ?? "TB") as T.Rankdir;
  }

  model(): T.DiagramModel {
    return buildModel(this.written);
  }

  styles(): T.Style[] {
    return [...buildStyles(this.written)].flatMap(([selector, properties]) =>
      [...properties].map(([property, value]) => ({ selector, property, value, source: T.SOURCE.dot })),
    );
  }

  points(): T.PointGraph {
    return buildPoints(this.written);
  }

  // --- the walk -----------------------------------------------------------

  private walk(scope: any, at: T.Scope): void {
    for (const child of scope.children ?? []) {
      if (child.type === "Attribute") this.said(child, at);
      if (child.type === "AttributeList") this.declared(child, at);
      if (child.type === "Node") this.node(child, at);
      if (child.type === "Edge") this.edge(child, at);
      if (child.type === "Subgraph") this.subgraph(child, at);
    }
  }

  private subgraph(child: any, at: T.Scope): void {
    this.anonymous += 1;
    const name = idOf(child.id?.value ?? `subgraph_${this.anonymous}`);
    this.written.nesting.set(name, at);
    if (!this.written.scopes.has(name)) this.written.scopes.set(name, new Map());
    this.walk(child, [...at, name]);
  }

  /** `label = "Sources"` — the scope talking about itself. */
  private said(attr: any, at: T.Scope): void {
    const name = at.at(-1) ?? "";
    if (!this.written.scopes.has(name)) this.written.scopes.set(name, new Map());
    this.written.scopes.get(name)!.set(attr.key.value, attr.value.value);
  }

  /** `node [...]` — a default, kept at its branch instead of pushed onto leaves. */
  private declared(list: any, at: T.Scope): void {
    const about = String(list.kind).toLowerCase() as "node" | "edge" | "graph";
    this.written.declarations.push({ scope: at, about, attrs: attrsOf(list) });
  }

  private node(stmt: any, at: T.Scope): void {
    const id = idOf(stmt.id.value);
    this.join(id, at);
    const attrs = attrsOf(stmt);
    if (attrs.size > 0) this.written.nodes.push({ id, scope: at, attrs });
  }

  /** `a -> b -> c` is a chain; `{a b} -> {c d}` is a cross product. */
  private edge(stmt: any, at: T.Scope): void {
    const steps: T.NodeId[][] = stmt.targets.map((target: any) => refs(target));
    for (const step of steps) for (const id of step) this.join(id, at);
    for (let i = 0; i < steps.length - 1; i += 1) {
      for (const from of steps[i]!) {
        for (const to of steps[i + 1]!) {
          const id = this.edgeId(from, to);
          this.written.edges.push({ id, from, to, scope: at, attrs: attrsOf(stmt) });
        }
      }
    }
  }

  private edgeId(from: T.NodeId, to: T.NodeId): T.EdgeId {
    const nth = (this.drawn.get(`${from}>${to}`) ?? 0) + 1;
    this.drawn.set(`${from}>${to}`, nth);
    return nth === 1 ? `${from}_${to}` : `${from}_${to}_${nth}`;
  }

  /** Naming a node anywhere makes it a member of every scope it sits in. */
  private join(id: T.NodeId, at: T.Scope): void {
    if (!this.written.members.has(id)) this.written.members.set(id, new Set());
    for (const name of at) this.written.members.get(id)!.add(name);
  }
}

// --- reading the library's shapes, in one place ----------------------------

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
