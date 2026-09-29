// Shabnam — data types and package interfaces.
//
// `type` is data, `interface` is methods, a `Map` is an enum. The reasoning for
// every shape here lives in `app-architecture.md`; this file carries only what a
// signature cannot say on its own.

// ---------------------------------------------------------------------------
// names — every atomic type gets one. `NodeId[][]` reads on its own.
// ---------------------------------------------------------------------------

/** A DOT node name, spaces turned to underscores. Also the HTML id. */
export type NodeId = string;
/** `tail_head`, then `_2`, `_3` … for parallel edges. */
export type EdgeId = string;
/** `cluster_a` — the name the DOT wrote, and the CSS class. Never stripped. */
export type SubgraphName = string;

/** `.cluster_a.node, .cluster_a.record` — composed flat, never nested. */
export type Selector = string;
export type Property = string;
/** As the author typed it, but for a bare number, which gains `px` (§3.2). */
export type CssValue = string;

export type DotAttr = string;
export type DotValue = string;

/** Rough pixels from layout, not a measurement of anything painted. */
export type Px = number;

export type Rankdir = "TB" | "BT" | "LR" | "RL";

// ---------------------------------------------------------------------------
// the reader's answer 1 — the semantics. No coordinates (§3.1).
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
  shell: string;
  /** `style="invis,filled"` as written. Words become classes at the HTML. */
  style: string;
};

export type DiagramEdge = {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  classes: SubgraphName[];
  style: string;
};

export type DiagramCluster = {
  name: SubgraphName;
  label: string;
  isInvis: boolean;
  nodes: NodeId[];
  clusters: SubgraphName[];
};

/** `nodes` is keyed because every consumer asks for one by id; insertion order
 *  is DOT order, so iterating `.values()` still reads the diagram as written. */
export type DiagramModel = {
  rankdir: Rankdir;
  nodes: Map<NodeId, DiagramNode>;
  edges: DiagramEdge[];
  clusters: DiagramCluster[];
};

// ---------------------------------------------------------------------------
// answer 2 — appearance, at the branch it was written on (§3.2)
// ---------------------------------------------------------------------------

/** selector → property → value. The selector *is* the branch. */
export type DotStyles = Map<Selector, Map<Property, CssValue>>;

// ---------------------------------------------------------------------------
// answer 3 — what layout is given, and what it answers
// ---------------------------------------------------------------------------

/** No styles, no sizes, no weights — plus the two facts that are layout's. */
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
// the walk's record — what was written, and where (§2)
// ---------------------------------------------------------------------------

/**
 * A list of enclosing subgraph names, outermost first; `[]` is the root graph.
 * This is the provenance the whole design rests on.
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
 * Everything one walk recorded. The three answers are each a pure reading of
 * this, which is why they can disagree about resolution.
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
// types — data only
// ---------------------------------------------------------------------------

export type Point = { x: number; y: number };

/** Measured, after paint. The single source of truth for size and position —
 *  which is why the model carries no Graphviz `width` / `height` (§3.4). */
export type Box = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * What the router needs that only the page knows (§3.4). Measured pixels, so
 * they travel in from the workbench the way `Box[]` does: a `paint/` worker
 * that called `getComputedStyle` would be reading the page it exists to
 * describe. `clearance` is a preference with a floor; `radius` `0` is sharp.
 */
export type ConnectorMetrics = {
  clearance: number;
  radius: number;
};

/** Four tabs, in order. `styles` and `annotation` are rows views, not text. */
export type TabId = "dot" | "styles" | "annotation" | "action";

/** The two text tabs. The two rows tabs are absent on purpose (§4). */
export type TabText = Record<"dot" | "action", string>;

export type SetTab = (tab: keyof TabText, text: string) => void;

/**
 * One annotation, as its row holds it — and the row is the model (§4.2). An
 * **ordered list**, not a map keyed by selector: two marks may point at the
 * same node, and the second is not an overwrite.
 *
 * `selector` goes to `querySelectorAll`. `dx` / `dy` are any CSS length, spent
 * by the theme inside `calc()` and never parsed here. `text` is markdown.
 */
export type Annotation = {
  id: number;
  selector: string;
  dx: string;
  dy: string;
  class: string;
  text: string;
};

// ---------------------------------------------------------------------------
// style — one line each: selector's property = value, and who wrote it
// ---------------------------------------------------------------------------

/** Who wrote a style: theme · DOT · you. The order *is* the access rule. */
export type Source = 0 | 1 | 2;

export const SOURCE = { theme: 0, dot: 1, user: 2 } as const satisfies Record<string, Source>;

/** One style rule. Found by selector + property, as CSSOM finds it. */
export type Style = { selector: Selector; property: Property; value: CssValue; source: Source };

/** What a style JSON holds. One shape, sourced; the theme is all `0`. */
export type StyleFile = Record<string, Record<string, { value: string; source: Source }>>;

/** What Save Styles writes: your rules, and the theme they were laid over.
 *  Only source `2` travels (§4.4). */
export type StyleDocument = { theme: string; style: StyleFile };

/** A typed value you subscribe to. A fact, never a verb. */
export interface Topic<T> {
  readonly value: T;
  pub(v: T): void;
  sub(fn: (v: T) => void): void;
}

// ---------------------------------------------------------------------------
// interfaces — methods only. Packages implement these, not every file.
// ---------------------------------------------------------------------------

/**
 * The DOT reader. One walk, three answers, and the parsed tree escapes nowhere.
 * One implementation: the `DotReader` class, which is the only thing that reads DOT.
 */
export interface DotReader {
  model(): DiagramModel;
  /** The DOT's appearance, each stamped source 1. */
  styles(): Style[];
  graph(): PointGraph;
}

/**
 * The only source of geometry. One implementation: `DagreLayout`. `rank=same`
 * is served by contraction inside it, which no type above it knows about.
 */
export interface Layout {
  place(graph: PointGraph): Positions;
}

export interface DiagramPainter {
  frame(model: DiagramModel, positions: Positions): string;
  clusters(boxes: Box[], model: DiagramModel): string;
  shells(boxes: Box[], model: DiagramModel): string;
  connectors(boxes: Box[], model: DiagramModel, metrics: ConnectorMetrics): string;
}

export interface StyleBook {
  /** The only way in. False: a higher source owns it, an `@apply` names a
   *  selector not in the book, or CSSOM refuses the value. */
  add(style: Style): boolean;
  remove(style: Style): void;
  /** What the styles tab shows, in order. */
  styles(): Style[];
  readonly changed: Topic<number>;
}

export interface Workbench {
  redraw(): Promise<void>;
  inject(sink: string, text: string): void;
  measure(): Box[];
  /** Rows → sink → `place()`. A short path: no parse, no frame, and no
   *  waiting for a paint, so it cannot interleave with the conductor (§5). */
  annotate(): void;
  /** Publish `--anchor-x` / `--anchor-y` onto every mark. CSS spends them. */
  place(): void;
}

export type PictureFormat = "svg" | "png";

export type PictureOptions = {
  format: PictureFormat;
  /** Drop the diagram's own background so the picture sits on nothing. */
  transparent: boolean;
  /** PNG only — an SVG carries no resolution to scale. */
  scale: number;
};

export interface Files {
  loadDot(text: string): void;
  saveDot(): string;
  exportHtml(): Promise<string>;
  /** The painted canvas as a standalone picture (§4.3), as the options ask. */
  exportPicture(options: PictureOptions): Promise<Blob>;
}

// ---------------------------------------------------------------------------
// registry shapes — live with the workers that consult them
// ---------------------------------------------------------------------------

export type ShapeHtml = Map<string, (node: DiagramNode) => string>;
/** shape → the node's type class. Absent means `.node` plus `data-shape`. */
export type ShapeClass = Map<string, string>;
export type ShellSvg = Map<string, string>;
/** DOT attribute → CSS property. Absent means it is not appearance. */
export type AttrCss = Map<DotAttr, Property>;
