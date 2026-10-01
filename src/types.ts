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

/**
 * The author's DOT, parsed, trimmed of everything that gives a node size, every
 * node a 0×0 point, printed. Whatever else `dot` reads passes through (§2).
 */
export type PointDot = string;

/** rank → order → node. `ranks[r][o]` is the o-th node of rank r. */
export type Ranks = NodeId[][];

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

/** Four tabs, in order. `styles` and `notes` are rows views, not text. */
export type TabId = "dot" | "styles" | "notes" | "script";

/** Every verb. The toolbar and the chords share one map of them. */
export type Command = "draw" | "open" | "save" | "load-dot" | "export-picture" | "export-html";

/**
 * One note, as its row holds it — and the row is the model (§4). An **ordered
 * list**, not a map keyed by selector: two marks may point at the same node,
 * and the second is not an overwrite.
 *
 * `selector` goes to `querySelectorAll`. `dx` / `dy` are any CSS length, spent
 * by the theme inside `calc()` and never parsed here. `text` is markdown.
 */
export type Note = {
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

export type SourceName = "theme" | "dot" | "user";

/** Source → its name, in access order. The style filter's labels. */
export const SOURCE: Map<Source, SourceName> = new Map([
  [0, "theme"],
  [1, "dot"],
  [2, "user"],
]);

/** One style rule. Found by selector + property, as CSSOM finds it. */
export type Style = { selector: Selector; property: Property; value: CssValue; source: Source };

/** What a style JSON holds. One shape, sourced; the theme is all `0`. */
export type StyleFile = Record<string, Record<string, { value: string; source: Source }>>;

/** Your rules, and the theme they were laid over — what a project carries.
 *  Only source `2` travels (§4.4). */
export type StyleDocument = { theme: string; style: StyleFile };

/** What Save writes and Open reads: the theme by name, the DOT as text, and
 *  your rules. Only source `2` travels in `user-styles`. */
export type Project = { theme: string; dot: string; "user-styles": StyleFile };

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
 * The DOT reader. One parse, three answers, and the parsed tree escapes nowhere.
 * One implementation: the `DotReader` class, which is the only thing that reads DOT.
 */
export interface DotReader {
  model(): DiagramModel;
  /** The DOT's appearance, each stamped source 1. */
  styles(): Style[];
  /** What layout is given. */
  points(): PointDot;
}

/**
 * The only source of geometry. One implementation: `GraphvizLayout`, which
 * walls `@hpcc-js/wasm-graphviz`.
 */
export interface GraphvizLayout {
  /** `dot` on the points, as it answers: where each 0×0 point landed. */
  positions(points: PointDot): Map<NodeId, Point>;
  /** `positions`, grouped by the rank axis and sorted along the other. */
  layout(points: PointDot): Ranks;
}

export interface DiagramPainter {
  frame(model: DiagramModel, ranks: Ranks): string;
  /** `ds[i]` is the connector outline of `model.edges[i]`. */
  svg(boxes: Box[], model: DiagramModel, ds: string[]): SvgLayers;
}

/** One SVG string per group under `#diagram-svg`, named by its sink. */
export type SvgLayers = { clusters: string; shells: string; connectors: string };

export interface StyleBook {
  /** The only way in. False: a higher source owns it, an `@apply` names a
   *  selector not in the book, or CSSOM refuses the value. */
  add(style: Style): boolean;
  remove(style: Style): void;
  /** What the styles tab shows, in order. */
  styles(): Style[];
}

/** The living state: what you wrote, and how it draws itself. */
export interface Diagram {
  readonly dot: Topic<string>;
  readonly styleBook: StyleBook;
  readonly notes: Topic<Note[]>;
  readonly script: Topic<string>;
  draw(): Promise<void>;
  /** Notes → sink → anchors. A short path: no parse, no frame, and no
   *  waiting for a paint, so it cannot interleave with a draw. */
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

// ---------------------------------------------------------------------------
// the pieces — native controls with a CSS face. None of them knows DOT exists.
// ---------------------------------------------------------------------------

/** The host already exists in the skeleton; the piece fills it and binds. */
export interface Piece {
  readonly el: HTMLElement;
}

export interface RowList<R> extends Piece {
  render(rows: R[]): void;
  mark(i: number, invalid: boolean): void;
}

export interface DialogAsk<A> extends Piece {
  /** `undefined` is cancelled. */
  ask(): Promise<A | undefined>;
}
// Radios and Checks add no methods: they read and write their Topic.

// ---------------------------------------------------------------------------
// registry shapes — live with the workers that consult them
// ---------------------------------------------------------------------------

export type ShapeHtml = Map<string, (node: DiagramNode) => string>;
/** shape → the node's type class. Absent means `.node` plus `data-shape`. */
export type ShapeClass = Map<string, string>;
export type ShellSvg = Map<string, string>;
/** DOT attribute → CSS property. Absent means it is not appearance. */
export type AttrCss = Map<DotAttr, Property>;
