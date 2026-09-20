// Shabnam — every `type` (data) and every `interface` (methods) in the app.
// Architecture §10. No implementations live here.

// ---------------------------------------------------------------------------
// types — data only
// ---------------------------------------------------------------------------

/** Graphviz `renderJSON` output. Opaque: DiagramBagger is the only reader. */
export type VizJson = unknown;

/** A node in our model. `id` is the sanitized DOT name (§3.1). */
export type Node = {
  id: string; // the DOT name, sanitized. also the HTML id
  classes: string[]; // subgraph names this node belongs to
  shape: string; // key into SHAPE_HTML, falls back to "box"
  shell: string; // key into SHELL_SVG, falls back to "box"
  icon: string; // filename in icon/, or ""
  label: string;
  caption: string; // caption=, falling back to label
  x: number; // from pos, for column grouping only
  y: number;
  attrs: Map<string, string>; // style keys CssBagger bags
};

export type Edge = {
  id: string; // `<from>_<to>`, suffixed _2, _3 … when parallel
  from: string; // node id
  to: string; // node id
  classes: string[];
  attrs: Map<string, string>;
};

export type Cluster = {
  name: string; // the DOT subgraph name — the CSS class, and the model's key
  label: string;
  isInvis: boolean; // style=invis — not drawn, still contributes a class
  nodes: string[]; // member node ids
  clusters: string[]; // nested cluster names
  attrs: Map<string, string>;
};

/** The one model. Everything downstream of DiagramBagger reads this. */
export type DiagramModel = {
  rankdir: string;
  nodes: Node[];
  edges: Edge[];
  clusters: Cluster[];
  attrs: Map<string, string>; // graph-level
};

/** Columns of nodes, bucketed from x/y within 2pt (§3.3). */
export type Layout = Node[][];

/** A point in the padding-box space of `#shabnam-canvas` — the one coordinate space
 *  both the SVG layer and the annotation layer work in. */
export type Point = {
  x: number;
  y: number;
};

/** Measured geometry — the single source of truth for size and position. */
export type Box = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

/** What a rebase did: the new effects text, and how many rules moved into it
 *  — reported in the status line, so a declaration CSSOM dropped is not silent. */
export type StyleRebase = {
  myStyle: string;
  moved: number;
};

/** The five workbench editors, in tab order (§4). */
export type TabId = "theme" | "dot" | "style" | "action" | "annotation";

/** Tab text, one entry per TabId. The workbench owns the only instance. */
export type TabText = Record<TabId, string>;

/** Write one tab. The workbench owns tab text; everyone else gets this. */
export type SetTab = (tab: TabId, text: string) => void;

// ---------------------------------------------------------------------------
// interfaces — methods only (Go / Rust traits). One class implements each.
// ---------------------------------------------------------------------------

export interface Vizer {
  render(dot: string): Promise<VizJson>;
}

export interface DiagramBagger {
  bag(json: VizJson): DiagramModel;
}

export interface CssBagger {
  bag(model: DiagramModel): string; // → derived.css
}

export interface LayoutFramer {
  columns(model: DiagramModel): Layout;
  frame(model: DiagramModel): string; // → #shabnam-main-html, SHAPE_HTML inside
}

export interface NodeSheller {
  shells(boxes: Box[], model: DiagramModel): string; // SHELL_SVG + icon/
  clusters(boxes: Box[], model: DiagramModel): string; // SVG bounding boxes around member nodes
}

export interface EdgeDrawer {
  draw(boxes: Box[], model: DiagramModel): string; // measured coords only
}

export interface Measurer {
  measure(): Box[]; // reads painted #shabnam-main-html
}

export interface Sinker {
  inject(sink: string, text: string): void;
}

export interface Annotator {
  place(boxes: Box[]): void; // positions `data-anchor` elements (§4)
}

export interface Themer {
  loadDot(dot: string): void; // → DOT, and resets the rebase baseline (§4)
  saveDot(): string; // ← DOT
  load(text: string): void; // → theme / effects
  save(): string; // ← effects
  // Whole app, standalone. Async because the chrome CSS and the bundle are
  // fetched from the running page rather than baked in at compile time.
  exportHtml(): Promise<string>;
  // The canvas, rasterized. Async because the browser decodes the serialized
  // SVG through an `Image` before it can be drawn.
  exportPng(): Promise<Blob>;
}

export interface StyleMerger {
  // Rebase and merge derived.css into effects.css (§4).
  rebase(derived: string, edited: string, effects: string): StyleRebase;
}

export interface Redrawer {
  redraw(dot: string): Promise<void>; // the sequence in §5
  discardEdits(): void; // forget pending edits — Load DOT starts afresh
}

// ---------------------------------------------------------------------------
// registry shapes — enum simulation. The registries themselves live with the
// workers that consult them (§8); only their types are declared here.
// ---------------------------------------------------------------------------

/** shape → node HTML. Unknown shape falls back to "box". */
export type ShapeHtml = Map<string, (node: Node) => string>;

/** shell → the markup of a file in svg/, imported as text. Unknown → "box". */
export type ShellSvg = Map<string, string>;

/** Graphviz attribute → CSS property (§3.2). Unmapped attrs are skipped. */
export type AttrCss = Map<string, string>;
