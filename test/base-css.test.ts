// Base CSS must be byte-identical for identical input, or every diff is noise
// (§3.2). That claim rests on three interacting rules — absence counts as a
// value, ties break on the lexicographically smallest, and ATTR_CSS insertion
// order is declaration order — which is exactly what a test is for.
//
// The rest of these guard the two §3.2 rules that are easy to regress: naming is
// DOT naming, and no colour is invented.

import { expect, test } from "bun:test";
import { CssBagger } from "../src/diagram/css-bagger.ts";
import { DiagramBagger } from "../src/diagram/diagram-bagger.ts";
import { Vizer } from "../src/diagram/vizer.ts";

const FIXTURE = new URL("../research-lab/example-1.dot", import.meta.url).pathname;

const vizer = new Vizer();

async function css(dot: string): Promise<string> {
  return new CssBagger().bag(new DiagramBagger().bag(await vizer.render(dot)));
}

const dot = await Bun.file(FIXTURE).text();
const out = await css(dot);

test("the same DOT bags to the same bytes, twice through the whole pipeline", async () => {
  expect(await css(dot)).toBe(await css(dot));
});

test("one edge in twelve does not thicken the other eleven", () => {
  // The fixture's `core -> runtime` is the only penwidth=3 edge. Absence is
  // the majority, so the key is skipped at class level and that one edge pays.
  expect(out).not.toMatch(/\.edge \{[^}]*stroke-width/);
  expect(out).toMatch(/#core_runtime \{\n\s+stroke-width: 3pt;/);
});

test("the most common value becomes the class rule", () => {
  // Every node in the fixture is filled #BBDEFB except the six green ones, so
  // the majority lands on `.node` and the minority on a subgraph or an id.
  expect(out).toMatch(/\.node \{[^}]*background-color: #BBDEFB/);
});

test("selectors are DOT names, and as short as still identifies the place", async () => {
  expect(out).toContain(".column {");
  expect(out).not.toContain(".diagram .");
  expect(out).not.toContain(".diagram.columns");
  // A cluster is never drawn, so a `.graph` block would style nothing (§3.2).
  expect(out).not.toContain(".graph");

  // `cluster_` is not stripped: the class is the token the DOT wrote (§3.1).
  const named = await css(`digraph {
    a; subgraph cluster_source { b [fillcolor=pink style=filled] }
  }`);
  expect(named).toMatch(/\.cluster_source \{\n\s+&\.node \{\n\s+background-color: pink;/);
});

test("an empty subgraph says nothing", () => {
  // `cluster_a`'s members were already filled by the anonymous block they also
  // sit in, so it has nothing left to add — and an empty rule is noise (§3.2).
  expect(out).not.toContain(".cluster_a");
});

test("an anonymous subgraph collapses six #id rules into one class", () => {
  // The fixture's first `{ node [fillcolor="#ddffdd"] … }` block has six members.
  expect(out).toMatch(/\.subgraph_1 \{\n\s+&\.node \{\n\s+background-color: #ddffdd;/);
  expect(out.match(/#ddffdd/g)).toHaveLength(1);
});

test("no colour is invented — every one traces to the DOT", () => {
  const dotColours = new Set(
    (dot.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []).map((hex) => hex.toLowerCase()),
  );
  const cssColours = new Set(
    (out.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []).map((hex) => hex.toLowerCase()),
  );

  expect([...cssColours].filter((hex) => !dotColours.has(hex))).toEqual([]);
  expect(cssColours.size).toBe(dotColours.size);
});

test("a node needs no rule for what it inherits from the wrapper", () => {
  // The fixture sets `fontname=Helvetica` on the graph *and* on every node.
  // Saying it twice is the redundancy §3.2 forbids.
  expect(out).toMatch(/\.diagram \{[^}]*font-family: Helvetica/);
  expect(out).not.toMatch(/\.node \{[^}]*font-family/);
});
