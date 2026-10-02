// Shabnam — the shared vocabulary and the players' interfaces.
//
// `type` is data, `interface` is methods, a `Map` is an enum. Only what crosses
// a player's wall lives here; a shape one player keeps to itself lives in that
// player's file. The reasoning is `app-architecture.md`.

// ---------------------------------------------------------------------------
// names — every atomic type gets one. `NodeId[][]` reads on its own.
// ---------------------------------------------------------------------------

/** A DOT node name, spaces turned to underscores. Also the HTML id. */
export type NodeId = string;
/** `tail_head`. Parallel edges share one. */
export type EdgeId = string;
/** `cluster_a` — the name the DOT wrote, and the CSS class. Never stripped. */
export type SubgraphName = string;

/** `.cluster_a.node, .cluster_a.record` — composed flat, never nested. */
export type Selector = string;
export type Property = string;
/** As the author typed it, but for a bare number, which gains `px` (§2). */
export type CssValue = string;

export type DotAttr = string;
export type DotValue = string;

export type Rankdir = "TB" | "BT" | "LR" | "RL";

// ---------------------------------------------------------------------------
// the parse — one DOT, three answers (§2)
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

/** Semantics, no coordinates. `nodes` is keyed because every consumer asks for
 *  one by id; insertion order is DOT order. */
export type DiagramModel = {
  rankdir: Rankdir;
  nodes: Map<NodeId, DiagramNode>;
  edges: DiagramEdge[];
  clusters: DiagramCluster[];
};

/** The author's DOT, parsed, trimmed of everything that gives a node size,
 *  every node a 0×0 point, printed. */
export type PointDot = string;

/** What one parse answers: who exists, how they look (source 1), what layout is given. */
export type Parsed = { model: DiagramModel; styles: Style[]; points: PointDot };

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------

export type Point = { x: number; y: number };

/** rank → order → node. `ranks[r][o]` is the o-th node of rank r. */
export type Ranks = NodeId[][];

/** Measured, after paint: the single source of size and position (§3.4). */
export type NodeBox = { id: NodeId; left: number; top: number; width: number; height: number };

/** One routed connector: the edge, and its outline. */
export type EdgePath = { edge: DiagramEdge; d: string };

/** The router's numbers, in px, each a CSS token on the canvas (§4): `gap`
 *  (outer gutters, open-port corridor), `clear` (grows nodes), `inset` (marker
 *  room at a face), `lane` (parts colliding gutter runs), `radius` (rounds bends). */
export type RouteRules = { gap: number; clear: number; inset: number; lane: number; radius: number };

/** One SVG string per group under `#diagram-svg`, named by its sink. */
export type SvgLayers = { clusters: string; shells: string; connectors: string };

// ---------------------------------------------------------------------------
// what you wrote
// ---------------------------------------------------------------------------

/**
 * One note, as its row holds it — and the row is the model (§6). An ordered
 * list, not a map keyed by selector: two marks may point at the same node.
 * `selector` goes to `querySelectorAll`; `dx` / `dy` are CSS lengths the theme
 * spends inside `calc()`; `text` is markdown.
 */
export type Note = { selector: string; dx: string; dy: string; class: string; text: string };

/** Everything a diagram is written as, but its styles. */
export type Sketch = { dot: string; notes: Note[]; script: string };

/** Who wrote a style: theme · DOT · you. The order *is* the access rule. */
export type Source = 0 | 1 | 2;
type SourceName = "theme" | "dot" | "user";

/** Source → its name, in access order. The style filter's labels. */
export const SOURCE: Map<Source, SourceName> = new Map([
  [0, "theme"],
  [1, "dot"],
  [2, "user"],
]);

/** One style rule. Found by selector + property, as CSSOM finds it. */
export type Style = { selector: Selector; property: Property; value: CssValue; source: Source };

/** Styles written down: `{ selector: { property: { value, source } } }`. */
export type StyleFile = Record<Selector, Record<Property, { value: CssValue; source: Source }>>;

/** What Save writes and Open reads. Only source `2` travels in `user-styles`. */
export type Project = { theme: string; dot: string; "user-styles": StyleFile };

/** What an exported page boots from: the sketch and the whole book. */
export type Seed = Sketch & { styles: StyleFile };

// ---------------------------------------------------------------------------
// verbs and views
// ---------------------------------------------------------------------------

/** Every verb. The toolbar's `data-action` and the chords share one map. */
export type Action = "draw" | "open" | "save" | "load-dot" | "export-picture" | "export-html";

/** Four tabs, in order. `styles` and `notes` are row views, not text. */
export type TabId = "dot" | "styles" | "notes" | "script";

export type PictureFormat = "svg" | "png";

export type PictureOptions = {
  format: PictureFormat;
  /** Drop the diagram's own background so the picture sits on nothing. */
  transparent: boolean;
  /** PNG only — an SVG carries no resolution to scale. */
  scale: number;
};

/** A typed value you subscribe to. A fact, never a verb. */
export interface Topic<T> {
  readonly value: T;
  pub(v: T): void;
  sub(fn: (v: T) => void): void;
}

/** A record of facts, each its own Topic. */
export type Topics<T> = { readonly [K in keyof T]: Topic<T[K]> };

// ---------------------------------------------------------------------------
// the players — one interface each, one class each (§1)
// ---------------------------------------------------------------------------

/** The only reader of DOT. The parse tree escapes nowhere. */
export interface Parser {
  /** Throws on malformed DOT; the caller holds the one catch. */
  parse(dot: string): Parsed;
}

/** The only source of geometry. Walls `@hpcc-js/wasm-graphviz`. */
export interface Layout {
  /** Where each 0×0 point landed. */
  positions(points: PointDot): Map<NodeId, Point>;
  /** `positions`, grouped by the rank axis and sorted along the other. */
  ranks(points: PointDot): Ranks;
}

/** Placement in, one outline per edge out. No DOM, no CSS. */
export interface Router {
  route(ranks: Ranks, boxes: NodeBox[], edges: DiagramEdge[], rules: RouteRules): EdgePath[];
}

/** The style book and the one live CSSOM sheet it paints. */
export interface Stylist {
  /** The only way in. False: a higher source owns it, an `@apply` names a
   *  selector not in the book, or CSSOM refuses the value. */
  add(style: Style): boolean;
  remove(style: Style): void;
  /** What the styles tab lists, in order. */
  styles(): Style[];
  /** The live sheet as CSS text, for the exports. */
  css(): string;
}

/** Owns `#diagram-canvas`: the only writer of the picture. */
export interface Painter {
  /** parse → styles → layout → frame → measure → route → SVG → notes → script. */
  draw(sketch: Sketch, stylist: Stylist): Promise<void>;
  frame(model: DiagramModel, ranks: Ranks): void;
  measure(): NodeBox[];
  drawSvg(layers: SvgLayers): void;
  /** The short path: no parse, no frame, no await. */
  annotate(notes: Note[]): void;
  /** The canvas as a standalone SVG, the given CSS inlined. */
  snapshot(css: string): string;
}

/** The side panel: tabs, their editors, hover and pin. Holds what you wrote. */
export interface Workbench {
  readonly sketch: Topics<Sketch>;
  readonly stylist: Stylist;
  readonly tab: Topic<TabId>;
  /** A new stylist from the theme plus `styles`, the tabs refilled, then a draw. */
  adopt(sketch: Sketch, styles: Style[]): Promise<void>;
  draw(): Promise<void>;
}

/** The nav bar: the verbs, their chords, files in and out. */
export interface Chrome {
  run(action: Action): Promise<void>;
}
