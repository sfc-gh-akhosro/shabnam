// Identity is decided once, in DotReader, for everyone (§3.1). These are the
// claims the rest of the app builds on: **CSS naming is DOT naming**, subgraph
// names become classes verbatim, and a space is the one thing we sanitise.

import { expect, test } from "bun:test";
import { DotReader } from "../src/read/dot-reader.ts";
import type { DiagramModel } from "../src/types.ts";

const FIXTURE = new URL("../research-lab/example-1.dot", import.meta.url).pathname;

function model(dot: string): DiagramModel {
  return new DotReader(dot).model();
}

const fixture = model(await Bun.file(FIXTURE).text());

test("an id is the DOT name, with no prefix and no decoration", () => {
  expect([...fixture.nodes.keys()]).toContain("lake");
  expect([...fixture.nodes.keys()]).toContain("blobs");
  expect(fixture.edges.map((edge) => edge.id)).toContain("core_runtime");
});

test("a subgraph keeps its DOT name, `cluster_` included", () => {
  expect(fixture.clusters.map((cluster) => cluster.name)).toEqual([
    "cluster_sources",
    "cluster_platform",
    "cluster_consumer",
  ]);
});

test("a subgraph name becomes a class on its member nodes", () => {
  expect(fixture.nodes.get("lake")!.classes).toEqual(["cluster_sources"]);
  expect(fixture.nodes.get("portal")!.classes).toEqual(["cluster_consumer"]);
});

test("an edge points at node ids, and parallel edges are suffixed", () => {
  const blobs = fixture.edges.find((edge) => edge.id === "blobs_core")!;
  expect([blobs.from, blobs.to]).toEqual(["blobs", "core"]);

  const twice = model("digraph { a -> b; a -> b; a -> b }");
  expect(twice.edges.map((edge) => edge.id)).toEqual(["a_b", "a_b_2", "a_b_3"]);
});

test("rankdir survives, and the model carries no coordinates", () => {
  expect(fixture.rankdir).toBe("LR");
  expect(fixture.nodes.get("lake")!).not.toHaveProperty("x");
  expect(fixture.nodes.get("lake")!).not.toHaveProperty("y");
});

test("a space in a name becomes an underscore, and nothing else is owed", () => {
  const sample = model('digraph { "a b"; "a.b" }');
  expect([...sample.nodes.keys()]).toEqual(["a_b", "a.b"]);
});

test("the default label is the node's own name", () => {
  const sample = model('digraph { "Provider-Services" [shape=none] }');
  const node = sample.nodes.get("Provider-Services")!;
  expect(node.label).toBe("Provider-Services");
  expect(node.caption).toBe("Provider-Services");
});

test("an authored label is not expanded — `\\\\N` stays what the author wrote", () => {
  const sample = model('digraph { a [label="Not \\\\N at all"]; b }');
  expect(sample.nodes.get("a")!.label).not.toBe("a");
  expect(sample.nodes.get("a")!.label).toContain("N at all");
  expect(sample.nodes.get("b")!.label).toBe("b");
});

test("a cluster's `\\G` becomes the subgraph's own name", () => {
  const sample = model('digraph { subgraph cluster_source { label="\\G" a } }');
  expect(sample.clusters.find((entry) => entry.name === "cluster_source")!.label).toBe("cluster_source");
});
