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

test("one edge in twelve does not thicken the other eleven", async () => {
  const sample = await css(`digraph {
    node [shape=box]
    a -> b
    b -> c
    c -> d
    d -> e
    e -> f
    f -> g
    g -> h
    h -> i
    i -> j
    j -> k
    k -> l
    a -> l [penwidth=3]
  }`);
  expect(sample).not.toMatch(/\.edge \{[^}]*stroke-width/);
  expect(sample).toMatch(/#a_l \{\n\s+stroke-width: 3pt;/);
});

test("the most common value becomes the class rule", async () => {
  const sample = await css(`digraph {
    node [shape=box fillcolor="#BBDEFB" style=filled]
    a; b; c; d;
    e [fillcolor="#ddffdd"]
  }`);
  expect(sample).toMatch(/\.node, \.record \{[^}]*background-color: #BBDEFB/);
});

test("selectors are DOT names, and as short as still identifies the place", async () => {
  expect(out).toContain(":root {");
  expect(out).not.toContain(".diagram .");
  expect(out).not.toContain(".diagram.columns");
  // A cluster is never drawn, so a `.graph` block would style nothing (§3.2).
  expect(out).not.toContain(".graph");

  // `cluster_` is not stripped: the class is the token the DOT wrote (§3.1).
  const named = await css(`digraph {
    a; subgraph cluster_source { b [fillcolor=pink style=filled] }
  }`);
  expect(named).toMatch(/\.cluster_source \{\n\s+&\.node, &\.record \{\n\s+background-color: pink;/);
});

test("an empty subgraph says nothing", async () => {
  const sample = await css(`digraph {
    {
      node [fillcolor="#ddffdd" style=filled]
      a; b;
    }
    subgraph cluster_a {
      a; b;
    }
  }`);
  expect(sample).not.toContain(".cluster_a");
});

test("an anonymous subgraph collapses multiple #id rules into one class", async () => {
  const sample = await css(`digraph {
    node [fillcolor="#ffffff" style=filled]
    {
      node [fillcolor="#ddffdd"]
      a; b; c;
    }
    d; e; f; g;
  }`);
  expect(sample).toMatch(/\.subgraph_1 \{\n\s+&\.node, &\.record \{\n\s+background-color: #ddffdd;/);
  expect(sample.match(/#ddffdd/g)).toHaveLength(1);
});

test("no colour is invented — every one traces to the DOT", async () => {
  const sampleDot = `digraph {
    graph [bgcolor="#FAFAFA"]
    node [fillcolor="#BBDEFB" color="#1565C0" style=filled]
    edge [color="#555555"]
    a -> b
  }`;
  const sampleOut = await css(sampleDot);
  const dotColours = new Set(
    (sampleDot.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []).map((hex) => hex.toLowerCase()),
  );
  const cssColours = new Set(
    (sampleOut.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []).map((hex) => hex.toLowerCase()),
  );

  expect([...cssColours].filter((hex) => !dotColours.has(hex))).toEqual([]);
  expect(cssColours.size).toBe(dotColours.size);
});

test("a node needs no rule for what it inherits from the wrapper", async () => {
  const sample = await css(`digraph {
    graph [fontname="Helvetica"]
    node [fontname="Helvetica"]
    a -> b
  }`);
  expect(sample).toMatch(/\.diagram \{[^}]*font-family: Helvetica/);
  expect(sample).not.toMatch(/\.node, \.record \{[^}]*font-family/);
});
