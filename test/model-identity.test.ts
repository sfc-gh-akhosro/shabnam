// Identity is decided once, in DiagramBagger, for everyone (§3.1). These are the
// claims the rest of the app builds on: **CSS naming is DOT naming**, subgraph
// names become classes verbatim, `pos` is numeric, and two DOT names that want
// one id throw.

import { expect, test } from "bun:test";
import { DiagramBagger } from "../src/diagram/diagram-bagger.ts";
import { Vizer } from "../src/diagram/vizer.ts";
import type { DiagramModel } from "../src/types.ts";

const FIXTURE = new URL("../research-lab/example-1.dot", import.meta.url).pathname;

async function model(dot: string): Promise<DiagramModel> {
  return new DiagramBagger().bag(await new Vizer().render(dot));
}

const fixture = await model(await Bun.file(FIXTURE).text());

test("an id is the DOT name, with no prefix and no decoration", () => {
  const ids = fixture.nodes.map((node) => node.id);
  expect(ids).toContain("lake");
  expect(ids).toContain("blobs");

  expect(fixture.edges.map((edge) => edge.id)).toContain("core_runtime");
});

test("a subgraph keeps its DOT name, `cluster_` included", () => {
  // Stripping `cluster_` would make the CSS class something the DOT never says,
  // and `cluster_a` would become the one-letter `.a` (§3.1).
  expect(fixture.clusters.map((cluster) => cluster.name)).toEqual([
    "cluster_sources",
    "cluster_platform",
    "cluster_consumer",
  ]);
});

test("a subgraph name becomes a class on its member nodes", () => {
  const lake = fixture.nodes.find((node) => node.id === "lake")!;
  expect(lake.classes).toEqual(["cluster_sources"]);

  const portal = fixture.nodes.find((node) => node.id === "portal")!;
  expect(portal.classes).toEqual(["cluster_consumer"]);
});

test("an edge points at node ids, and parallel edges are suffixed", async () => {
  const blobs = fixture.edges.find((edge) => edge.id === "blobs_core")!;
  expect([blobs.from, blobs.to]).toEqual(["blobs", "core"]);

  const twice = await model("digraph { a -> b; a -> b; a -> b }");
  expect(twice.edges.map((edge) => edge.id)).toEqual(["a_b", "a_b_2", "a_b_3"]);
});

test("pos is numeric, and rankdir survives", () => {
  expect(fixture.rankdir).toBe("LR");
  for (const node of fixture.nodes) {
    expect(Number.isFinite(node.x)).toBe(true);
    expect(Number.isFinite(node.y)).toBe(true);
  }
});

test("two DOT names that sanitize to one id throw", async () => {
  // Silent id collapse produces a malformed page; a stack trace does not (§3.1).
  expect(model('digraph { "a.b"; "a b" }')).rejects.toThrow(/id collision/);
});
