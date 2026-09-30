// Appearance is read off the branch it was written on (§3.2). The bag is
// identical for identical input because nothing is counted and nothing is
// invented: a silent DOT derives nothing at all, and a colour traces to the
// attribute the author typed.

import { expect, test } from "bun:test";
import { DotReader } from "../src/read/dot-reader.ts";
import { bag } from "./bag.ts";
import type * as T from "../src/types.ts";

const FIXTURE = new URL("../research-lab/example-1.dot", import.meta.url).pathname;

function rules(dot: string): ReturnType<typeof bag> {
  return bag(new DotReader(dot).styles());
}

function shape(out: ReturnType<typeof bag>): string {
  return JSON.stringify(
    Object.fromEntries([...out].map(([selector, properties]) => [selector, Object.fromEntries(properties)])),
  );
}

const dot = await Bun.file(FIXTURE).text();
const out = rules(dot);

test("the same DOT bags to the same map, twice through the whole pipeline", () => {
  expect(shape(rules(dot))).toBe(shape(rules(dot)));
});

test("one edge in twelve does not thicken the other eleven", () => {
  const sample = rules(`digraph {
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
  expect(sample.get(".edge")?.get("border-width")).toBeUndefined();
  expect(sample.get("#a_l")?.get("border-width")).toBe("3px");
});

test("a `node [...]` is one rule on the branch, not a tally of the leaves", () => {
  const sample = rules(`digraph {
    node [shape=box fillcolor="#BBDEFB" style=filled]
    a; b; c; d;
    e [fillcolor="#ddffdd"]
  }`);
  expect(sample.get(".node, .record")?.get("background-color")).toBe("#BBDEFB");
  expect(sample.get("#e")?.get("background-color")).toBe("#ddffdd");
});

test("a diagram of pure markup derives nothing — tokens are the theme's", () => {
  expect([...out.keys()]).toEqual([]);
});

test("selectors are DOT names, and as short as still identifies the place", () => {
  const selectors = [...out.keys()];
  expect(selectors.some((s) => s.includes(".diagram ."))).toBe(false);
  expect(selectors.some((s) => s.includes(".graph"))).toBe(false);
  expect(selectors.some((s) => s.includes("&"))).toBe(false);

  const named = rules(`digraph {
    a; subgraph cluster_source { b [fillcolor=pink style=filled] }
  }`);
  expect(named.get("#b")?.get("background-color")).toBe("pink");
});

test("a nested subgraph composes its classes flat", () => {
  const sample = rules(`digraph {
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

test("an empty subgraph says nothing", () => {
  const sample = rules(`digraph {
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

test("an unnamed subgraph's declaration lands on the scope around it", () => {
  const sample = rules(`digraph {
    node [fillcolor="#ffffff" style=filled]
    {
      node [fillcolor="#ddffdd"]
      a; b; c;
    }
    d; e; f; g;
  }`);
  expect(sample.get(".node, .record")?.get("background-color")).toBe("#ddffdd");
  expect([...sample.keys()].some((selector) => selector.includes("subgraph"))).toBe(false);
  expect(shape(sample).match(/#ddffdd/g)).toHaveLength(1);
});

test("no colour is invented — every one traces to the DOT", () => {
  const sampleDot = `digraph {
    graph [bgcolor="#FAFAFA"]
    node [fillcolor="#BBDEFB" color="#1565C0" style=filled]
    edge [color="#555555"]
    a -> b
  }`;
  const sampleOut = shape(rules(sampleDot));
  const dotColours = new Set(
    (sampleDot.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []).map((hex) => hex.toLowerCase()),
  );
  const cssColours = new Set(
    (sampleOut.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []).map((hex) => hex.toLowerCase()),
  );

  expect([...cssColours].filter((hex) => !dotColours.has(hex))).toEqual([]);
  expect(cssColours.size).toBe(dotColours.size);
});

test("a graph font lands on the canvas, and is not copied onto every node", () => {
  const sample = rules(`digraph {
    graph [fontname="Helvetica"]
    node [fontname="Helvetica"]
    a -> b
  }`);
  expect(sample.get("#diagram-canvas")?.get("font-family")).toBe("Helvetica");
  expect(sample.get(".node, .record")?.get("font-family")).toBe("Helvetica");
});

test("a size is the number the author typed, with `px`", () => {
  const sample = rules(`digraph {
    ghost [height=0 width=0]
    ghost -> real
  }`);
  const passed = sample.get("#ghost")!;
  expect(passed.get("height")).toBe("0px");
  expect(passed.get("width")).toBe("0px");
  expect(passed.get("padding")).toBeUndefined();
});

test("a non-zero size is the same number, not Graphviz inches", () => {
  const sample = rules(`digraph {
    wide [width=3 height=2]
    wide -> other
  }`);
  expect(sample.get("#wide")?.get("width")).toBe("3px");
  expect(sample.get("#wide")?.get("height")).toBe("2px");
});
