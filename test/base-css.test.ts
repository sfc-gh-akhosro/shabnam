// The derived layer must be identical for identical input, or every diff is
// noise (§3.2). That claim rests on three interacting rules — absence counts as
// a value, ties break on the lexicographically smallest, and ATTR_CSS insertion
// order is declaration order — which is exactly what a test is for.
//
// The rest of these guard the two §3.2 rules that are easy to regress: naming is
// DOT naming, and no colour is invented. They assert map entries, because the
// bagger returns `StyleRules` and nothing on this path is ever text.

import { expect, test } from "bun:test";
import { CssBagger } from "../src/diagram/css-bagger.ts";
import { DiagramBagger } from "../src/diagram/diagram-bagger.ts";
import { Vizer } from "../src/diagram/vizer.ts";
import { asFile } from "../src/stylist/stylist.ts";
import type * as T from "../src/types.ts";

const FIXTURE = new URL("../research-lab/example-1.dot", import.meta.url).pathname;

const vizer = new Vizer();

async function rules(dot: string): Promise<T.StyleRules> {
  return new CssBagger().bag(new DiagramBagger().bag(await vizer.render(dot)));
}

// Insertion order is part of the contract, so compare the ordered JSON.
function shape(out: T.StyleRules): string {
  return JSON.stringify(asFile(out));
}

const dot = await Bun.file(FIXTURE).text();
const out = await rules(dot);

test("the same DOT bags to the same map, twice through the whole pipeline", async () => {
  expect(shape(await rules(dot))).toBe(shape(await rules(dot)));
});

test("one edge in twelve does not thicken the other eleven", async () => {
  const sample = await rules(`digraph {
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
  expect(sample.get(".edge")?.get("stroke-width")).toBeUndefined();
  expect(sample.get("#a_l")?.get("stroke-width")).toBe("3pt");
});

test("the most common value becomes the class rule", async () => {
  const sample = await rules(`digraph {
    node [shape=box fillcolor="#BBDEFB" style=filled]
    a; b; c; d;
    e [fillcolor="#ddffdd"]
  }`);
  expect(sample.get(".node, .record")?.get("background-color")).toBe("#BBDEFB");
});

test("tokens land on :root and on svg, not on :root alone", () => {
  expect(out.has(":root, svg")).toBe(true);
  expect(out.has(":root")).toBe(false);
  expect(out.get(":root, svg")?.get("--primary-color")).toBeDefined();
});

test("selectors are DOT names, and as short as still identifies the place", async () => {
  const selectors = [...out.keys()];
  expect(selectors.some((s) => s.includes(".diagram ."))).toBe(false);
  expect(selectors).not.toContain(".diagram.columns");
  // A cluster is never drawn, so a `.graph` block would style nothing (§3.2).
  expect(selectors.some((s) => s.includes(".graph"))).toBe(false);
  // CSSOM has no nesting, so a composed selector never carries `&` (§3.2).
  expect(selectors.some((s) => s.includes("&"))).toBe(false);

  // `cluster_` is not stripped: the class is the token the DOT wrote (§3.1).
  const named = await rules(`digraph {
    a; subgraph cluster_source { b [fillcolor=pink style=filled] }
  }`);
  expect(named.get(".cluster_source.node, .cluster_source.record")?.get("background-color"))
    .toBe("pink");
});

test("a nested subgraph composes its classes flat", async () => {
  const sample = await rules(`digraph {
    subgraph cluster_outer {
      node [fillcolor=pink style=filled]
      a;
      subgraph cluster_inner {
        node [fillcolor=teal]
        b;
      }
    }
  }`);
  const inner = ".cluster_outer.cluster_inner.node, .cluster_outer.cluster_inner.record";
  expect(sample.get(inner)?.get("background-color")).toBe("teal");
});

test("an empty subgraph says nothing", async () => {
  const sample = await rules(`digraph {
    {
      node [fillcolor="#ddffdd" style=filled]
      a; b;
    }
    subgraph cluster_a {
      a; b;
    }
  }`);
  expect([...sample.keys()].some((s) => s.includes(".cluster_a"))).toBe(false);
});

test("an anonymous subgraph collapses multiple #id rules into one class", async () => {
  const sample = await rules(`digraph {
    node [fillcolor="#ffffff" style=filled]
    {
      node [fillcolor="#ddffdd"]
      a; b; c;
    }
    d; e; f; g;
  }`);
  expect(sample.get(".subgraph_1.node, .subgraph_1.record")?.get("background-color"))
    .toBe("#ddffdd");
  expect(shape(sample).match(/#ddffdd/g)).toHaveLength(1);
});

test("no colour is invented — every one traces to the DOT", async () => {
  const sampleDot = `digraph {
    graph [bgcolor="#FAFAFA"]
    node [fillcolor="#BBDEFB" color="#1565C0" style=filled]
    edge [color="#555555"]
    a -> b
  }`;
  const sampleOut = shape(await rules(sampleDot));
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
  const sample = await rules(`digraph {
    graph [fontname="Helvetica"]
    node [fontname="Helvetica"]
    a -> b
  }`);
  expect(sample.get(".diagram")?.get("font-family")).toBe("Helvetica");
  expect(sample.get(".node, .record")?.get("font-family")).toBeUndefined();
});
