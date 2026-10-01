// Connectors, one test per claim in `src/connectors/connectors-story.md`.
// Boxes are hand-written in LR (ranks 120 apart on x, `start` is y), and the
// radius is 0, so every `Q` in a `d` is one bend and the corners read straight
// back out of it.

import { expect, test } from "bun:test";
import { Connectors } from "../src/connectors/connectors.ts";
import type { ConnectorRules } from "../src/connectors/types.ts";
import type { Box, DiagramEdge } from "../src/types.ts";

const SHARP: ConnectorRules = { gap: 65, clear: 24, inset: 6, lane: 6, radius: 0 };

type Row = [id: string, rank: number, start: number, length: number];

const edge = ([from, to]: [string, string]): DiagramEdge => ({ id: `${from}_${to}`, from, to, classes: [], style: "" });

/** Every node 60 wide, ranks 120 apart. */
function draw(rows: Row[], links: [string, string][], rules = SHARP): string[] {
  const ranks = [...new Set(rows.map(([, rank]) => rank))].sort().map((r) => rows.filter(([, rank]) => rank === r).map(([id]) => id));
  const boxes = rows.map(([id, rank, start, length]): Box => ({ id, left: rank * 120, top: start, width: 60, height: length }));
  return new Connectors(rules).route(ranks, boxes, links.map(edge));
}

const bends = (d: string) => (d.match(/Q/g) ?? []).length;

/** The distinct corner points of a sharp `d`, as `[x, y]`. */
function corners(d: string): number[][] {
  const n = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const pts = n.flatMap((_, i) => (i % 2 ? [] : [[n[i]!, n[i + 1]!]]));
  return pts.filter((p, k) => !k || p[0] !== pts[k - 1]![0] || p[1] !== pts[k - 1]![1]);
}

test("adjacent ranks join face to face, with no bend", () => {
  const [d] = draw([["a", 0, 0, 40], ["b", 1, 0, 40]], [["a", "b"]]);
  expect(bends(d!)).toBe(0);
  expect(corners(d!)).toEqual([[60, 20], [120, 20]]);
});

test("a route crosses a middle rank through its pathway", () => {
  const rows: Row[] = [
    ["a0", 0, -200, 40], ["a", 0, 100, 40], ["a2", 0, 400, 40],
    ["m1", 1, 60, 120], ["m2", 1, 300, 40],
    ["b0", 2, -200, 40], ["b", 2, 220, 40], ["b2", 2, 400, 40],
  ];
  const [d] = draw(rows, [["a", "b"]]);
  expect(bends(d!)).toBe(2);
  // One jog in the first gutter, then straight across rank 1 inside its gap.
  const [, , [x, y], end] = corners(d!);
  expect(x).toBe(90);
  expect(y! > 204 && y! < 276).toBe(true);
  expect(end![1]).toBe(y!);
});

test("an open port saves bends when the middle rank blocks", () => {
  const [d] = draw([["a", 0, 0, 40], ["m", 1, 0, 40], ["b", 2, 0, 40]], [["a", "b"]]);
  // Out of a's open top, over m, into b's open top: one bend at each end.
  expect(bends(d!)).toBe(2);
  expect(corners(d!).every(([, y]) => y! <= 0)).toBe(true);
});

test("in-rank neighbours join straight inside the rank", () => {
  const [d] = draw([["a", 0, 0, 40], ["b", 0, 100, 40]], [["a", "b"]]);
  expect(corners(d!)).toEqual([[30, 40], [30, 100]]);
});

test("crossing runs slide apart instead of taking a lane", () => {
  const rows: Row[] = [["geap", 0, 65, 80], ["bq", 0, 210, 80], ["gcs", 0, 355, 25], ["runtime", 1, 105, 25], ["horizon", 1, 195, 60], ["below", 1, 400, 40]];
  // `below` keeps horizon off its rank's open bottom, so both runs turn in the gutter.
  const [up, down] = draw(rows, [["gcs", "horizon"], ["bq", "runtime"]]);
  const jog = (d: string) => corners(d).filter(([x]) => x === 90);
  // Both run in the one gutter, at its middle, and their stretches do not meet.
  expect(jog(up!).length).toBe(2);
  expect(jog(down!).length).toBe(2);
  expect(Math.min(...jog(up!).map(([, y]) => y!))).toBeGreaterThanOrEqual(Math.max(...jog(down!).map(([, y]) => y!)));
});

test("a gutter lanes only runs whose two ends both differ", () => {
  const rows: Row[] = [["a", 0, 0, 40], ["b", 0, 100, 40], ["d", 1, 50, 40], ["c", 1, 150, 40]];
  const gutterX = (d: string) => corners(d).map(([x]) => x!).filter((x) => x > 60 && x < 120);
  const [ad, ac] = draw(rows, [["a", "d"], ["a", "c"]]);
  expect(new Set([...gutterX(ad!), ...gutterX(ac!)]).size).toBe(1);
  // a→c runs down past b→d running up, and the two share no end.
  const [ac2, bd] = draw(rows, [["a", "c"], ["b", "d"]]);
  expect(gutterX(ac2!)[0]).not.toBe(gutterX(bd!)[0]);
});

test("with no clear pathway it throws: there is no fallback", () => {
  const rows: Row[] = [
    ["a0", 0, -500, 40], ["a", 0, 100, 40], ["a2", 0, 900, 40],
    ["wall", 1, -1000, 2000],
    ["b0", 2, -500, 40], ["b", 2, 300, 40], ["b2", 2, 900, 40],
  ];
  expect(() => draw(rows, [["a", "b"]])).toThrow("no clear pathway from a to b");
});

// The lab fixture, as the browser measured it on the lab page (now in git
// history): 12 edges, 17 bends, in LR and in TD.
const EDGES: [string, string][] = [
  ["connectors", "gcp"], ["gcs", "horizon"], ["bq", "runtime"], ["horizon", "runtime"],
  ["horizon", "engine"], ["engine", "spcs"], ["engine", "ml"], ["engine", "connectors"],
  ["horizon", "analyst"], ["analyst", "agents"], ["agents", "ge"], ["geap", "agents"],
];
const LAB_BENDS = [1, 1, 2, 0, 2, 2, 2, 0, 2, 2, 0, 3];

type Measured = [id: string, left: number, top: number, width: number, height: number][][];

const LR: Measured = [
  [["geap", 65, 65, 48, 80], ["bq", 65, 210, 48, 80], ["gcs", 65, 355, 48, 25]],
  [["runtime", 178, 105, 64, 25], ["horizon", 178, 195, 64, 60]],
  [["analyst", 307, 65, 86, 80], ["engine", 307, 210, 86, 25], ["connectors", 307, 300, 86, 25]],
  [["agents", 459, 65, 59, 25], ["ge", 459, 155, 59, 25], ["spcs", 459, 245, 59, 80], ["ml", 459, 390, 59, 25], ["gcp", 459, 480, 59, 25]],
];
const TD: Measured = [
  [["geap", 65, 65, 88, 25], ["bq", 218, 65, 88, 25], ["gcs", 371, 65, 40, 25]],
  [["runtime", 105, 155, 64, 25], ["horizon", 234, 155, 68, 25]],
  [["analyst", 65, 245, 88, 25], ["engine", 218, 245, 59, 25], ["connectors", 342, 245, 86, 25]],
  [["agents", 65, 335, 59, 25], ["ge", 189, 335, 33, 25], ["spcs", 287, 335, 88, 25], ["ml", 440, 335, 32, 25], ["gcp", 538, 335, 41, 25]],
];

for (const [name, measured] of [["LR", LR], ["TD", TD]] as const) {
  test(`the lab fixture keeps its bends per edge in ${name}`, () => {
    const ranks = measured.map((rank) => rank.map(([id]) => id));
    const boxes = measured.flat().map(([id, left, top, width, height]): Box => ({ id, left, top, width, height }));
    // The lab's numbers: gap 5em and clear 2em, at 13px.
    const connectors = new Connectors({ ...SHARP, gap: 65, clear: 26 });
    expect(connectors.route(ranks, boxes, EDGES.map(edge)).map(bends)).toEqual(LAB_BENDS);
  });
}
