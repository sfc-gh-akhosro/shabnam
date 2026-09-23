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

/** Four workbench tabs, in order. `styles` is a rows view, not text. */
export type TabId = "dot" | "styles" | "annotation" | "action";

/** The three text tabs. The styles tab is not text and is absent on purpose. */
export type TabText = Record<"dot" | "annotation" | "action", string>;

export type SetTab = (tab: keyof TabText, text: string) => void;

// ---------------------------------------------------------------------------
// style — one representation: selector → property → value
// ---------------------------------------------------------------------------

/** Insertion order is row order. */
export type StyleRules = Map<string, Map<string, string>>;

/** What a style JSON file holds: `{ selector: { property: value } }`. */
export type StyleFile = Record<string, Record<string, string>>;

export type StyleOrigin = "theme" | "derived" | "user";

export type StyleRow = {
  selector: string;
  property: string;
  value: string;
  origin: StyleOrigin;
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
  derived(model: DiagramModel): StyleRules;
  clusters(boxes: Box[], model: DiagramModel): string;
  shells(boxes: Box[], model: DiagramModel): string;
  connectors(boxes: Box[], model: DiagramModel): string;
}

export interface Stylist {
  /** Writes a user row, shadowing whatever theme or derived says. */
  addRule(selector: string, property: string, value: string): void;
  removeRule(selector: string, property: string): void;
  /** Replaces the derived layer, wholesale. */
  setDerived(rules: StyleRules): void;
  /** Drop emptied selectors, re-feed. */
  cleanup(): void;
  /** The tab: every layer, origin-tagged, in order. */
  rows(): StyleRow[];
  /** User rows → `user-style.json`. */
  save(): void;
  /** CSS text. Export HTML and Save PNG only. */
  serialize(): string;
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
  exportHtml(): Promise<string>;
  exportPng(): Promise<Blob>;
}

// ---------------------------------------------------------------------------
// registry shapes — live with the workers that consult them
// ---------------------------------------------------------------------------

export type ShapeHtml = Map<string, (node: Node) => string>;
export type ShellSvg = Map<string, string>;
export type AttrCss = Map<string, string>;
