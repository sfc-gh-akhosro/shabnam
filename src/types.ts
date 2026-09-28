// Shabnam — data types and package interfaces.
//
// `type` is data, `interface` is methods, a `Map` is an enum. The reasoning for
// every shape here lives in `app-architecture.md`; this file carries only what a
// signature cannot say on its own.

// ---------------------------------------------------------------------------
// types — data only
// ---------------------------------------------------------------------------

/** Graphviz `renderJSON` output. Opaque: `Diagram.bag` is the only reader. */
export type VizJson = unknown;

/** `id` is the sanitized DOT name. `x` / `y` are numeric here, never a `pos`. */
export type Node = {
  id: string;
  classes: string[];
  shape: string;
  shell: string;
  icon: string;
  label: string;
  caption: string;
  x: number;
  y: number;
  attrs: Map<string, string>;
};

export type Edge = {
  id: string;
  from: string;
  to: string;
  classes: string[];
  attrs: Map<string, string>;
};

export type Cluster = {
  name: string;
  label: string;
  isInvis: boolean;
  nodes: string[];
  clusters: string[];
  attrs: Map<string, string>;
};

export type DiagramModel = {
  rankdir: string;
  nodes: Node[];
  edges: Edge[];
  clusters: Cluster[];
  attrs: Map<string, string>;
};

export type Layout = Node[][];

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
 * they travel in from the workbench the way `Box[]` does: a `diagram/` worker
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
// style — one book: selector → property → (value, id, source)
// ---------------------------------------------------------------------------

/** Who wrote an entry. The order *is* the access rule (§1.2). */
export type Source = 0 | 1 | 2;

export const SOURCE = { theme: 0, dot: 1, user: 2 } as const satisfies Record<string, Source>;

/** `id` ties a `.row`, a book entry and a declaration together for as long as
 *  the page lives. Live-DOM only: never written to a file. */
export type Rule = {
  value: string;
  id: number;
  source: Source;
};

/** The book. The source of truth for style. Insertion order is row order. */
export type StyleRules = Map<string, Map<string, Rule>>;

/** A producer's output. No ids, no opinion about source. */
export type StyleBag = Map<string, Map<string, string>>;

/** What a style JSON holds. One shape, sourced; the theme is all `0`. */
export type StyleFile = Record<string, Record<string, { value: string; source: Source }>>;

/** What Save Styles writes: your rules, and the theme they were laid over.
 *  Only source `2` travels (§4.4). */
export type StyleDocument = { theme: string; style: StyleFile };

export type StyleRow = {
  selector: string;
  property: string;
  value: string;
  id: number;
  source: Source;
};

// ---------------------------------------------------------------------------
// interfaces — methods only. Packages implement these, not every file.
// ---------------------------------------------------------------------------

export interface Vizer {
  render(dot: string): Promise<VizJson>;
}

export interface Diagram {
  bag(json: VizJson): DiagramModel;
  frame(model: DiagramModel): string;
  derived(model: DiagramModel): StyleBag;
  clusters(boxes: Box[], model: DiagramModel): string;
  shells(boxes: Box[], model: DiagramModel): string;
  connectors(boxes: Box[], model: DiagramModel, metrics: ConnectorMetrics): string;
}

export interface Stylist {
  /** The one door into the book. Refused when `source` is lower than the entry
   *  already there. Returns that entry's id — minted on first sight, kept on an
   *  accepted overwrite — or `REFUSED`, so a caller can label its row at once. */
  addRule(selector: string, property: string, value: string, source: Source): number;
  removeRule(selector: string, property: string): void;
  /** Back to a blank book holding the theme. Load DOT, not Redraw. */
  reset(): void;
  /** Drop emptied selectors, re-feed. */
  cleanup(): void;
  /** The tab: the book, in order. */
  rows(): StyleRow[];
  save(): void;
}

export interface Workbench {
  redraw(): Promise<void>;
  inject(sink: string, text: string): void;
  measure(): Box[];
  /** Rows → sink → `place()`. A short path: no viz, no bag, no frame, and no
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

export type ShapeHtml = Map<string, (node: Node) => string>;
/** shape → the node's type class. Absent means `.node` plus `data-shape`. */
export type ShapeClass = Map<string, string>;
export type ShellSvg = Map<string, string>;
export type AttrCss = Map<string, string>;
