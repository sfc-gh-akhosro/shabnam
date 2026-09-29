// One walk, three answers (§2, §3.1, §3.2). These are the claims the swap rests
// on: a selector is composed from the **branch** an attribute was written on,
// markup is resolved down onto the node while appearance is not, and membership
// is cumulative. The two example files are the fixtures, because a diagram that
// exercises the design is worth more than a diagram invented for a test.

import { expect, test } from "bun:test";
import { DotReader } from "../src/read/dot-reader.ts";
import { bag } from "./bag.ts";

const fixture = async (name: string) =>
  new DotReader(await Bun.file(new URL(`../research-lab/${name}.dot`, import.meta.url)).text());

const one = await fixture("example-1");
const two = await fixture("example-2");

// --- the model: identity, connection, membership ---------------------------

test("a node is keyed by its id, and the id is the DOT name", () => {
  expect(one.model().nodes.get("lake")!.id).toBe("lake");
  expect([...one.model().nodes.keys()]).toContain("blobs");
});

test("a subgraph keeps its DOT name, `cluster_` included", () => {
  expect(one.model().clusters.map((cluster) => cluster.name)).toEqual([
    "cluster_sources",
    "cluster_platform",
    "cluster_consumer",
  ]);
});

test("membership is cumulative — a node named in two subgraphs belongs to both", () => {
  // `bq` is listed inside the anonymous GCP group and again inside `cluster_a`.
  expect(two.model().nodes.get("bq")!.classes).toEqual(["subgraph_1", "cluster_a"]);
});

test("membership is textual, so a cluster written after its edges still collects", async () => {
  const late = await new DotReader(`digraph { a -> b; subgraph cluster_x { a } }`).model();
  expect(late.nodes.get("a")!.classes).toEqual(["cluster_x"]);
  expect(late.clusters[0]!.nodes).toEqual(["a"]);
});

test("an anonymous subgraph is numbered by appearance order", () => {
  // `%1` under the old reader; `.subgraph_1` here, and any saved style naming
  // the old form breaks — noted, and cheap while no verb loads a style file.
  expect(two.model().nodes.get("Provider_Services")!.classes).toEqual(["subgraph_2"]);
});

test("parallel edges are suffixed, so one id never names two edges", () => {
  const twice = new DotReader("digraph { a -> b; a -> b; a -> b }");
  expect(twice.model().edges.map((edge) => edge.id)).toEqual(["a_b", "a_b_2", "a_b_3"]);
});

test("`{a b} -> {c d}` is a cross product, and a chain is a chain", () => {
  const cross = new DotReader("digraph { {a b} -> {c d} }");
  expect(cross.model().edges.map((edge) => edge.id)).toEqual(["a_c", "a_d", "b_c", "b_d"]);

  const chain = new DotReader("digraph { a -> b -> c }");
  expect(chain.model().edges.map((edge) => edge.id)).toEqual(["a_b", "b_c"]);
});

test("an invisible cluster still says so, and still contributes its class", () => {
  const a = two.model().clusters.find((cluster) => cluster.name === "cluster_a")!;
  expect(a.isInvis).toBe(true);
  expect(a.nodes).toEqual(["bq", "geap", "gcs"]);
});

// --- markup is resolved ----------------------------------------------------

test("a node knows its own shape, pushed down from the branch above it", () => {
  // `node [shape=none]` sits on the anonymous subgraph, not on the node.
  expect(two.model().nodes.get("Provider_Services")!.shape).toBe("none");
  expect(two.model().nodes.get("gcs")!.shape).toBe("record");
});

test("innermost wins, and the node's own statement wins over every declaration", () => {
  const reader = new DotReader(`digraph {
    node [shape=box]
    subgraph cluster_a {
      node [shape=record]
      inner
      subgraph cluster_b { node [shape=ellipse] deeper }
      own [shape=diamond]
    }
    outer
  }`);
  const nodes = reader.model().nodes;
  expect(nodes.get("outer")!.shape).toBe("box");
  expect(nodes.get("inner")!.shape).toBe("record");
  expect(nodes.get("deeper")!.shape).toBe("ellipse");
  expect(nodes.get("own")!.shape).toBe("diamond");
});

test("a node that never named a label falls back to its id", () => {
  expect(new DotReader("digraph { core }").model().nodes.get("core")!.label).toBe("core");
});

test("`\\N` is the node's own name, and `\\n` is left for the line-break contract", () => {
  const reader = new DotReader(String.raw`digraph { core [label="\N \n tail"] }`);
  expect(reader.model().nodes.get("core")!.label).toBe(String.raw`core \n tail`);
});

test("`\\G` is the cluster's own name", () => {
  const reader = new DotReader(String.raw`digraph { subgraph cluster_x { label="\G" ; a } }`);
  expect(reader.model().clusters[0]!.label).toBe("cluster_x");
});

// --- appearance keeps its provenance --------------------------------------

test("a `node [...]` composes a flat selector from the branch it was written on", () => {
  // One rule naming the branch, not three `#id` rules and a guess at the default.
  expect(bag(two.styles()).get(".subgraph_1.node, .subgraph_1.record")).toEqual(
    new Map([["background-color", "#ddffdd"]]),
  );
});

test("the root names the canvas, an edge declaration is `.edge`, a subgraph is its class", () => {
  const reader = new DotReader(`digraph {
    bgcolor="white"
    edge [color="grey"]
    subgraph cluster_a { bgcolor="azure" ; node [fillcolor="coral"] ; a }
  }`);
  const styles = bag(reader.styles());
  // `#diagram-canvas`, not `:root`: `:root` is `<html>` on screen and the `<svg>`
  // after export, so one rule would paint two different things.
  expect(styles.get("#diagram-canvas")).toEqual(new Map([["background-color", "white"]]));
  expect(styles.get(".edge")).toEqual(new Map([["border-color", "grey"]]));
  expect(styles.get(".cluster_a")).toEqual(new Map([["background-color", "azure"]]));
  expect(styles.get(".cluster_a.node, .cluster_a.record")).toEqual(
    new Map([["background-color", "coral"]]),
  );
});

test("a bare graph attribute and a `graph [...]` produce the same rule", () => {
  const bare = bag(new DotReader(`digraph { bgcolor="white" }`).styles());
  const listed = bag(new DotReader(`digraph { graph [bgcolor="white"] }`).styles());
  expect([...listed]).toEqual([...bare]);
});

test("a nested declaration composes both names, because there is no wrapper element", () => {
  const reader = new DotReader(`digraph {
    subgraph cluster_a { subgraph inner { node [fillcolor="coral"] ; a } }
  }`);
  expect([...bag(reader.styles()).keys()]).toEqual([".cluster_a.inner.node, .cluster_a.inner.record"]);
});

test("a node's own attributes are its `#id`", () => {
  expect(bag(two.styles()).get("#horizon")).toEqual(new Map([["font-size", "12px"]]));
  expect(bag(two.styles()).get("#horizon_runtime")).toEqual(new Map([["border-width", "3px"]]));
});

test("appearance is **not** resolved onto members — that is the whole asymmetry", () => {
  const reader = new DotReader(`digraph { subgraph cluster_a { node [fillcolor="coral"] ; a ; b } }`);
  const selectors = [...bag(reader.styles()).keys()];
  expect(selectors).toEqual([".cluster_a.node, .cluster_a.record"]);
  expect(selectors).not.toContain("#a");
});

test("a bare number gains `px`, because `font-size: 12` is not valid CSS", () => {
  // The one value we correct (§3.2): unitless lengths were being refused by
  // CSSOM, so `#horizon`'s `fontsize=12` had never once been painted.
  const reader = new DotReader(`digraph {
    node [fontsize=12 penwidth=3 height=0.5 fontname="Inter" fillcolor="#ddffdd"]
  }`);
  expect(bag(reader.styles()).get(".node, .record")).toEqual(
    new Map<string, string>([
      ["font-size", "12px"],
      ["border-width", "3px"],
      ["height", "0.5px"],
      ["font-family", "Inter"],
      ["background-color", "#ddffdd"],
    ]),
  );
});

test("an attribute the registry does not know is not appearance, and is dropped", () => {
  // `splines`, `concentrate`, `nodesep`, `dir`, `constraint`, `weight` — layout
  // and semantics, none of them ours to paint.
  const reader = new DotReader(`digraph { splines=ortho ; concentrate=true ; a -> b [weight=100] }`);
  expect([...bag(reader.styles()).keys()]).toEqual([]);
});

test("a diagram of pure markup derives no appearance at all", () => {
  // example-1 says only `shape`, `label`, `icon` and `caption`, so the theme is
  // left to do all the talking.
  expect([...bag(one.styles()).keys()]).toEqual([]);
});

// --- the points: the author's graph, trimmed of size ------------------------

test("the points keep no attribute that gives a node size", () => {
  const points = two.points();
  // The one `label` left is the point default's own `label = ""`.
  for (const cut of ["Google Cloud Storage", "record", "fontsize", "xlabel", "bidirectional"]) {
    expect(points).not.toContain(cut);
  }
  expect(points.match(/label/g)).toHaveLength(1);
});

test("the points open with every node a 0×0 point", () => {
  expect(two.points()).toMatch(/^digraph[^{]*\{\s*node \[\s*shape = point/);
});

test("the points keep what layout reads: rank, weight, constraint, style, subgraphs", () => {
  const points = two.points();
  for (const kept of ["rank = same", "weight = 100", "constraint = false", "style = invis", "cluster_a", "rankdir = LR"]) {
    expect(points).toContain(kept);
  }
});

test("the trim leaves the model and styles whole", () => {
  expect(two.model().nodes.get("gcs")!.shape).toBe("record");
  expect(two.model().nodes.get("gcs")!.label).toContain("Google Cloud Storage");
});
