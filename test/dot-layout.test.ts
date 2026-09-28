// Layout answers with integers (§3.3). That is the point of the swap: ranks
// arrive as `0…n` and `order` is already correct, so `LayoutFramer` becomes a
// group-and-emit and the old bucketing — a `rankdir` axis map and a 2-point
// tolerance over coordinates — has nothing left to recover.
//
// Nothing here asserts a coordinate. `x` / `y` are rough on purpose and CSS owns
// real size, so a test that chased them would be testing dagre, not us.

import { expect, test } from "bun:test";
import { GraphvizAst } from "../src/dot/graphviz-ast.ts";
import { DagreLayout } from "../src/dot/dagre-layout.ts";
import type { PointGraph, Positions } from "../src/types.ts";

const points = async (name: string): Promise<PointGraph> =>
  new GraphvizAst(
    await Bun.file(new URL(`../research-lab/${name}.dot`, import.meta.url)).text(),
  ).points();

const layout = new DagreLayout();
const one = layout.place(await points("example-1"));
const two = layout.place(await points("example-2"));

const ranksOf = (placed: Positions): number[] =>
  [...new Set([...placed.values()].map((one) => one.rank))].sort((a, b) => a - b);

const rows = (placed: Positions): Map<number, number[]> => {
  const grouped = new Map<number, number[]>();
  for (const one of placed.values()) {
    grouped.set(one.rank, [...(grouped.get(one.rank) ?? []), one.order].sort((a, b) => a - b));
  }
  return grouped;
};

test("every node is placed, and placement is keyed by id", () => {
  expect(one.size).toBe(13);
  expect(two.size).toBe(17);
  expect(one.get("lake")).toBeDefined();
});

test("ranks are compacted to `0…n`, contiguous, with no gap to bridge", () => {
  for (const placed of [one, two]) {
    const ranks = ranksOf(placed);
    expect(ranks[0]).toBe(0);
    expect(ranks).toEqual(ranks.map((_, at) => at));
  }
});

test("`order` is consecutive inside a rank, so framing never sorts", () => {
  for (const placed of [one, two]) {
    for (const orders of rows(placed).values()) {
      expect(orders).toEqual(orders.map((_, at) => at));
    }
  }
});

test("a rank is an integer, not a coordinate we bucketed", () => {
  for (const one of two.values()) {
    expect(Number.isInteger(one.rank)).toBe(true);
    expect(Number.isInteger(one.order)).toBe(true);
  }
});

test("`rank=same` is held: every member of a group lands on one rank", async () => {
  // The thing dagre cannot express, served by contracting each group into a
  // stand-in and expanding it again (§2).
  const graph = await points("example-2");
  for (const group of graph.sameRank) {
    const ranks = new Set(group.map((id) => two.get(id)!.rank));
    expect(ranks.size).toBe(1);
  }
});

test("a contracted group still spreads, so its members do not sit on one point", async () => {
  const graph = await points("example-2");
  const group = graph.sameRank[0]!;
  const spread = new Set(group.map((id) => two.get(id)!.y));
  expect(spread.size).toBe(group.length);
});

test("`rank=same` beats the edges that would otherwise separate the group", () => {
  // `a -> b` normally puts `b` a rank later; asking for one rank wins.
  const placed = layout.place(
    new GraphvizAst("digraph { a -> b ; subgraph { rank=same ; a ; b } }").points(),
  );
  expect(placed.get("a")!.rank).toBe(placed.get("b")!.rank);
});

test("an arrow still separates two nodes that did not ask to share a rank", () => {
  const placed = layout.place(new GraphvizAst("digraph { a -> b -> c }").points());
  expect([placed.get("a")!.rank, placed.get("b")!.rank, placed.get("c")!.rank]).toEqual([0, 1, 2]);
});

test("a lone node with no edge at all is still placed", () => {
  const placed = layout.place(new GraphvizAst("digraph { only }").points());
  expect(placed.get("only")).toEqual({ rank: 0, order: 0, x: 0, y: 0 });
});

test("`rankdir` decides which axis orders a rank", () => {
  // LR ranks run down a column, TB across a row — so `order` is read off the
  // cross axis, and which axis that is comes from the DOT.
  const across = layout.place(
    new GraphvizAst("digraph { rankdir=LR ; a -> c ; b -> c }").points(),
  );
  const down = layout.place(new GraphvizAst("digraph { rankdir=TB ; a -> c ; b -> c }").points());
  expect(new Set([across.get("a")!.rank, across.get("b")!.rank]).size).toBe(1);
  expect(new Set([down.get("a")!.rank, down.get("b")!.rank]).size).toBe(1);
  expect([across.get("a")!.order, across.get("b")!.order].sort()).toEqual([0, 1]);
  expect([down.get("a")!.order, down.get("b")!.order].sort()).toEqual([0, 1]);
});
