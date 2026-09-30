// shape=record (§3.3). The record label is the grammar we own, so these are the
// claims the styling surface rests on: a field carries no class, so the markup is
// the selector; `{}` flips the axis at every level, an empty slot counts and grows
// the field before it, a leading `{` is the node's own axis, and a label that does
// not balance throws rather than producing markup the browser will silently repair.

import { expect, test } from "bun:test";
import { shapeHtml } from "../src/paint/node-shaper.ts";
import { DotReader } from "../src/read/dot-reader.ts";
import type { DiagramNode } from "../src/types.ts";

function node(label: string): DiagramNode {
  const dot = `digraph { n [shape=record label="${label}"] }`;
  return new DotReader(dot).model().nodes.get("n")!;
}

function html(label: string): string {
  return shapeHtml(node(label));
}

test("a field is a bare span — the markup is the selector, not a class", () => {
  expect(html("a | b | c")).toBe(
    '<div id="n" class="record"><span>a</span><span>b</span><span>c</span></div>',
  );
});

test("a leading { is the node's own axis, and emits no div", () => {
  expect(html("{Head | {A | B} | Foot}")).toBe(
    '<div id="n" class="record">' +
      "<span>Head</span>" +
      "<div><span>A</span><span>B</span></div>" +
      "<span>Foot</span>" +
      "</div>",
  );
});

test("a group is a plain div between its sibling fields", () => {
  expect(html("1st | {2nd | 3rd} | 4th")).toBe(
    '<div id="n" class="record">' +
      "<span>1st</span><div><span>2nd</span><span>3rd</span></div><span>4th</span>" +
      "</div>",
  );
});

test("every { flips the axis, however deep", () => {
  expect(html("{Head | {A | {a1 | a2} | B}}")).toBe(
    '<div id="n" class="record">' +
      "<span>Head</span>" +
      "<div><span>A</span><div><span>a1</span><span>a2</span></div><span>B</span></div>" +
      "</div>",
  );
});

test("an empty slot counts, and grows the field before it", () => {
  expect(html("{me || you}")).toBe(
    '<div id="n" class="record"><span style="--span:2">me</span><span>you</span></div>',
  );
});

test("blank beside a brace is notation, and counts for nothing", () => {
  const markup = html("1st | {2nd | 3rd}");
  expect(markup).toContain("<span>1st</span><div><span>2nd</span>");
  expect(markup).not.toContain("<span></span>");
  expect(markup).not.toContain("--span");
});

test("an escaped separator is text, not a split", () => {
  expect(html("esc \\| pipe | plain")).toContain("<span>esc | pipe</span><span>plain</span>");
});

test("a port gives nothing — no class, no attribute, no text", () => {
  expect(html("<p6> 6th")).toBe('<div id="n" class="record"><span>6th</span></div>');
});

test("a field never carries a class", () => {
  expect(html("{a | {b | c} || d}")).not.toMatch(/<span class=/);
});

test("inline markdown reaches both shapes, and so does the author's HTML", () => {
  expect(html("**bold** | *thin* | `mono`")).toContain("<strong>bold</strong>");
  expect(html("**bold** | *thin* | `mono`")).toContain("<em>thin</em>");
  expect(html("**bold** | *thin* | `mono`")).toContain("<code>mono</code>");

  const box = shapeHtml(
    new DotReader('digraph { n [label="**b** and <b>bare</b>"] }').model().nodes.get("n")!,
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
