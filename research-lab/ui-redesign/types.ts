// Shabnam — the story's types, sketched. Target shape for `src/types.ts`.
//
// Only what `design-story.md` names. Row columns, event details and the
// read/layout/paint intermediates stay in the files that use them; the ones
// named here are the current `src/types.ts` shapes, imported, not redrawn.

import type { Box, DiagramModel, PointGraph, Positions, Property, Selector } from "../../src/types.ts";
import type { Topic } from "./ui/types.ts";

export type { Topic };

export type TabId = "dot" | "styles" | "notes" | "script";
export type Command = "draw" | "open" | "save" | "export-picture" | "export-html" | "save-styles";

/** Where a style came from. A higher source is never overwritten by a lower. */
export type Source = 0 | 1 | 2; // theme · dot · user
export type Style = { selector: Selector; property: Property; value: string; source: Source };

/** A pinned note: a real selector, an offset, a class for the mark, markdown. */
export type Note = { selector: Selector; dx: string; dy: string; class: string; text: string };

export type Html = string;
export type SvgLayers = { clusters: string; shells: string; connectors: string };

/** The living state: what you wrote, and how to draw it. */
export interface Diagram {
  readonly dot: Topic<string>;
  readonly styleBook: StyleBook;
  readonly notes: Topic<Note[]>;
  readonly script: Topic<string>;
  draw(): Promise<void>;
  place(): void; // re-anchor notes, no draw
}

export interface StyleBook {
  add(style: Style): boolean; // false: CSSOM refused it, or a higher source owns it
  remove(style: Style): void;
  styles(): Style[]; // what the styles tab shows
  readonly changed: Topic<number>;
}

export interface DotReader { model(): DiagramModel; styles(): Style[]; graph(): PointGraph }
export interface DagreLayout { place(graph: PointGraph): Positions }
export interface DiagramPainter { frame(m: DiagramModel, p: Positions): Html; svg(m: DiagramModel, b: Box[]): SvgLayers }
