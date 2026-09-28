// shape=record (§3.3). The record label is the grammar we own, so these are the
// claims the styling surface rests on: a cell's class is its path, `{}` flips the
// axis at every level, an empty slot counts and grows the field before it, a
// leading `{` is the node's own axis, and a label that does not balance throws
// rather than producing markup the browser will silently repair.

import { expect, test } from "bun:test";
import { shapeHtml } from "../src/diagram/node-shaper.ts";
import { GraphvizAst } from "../src/dot/graphviz-ast.ts";
import type { DiagramNode } from "../src/types.ts";

function node(label: string): DiagramNode {
  const dot = `digraph { n [shape=record label="${label}"] }`;
  return new GraphvizAst(dot).model().nodes.get("n")!;
}

function html(label: string): string {
  return shapeHtml(node(label));
}

test("a cell's class is its path, not a running count", () => {
  expect(html("a | b | c")).toBe(
    '<div id="n" class="record">' +
      '<span class="cell _1">a</span>' +
      '<span class="cell _2">b</span>' +
      '<span class="cell _3">c</span>' +
      "</div>",
  );
});

test("a leading { is the node's own axis, and costs no level of path", () => {
  expect(html("{Head | {A | B} | Foot}")).toBe(
    '<div id="n" class="record">' +
      '<span class="cell _1">Head</span>' +
      "<div>" +
      '<span class="cell _2_1">A</span>' +
      '<span class="cell _2_2">B</span>' +
      "</div>" +
      '<span class="cell _3">Foot</span>' +
      "</div>",
  );
});

test("a group takes an index, so the field after it does not reuse one", () => {
  const markup = html("1st | {2nd | 3rd} | 4th");
  expect(markup).toContain('<span class="cell _1">1st</span>');
  expect(markup).toContain('<span class="cell _2_1">2nd</span>');
  expect(markup).toContain('<span class="cell _2_2">3rd</span>');
  expect(markup).toContain('<span class="cell _3">4th</span>');
});

test("every { flips the axis, however deep", () => {
  const markup = html("{Head | {A | {a1 | a2} | B}}");
  expect(markup).toContain('class="record"');
  expect(markup).toContain("<div>");
  expect(markup).toContain('<span class="cell _2_2_1">a1</span>');
  expect(markup).toContain('<span class="cell _2_2_2">a2</span>');
});

test("an empty slot counts, and grows the field before it", () => {
  const markup = html("{me || you}");
  expect(markup).toContain('<span class="cell _1" style="--span:2">me</span>');
  expect(markup).toContain('<span class="cell _3">you</span>');
});

test("blank beside a brace is notation, and counts for nothing", () => {
  const markup = html("1st | {2nd | 3rd}");
  expect(markup).toContain('<span class="cell _1">1st</span>');
  expect(markup).toContain('<span class="cell _2_1">2nd</span>');
  expect(markup).not.toContain("></span>");
});

test("an escaped separator is text, not a split", () => {
  const markup = html("esc \\| pipe | plain");
  expect(markup).toContain('<span class="cell _1">esc | pipe</span>');
  expect(markup).toContain('<span class="cell _2">plain</span>');
});

test("a port is stripped from the label, not classed", () => {
  expect(html("<p6> 6th")).toContain('<span class="cell _1">6th</span>');
  expect(html("<p6> 6th")).not.toContain("p6");
});

test("inline markdown reaches both shapes, and so does the author's HTML", () => {
  expect(html("**bold** | *thin* | `mono`")).toContain("<strong>bold</strong>");
  expect(html("**bold** | *thin* | `mono`")).toContain("<em>thin</em>");
  expect(html("**bold** | *thin* | `mono`")).toContain("<code>mono</code>");

  const box = shapeHtml(
    new GraphvizAst('digraph { n [label="**b** and <b>bare</b>"] }').model().nodes.get("n")!,
  );
  expect(box).toContain("<strong>b</strong>");
  expect(box).toContain("<b>bare</b>");
});

test("inline image markdown renders as an icon and newlines become break tags", () => {
  const markup = html("![cloud](cloud.svg) Line 1\\nLine 2");
  expect(markup).toContain('<img class="icon" src="data:image/svg+xml,');
  expect(markup).toContain('alt="cloud" />');
  expect(markup).toContain("Line 1<br />Line 2");
});

test("the library brings the rest of CommonMark, and the break stays escapable", () => {
  expect(html("~~gone~~")).toContain("<s>gone</s>");
  expect(html("[docs](https://graphviz.org)")).toContain('href="https://graphviz.org"');
  expect(html("see https://graphviz.org")).toContain("<a href=");
  expect(html("A\\\\nB")).not.toContain("<br />");
});

test("an unbalanced label throws instead of emitting repairable markup", () => {
  expect(() => shapeHtml(node("{a | b"))).toThrow("unbalanced");
});
