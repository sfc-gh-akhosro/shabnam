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

/** Five workbench editors, tab order: dot · theme · style · annotation · action. */
export type TabId = "dot" | "theme" | "style" | "annotation" | "action";

export type TabText = Record<TabId, string>;

export type SetTab = (tab: TabId, text: string) => void;

// ---------------------------------------------------------------------------
// interfaces — methods only. Packages implement these, not every file.
// ---------------------------------------------------------------------------

export interface Vizer {
  render(dot: string): Promise<VizJson>;
}

export interface Diagram {
  bag(json: VizJson): DiagramModel;
  frame(model: DiagramModel): string;
  derived(model: DiagramModel): string;
  clusters(boxes: Box[], model: DiagramModel): string;
  shells(boxes: Box[], model: DiagramModel): string;
  connectors(boxes: Box[], model: DiagramModel): string;
}

export interface Css {
  plus(style: string, derived: string): string;
  minus(style: string, take: string): string;
  expand(css: string, theme: string): string;
}

export interface Workbench {
  redraw(): Promise<void>;
  inject(sink: string, text: string): void;
  measure(): Box[];
  place(boxes: Box[]): void;
}

export interface Files {
  loadDot(text: string): void;
  saveDot(): string;
  listThemes(): string[];
  loadTheme(name: string): string;
  saveTheme(name: string, css: string): void;
  exportHtml(): Promise<string>;
  exportPng(): Promise<Blob>;
}

// ---------------------------------------------------------------------------
// registry shapes — live with the workers that consult them
// ---------------------------------------------------------------------------

export type ShapeHtml = Map<string, (node: Node) => string>;
export type ShellSvg = Map<string, string>;
export type AttrCss = Map<string, string>;
