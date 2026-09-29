// Layout is Graphviz on the reader's points (§2). These are the claims the swap
// from dagre rests on: the trimmed tree ranks and orders exactly like the DOT
// as written, `rank=` in every form is held, and nothing layout reads is lost.
//
// Nothing here asserts a coordinate. 0×0 points have no meaningful x/y beyond
// which rank they share, and CSS owns the real size.

import { expect, test } from "bun:test";
import { DotReader } from "../src/read/dot-reader.ts";
import { GraphvizLayout } from "../src/layout/graphviz-layout.ts";
import type { DiagramModel, Ranks } from "../src/types.ts";

const layout = await GraphvizLayout.load();

const dotOf = (name: string): Promise<string> =>
  Bun.file(new URL(`../research-lab/${name}.dot`, import.meta.url)).text();

const ranksOf = (dot: string): Ranks => layout.layout(new DotReader(dot).points());

const rankOf = (ranks: Ranks, id: string): number => ranks.findIndex((rank) => rank.includes(id));

/** Pairs of edges between the same two ranks whose ends swap order. */
function crossings(ranks: Ranks, model: DiagramModel): number {
  const at = (id: string) => ({ rank: rankOf(ranks, id), order: ranks[rankOf(ranks, id)]!.indexOf(id) });
  const spans = model.edges
    .map(({ from, to }) => [at(from), at(to)] as const)
    .filter(([a, b]) => a.rank !== b.rank)
    .map(([a, b]) => (a.rank < b.rank ? [a, b] : [b, a]));
  let count = 0;
  for (const [i, [a, b]] of spans.entries()) {
    for (const [c, d] of spans.slice(i + 1)) {
      if (a!.rank === c!.rank && b!.rank === d!.rank && (a!.order - c!.order) * (b!.order - d!.order) < 0) count++;
    }
  }
  return count;
}

for (const name of ["example-1", "example-2"]) {
  test(`${name}: the points rank and order exactly like the DOT as written`, async () => {
    const dot = await dotOf(name);
    // `layout` takes any DOT; given the author's own, it is Graphviz's answer
    // with real sizes — the reference the trimmed points must match.
    expect(ranksOf(dot)).toEqual(layout.layout(dot));
  });

  test(`${name}: every node is placed once, with no crossing`, async () => {
    const reader = new DotReader(await dotOf(name));
    const ranks = layout.layout(reader.points());
    expect(ranks.flat().sort()).toEqual([...reader.model().nodes.keys()].sort());
    expect(crossings(ranks, reader.model())).toBe(0);
  });
}

test("example-2: `agents` and `ge` are neighbours in one rank", async () => {
  const ranks = ranksOf(await dotOf("example-2"));
  const rank = ranks[rankOf(ranks, "agents")]!;
  expect(Math.abs(rank.indexOf("agents") - rank.indexOf("ge"))).toBe(1);
});

test("`rank=same` beats the edge that would separate the group", () => {
  const ranks = ranksOf("digraph { a -> b ; subgraph { rank=same ; a ; b } }");
  expect(rankOf(ranks, "a")).toBe(rankOf(ranks, "b"));
});

test("`rank=max` and `rank=sink` land on the last rank", () => {
  for (const say of ["max", "sink"]) {
    const ranks = ranksOf(`digraph { a -> b -> c ; a -> d ; { rank=${say} ; d } }`);
    expect(rankOf(ranks, "d")).toBe(ranks.length - 1);
  }
});

test("`rank=source` lands alone on the first rank", () => {
  const ranks = ranksOf("digraph { a -> b ; c -> b ; { rank=source ; c } }");
  expect(ranks[0]).toEqual(["c"]);
});

test("`minlen` survives the trim", () => {
  // Ranks with nobody on them are not kept, so `c` is what shows the gap.
  expect(ranksOf("digraph { a -> b ; a -> c }")).toEqual([["a"], ["b", "c"]]);
  expect(ranksOf("digraph { a -> b [minlen=2] ; a -> c }")).toEqual([["a"], ["c"], ["b"]]);
});

test("an invisible edge still holds ranks apart", () => {
  const ranks = ranksOf("digraph { a ; b ; a -> b [style=invis] }");
  expect(rankOf(ranks, "b")).toBe(rankOf(ranks, "a") + 1);
});

test("an arrow separates two nodes that did not ask to share a rank", () => {
  expect(ranksOf("digraph { a -> b -> c }")).toEqual([["a"], ["b"], ["c"]]);
});

test("a lone node with no edge at all is still placed", () => {
  expect(ranksOf("digraph { only }")).toEqual([["only"]]);
});

test("`rankdir` turns the axis, and rank 0 is always where arrows start", () => {
  for (const rankdir of ["TB", "BT", "LR", "RL"]) {
    const ranks = ranksOf(`digraph { rankdir=${rankdir} ; a -> c ; b -> c }`);
    expect(ranks.length).toBe(2);
    expect([...ranks[0]!].sort()).toEqual(["a", "b"]);
    expect(ranks[1]).toEqual(["c"]);
  }
});

test("`positions` answers a point for every node, keyed by id", () => {
  const positions = layout.positions(new DotReader('digraph { "a b" -> c }').points());
  expect([...positions.keys()].sort()).toEqual(["a_b", "c"]);
});
