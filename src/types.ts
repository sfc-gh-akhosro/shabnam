// Shabnam — data types and package interfaces. Architecture §10.

// ---------------------------------------------------------------------------
// types — data only
// ---------------------------------------------------------------------------

/** Graphviz `renderJSON` output. Opaque: Diagram.bag is the only reader. */
export type VizJson = unknown;

/** A node in our model. `id` is the sanitized DOT name. */
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

export type Point = {
  x: number;
  y: number;
};

export type Box = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * What the connector router needs that only the page knows (§3.4).
 *
 * Both are measured pixels, so they travel in from the workbench the way `Box[]`
 * does. A `diagram/` worker is pure: one that called `getComputedStyle` to decide
 * how to draw would be reading the page it exists to describe.
 *
 * `clearance` is how far a route prefers to stay off a node it does not belong to
 * — a preference with a floor, not a refusal. `radius` curves the snake's bends;
 * `0` is sharp ortho.
 */
export type ConnectorMetrics = {
  clearance: number;
  radius: number;
};

/** Four workbench tabs, in order. `styles` is a rows view, not text. */
export type TabId = "dot" | "styles" | "annotation" | "action";

/** The three text tabs. The styles tab is not text and is absent on purpose. */
export type TabText = Record<"dot" | "annotation" | "action", string>;

export type SetTab = (tab: keyof TabText, text: string) => void;

// ---------------------------------------------------------------------------
// style — one book: selector → property → (value, id, source)
// ---------------------------------------------------------------------------

/**
 * Who wrote an entry. Ordered, and that order is the whole access rule: a write
 * is refused when its source is lower than the one already sitting there, so a
 * redraw cannot take a row back off the user.
 */
export type Source = 0 | 1 | 2;

export const SOURCE = { theme: 0, dot: 1, user: 2 } as const satisfies Record<string, Source>;

/** `id` is a live-DOM thing: it ties a `.row`, a book entry and a declaration
 * together for as long as the page lives. It is never written to a file. */
export type Rule = {
  value: string;
  id: number;
  source: Source;
};

/** The book. The source of truth for style. Insertion order is row order. */
export type StyleRules = Map<string, Map<string, Rule>>;

/** A producer's output — the derived bag. No ids, no opinion about source. */
export type StyleBag = Map<string, Map<string, string>>;

/** What a style JSON file holds. One shape, sourced; the theme is all `0`. */
export type StyleFile = Record<string, Record<string, { value: string; source: Source }>>;

/**
 * What Save Styles writes: your rules, and the name of the theme they were laid
 * over. Only source 2 travels — a theme row is already in the theme file and a
 * derived row is rebuilt by the next redraw, so saving either would freeze a
 * copy of something that is supposed to be regenerated.
 */
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
   * already there; an accepted overwrite keeps that entry's id. Returns the id the
   * entry carries — minted on first sight, kept on overwrite — or `REFUSED`, so a
   * caller that has just created a rule can label its row with it at once. */
  addRule(selector: string, property: string, value: string, source: Source): number;
  removeRule(selector: string, property: string): void;
  /** Back to a blank book holding the theme. Load DOT, not Redraw. */
  reset(): void;
  /** Drop emptied selectors, re-feed. */
  cleanup(): void;
  /** The tab: the book, traversed and yielded in order. */
  rows(): StyleRow[];
  /** The book → `style-rules.json`. */
  save(): void;
}

export interface Workbench {
  redraw(): Promise<void>;
  inject(sink: string, text: string): void;
  measure(): Box[];
  place(boxes: Box[]): void;
}

export type PictureFormat = "svg" | "png";

/** What the export dialog decides. */
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
  /** The painted canvas as a standalone picture (§4.1), as the options ask. */
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
