// research-lab/ast/types.ts — the shapes, and nothing else.
//
// Derived from `readme.md`. `type` is data, `interface` is methods, a `Map` is an
// enum. Atomic types get names: `NodeId[][]` says what it is, `string[][]` needs
// a reference open beside it.
//
// Implemented by:
//   Ast    → class GraphvizAst   (graphviz-ast.ts)   walls off ts-graphviz
//   Layout → class DagreLayout   (dagre-layout.ts)   walls off @dagrejs/dagre

// ---------------------------------------------------------------------------
// names
// ---------------------------------------------------------------------------

/** A DOT node name, spaces turned to underscores. Also the HTML id. */
export type NodeId = string;
/** `tail_head`. */
export type EdgeId = string;
/** `cluster_a` — the name the DOT wrote, and the CSS class. Never stripped. */
export type SubgraphName = string;

/** `.cluster_a.node, .cluster_a.record` — composed flat, never nested. */
export type Selector = string;
export type Property = string;
/** Verbatim as the author typed it. `height=0` stays `"0"`. */
export type CssValue = string;

export type DotAttr = string;
export type DotValue = string;

/** Rough pixels from layout, not a measurement of anything painted. */
export type Px = number;

export type Rankdir = "TB" | "BT" | "LR" | "RL";

// ---------------------------------------------------------------------------
// output 1 — the semantics
// ---------------------------------------------------------------------------

export type DiagramNode = {
  id: NodeId;
  /** Every subgraph it is named inside, outermost first. */
  classes: SubgraphName[];
  /** Markup, resolved down from the branches above it. Innermost wins. */
  shape: string;
  label: string;
  icon: string;
  caption: string;
};

export type DiagramEdge = {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  classes: SubgraphName[];
};

export type DiagramCluster = {
  name: SubgraphName;
  label: string;
  isInvis: boolean;
  nodes: NodeId[];
  clusters: SubgraphName[];
};

export type DiagramModel = {
  rankdir: Rankdir;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  clusters: DiagramCluster[];
};

// ---------------------------------------------------------------------------
// output 2 — what the author said about looks
// ---------------------------------------------------------------------------

/** selector → property → value. The selector *is* the branch it was written on. */
export type DotStyles = Map<Selector, Map<Property, CssValue>>;

// ---------------------------------------------------------------------------
// output 3 — where things sit
// ---------------------------------------------------------------------------

/** What layout is given: no styles, no sizes, no weights. */
export type PointGraph = {
  rankdir: Rankdir;
  nodes: NodeId[];
  arrows: Arrow[];
  /** Each group must land on one rank. */
  sameRank: NodeId[][];
  boxes: Map<SubgraphName, NodeId[]>;
};

export type Arrow = { from: NodeId; to: NodeId };

export type Placement = {
  /** Integer, straight from layout — not bucketed from a coordinate. */
  rank: number;
  /** Integer, within the rank. */
  order: number;
  x: Px;
  y: Px;
};

/** Keyed by id, because every caller asks "where is this one?" */
export type Positions = Map<NodeId, Placement>;

// ---------------------------------------------------------------------------
// the walk's record — what was written, and where
// ---------------------------------------------------------------------------

/**
 * A scope is a list of enclosing subgraph names, outermost first. `[]` is the
 * root graph. This is the provenance the whole design rests on.
 */
export type Scope = SubgraphName[];

/** `node [...]` / `edge [...]` / `graph [...]`, kept at its branch. */
export type Declaration = {
  scope: Scope;
  about: "node" | "edge" | "graph";
  attrs: Map<DotAttr, DotValue>;
};

/** A node or edge statement that carried attributes of its own. */
export type Stated = {
  id: string;
  scope: Scope;
  attrs: Map<DotAttr, DotValue>;
};

export type EdgeStated = Stated & { from: NodeId; to: NodeId };

/**
 * Everything one walk of the tree recorded. The three answers are each a pure
 * reading of this — which is why they can disagree about resolution.
 */
export type Written = {
  rankdir: Rankdir;
  /** What each subgraph said about itself: `label`, `rank`, `style`. */
  scopes: Map<SubgraphName, Map<DotAttr, DotValue>>;
  /** Where each subgraph sits, so nesting can be recovered. */
  nesting: Map<SubgraphName, Scope>;
  /** Cumulative: a node named in two subgraphs belongs to both. */
  members: Map<NodeId, Set<SubgraphName>>;
  declarations: Declaration[];
  nodes: Stated[];
  edges: EdgeStated[];
};

// ---------------------------------------------------------------------------
// the two walls
// ---------------------------------------------------------------------------

export interface Ast {
  model(): DiagramModel;
  styles(): DotStyles;
  points(): PointGraph;
}

export interface Layout {
  place(graph: PointGraph): Positions;
}

// ---------------------------------------------------------------------------
// registries
// ---------------------------------------------------------------------------

/** DOT attribute → CSS property. Absent means it is not appearance. */
export const ATTR_CSS: Map<DotAttr, Property> = new Map([
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

/** The attributes that decide markup, and so belong to the model. */
export const ATTR_MARKUP = ["shape", "label", "icon", "caption"] as const;
