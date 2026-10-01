// Connectors — the public contract. The why is `connectors-story.md`.

import type { Box, DiagramEdge, Ranks } from "../types.ts";

export interface BoxConnectors {
  /** One path `d` per edge, in order. */
  route(ranks: Ranks, boxes: Box[], edges: DiagramEdge[]): string[];
}

/** The lab's numbers, in px, each its own: `gap` (outer gutters, open-port
 *  corridor), `clear` (grows nodes), `inset` (marker room at a face), `lane`
 *  (parts colliding gutter runs), `radius` (rounds bends). */
export type ConnectorRules = { gap: number; clear: number; inset: number; lane: number; radius: number };
