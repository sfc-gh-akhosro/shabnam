// shape=record (§3.3). The record label is the grammar we own, so these are the
// claims the styling surface rests on: a cell's class is its path, `{}` flips the
// axis at every level, an empty slot counts and grows the field before it, a
// leading `{` is the node's own axis, and a label that does not balance throws
// rather than producing markup the browser will silently repair.

import { expect, test } from "bun:test";
import { DiagramBagger } from "../src/diagram/diagram-bagger.ts";
import { shapeHtml } from "../src/diagram/node-shaper.ts";
import { Vizer } from "../src/diagram/vizer.ts";
import type { Node } from "../src/types.ts";

async function node(label: string): Promise<Node> {
  const dot = `digraph { n [shape=record label="${label}"] }`;
  const model = new DiagramBagger().bag(await new Vizer().render(dot));
  return model.nodes[0]!;
}

async function html(label: string): Promise<string> {
  return shapeHtml(await node(label));
}

test("a cell's class is its path, not a running count", async () => {
  // `._2_1` is the first field inside the second top-level item. Inserting a
  // sibling at one level leaves every other level's selectors alone.
  expect(await html("a | b | c")).toBe(
    '<div id="n" class="node record row">' +
      '<span class="cell _1">a</span>' +
      '<span class="cell _2">b</span>' +
      '<span class="cell _3">c</span>' +
      "</div>",
  );
});

test("a leading { is the node's own axis, and costs no level of path", async () => {
  // Records are written `{Head | {A | B}}`. Honouring that brace as a container
  // would push everything to `._1_1` and `._1_2_1` — a level that says nothing.
  expect(await html("{Head | {A | B} | Foot}")).toBe(
    '<div id="n" class="node record col">' +
      '<span class="cell _1">Head</span>' +
      '<div class="fields row">' +
      '<span class="cell _2_1">A</span>' +
      '<span class="cell _2_2">B</span>' +
      "</div>" +
      '<span class="cell _3">Foot</span>' +
      "</div>",
  );
});

test("a group takes an index, so the field after it does not reuse one", async () => {
  const markup = await html("1st | {2nd | 3rd} | 4th");
  expect(markup).toContain('<span class="cell _1">1st</span>');
  expect(markup).toContain('<span class="cell _2_1">2nd</span>');
  expect(markup).toContain('<span class="cell _2_2">3rd</span>');
  // The group is item 2 — so the field after it is item 3, not item 4. Its
  // children live under it, and do not spend indices at this level.
  expect(markup).toContain('<span class="cell _3">4th</span>');
});

test("every { flips the axis, however deep", async () => {
  const markup = await html("{Head | {A | {a1 | a2} | B}}");
  expect(markup).toContain('class="node record col"');
  expect(markup).toContain('<div class="fields row">');
  expect(markup).toContain('<div class="fields col">');
  expect(markup).toContain('<span class="cell _2_2_1">a1</span>');
  expect(markup).toContain('<span class="cell _2_2_2">a2</span>');
});

test("an empty slot counts, and grows the field before it", async () => {
  // `{me || you}` is three fields, not two: the empty one spends an index and
  // hands it to `me`, which is what "twice the size" means in classes and width.
  const markup = await html("{me || you}");
  expect(markup).toContain('<span class="cell _1 _2" style="--span:2">me</span>');
  expect(markup).toContain('<span class="cell _3">you</span>');
});

test("blank beside a brace is notation, and counts for nothing", async () => {
  // The space in `1st | {2nd` is how people write DOT, not an empty field.
  const markup = await html("1st | {2nd | 3rd}");
  expect(markup).toContain('<span class="cell _1">1st</span>');
  expect(markup).toContain('<span class="cell _2_1">2nd</span>');
  expect(markup).not.toContain("></span>");
});

test("an escaped separator is text, not a split", async () => {
  const markup = await html("esc \\| pipe | plain");
  expect(markup).toContain('<span class="cell _1">esc | pipe</span>');
  expect(markup).toContain('<span class="cell _2">plain</span>');
});

test("a port is a stable name beside the path", async () => {
  // We cannot honour a port as an edge attachment point — connectors come from
  // measured boxes (§3.4) — but the author already chose the name, so it stays.
  expect(await html("<p6> 6th")).toContain('<span class="cell _1 p6">6th</span>');
});

test("inline markdown reaches both shapes, and the author's angle brackets do not", async () => {
  expect(await html("**bold** | *thin* | `mono`")).toContain("<strong>bold</strong>");
  expect(await html("**bold** | *thin* | `mono`")).toContain("<em>thin</em>");
  expect(await html("**bold** | *thin* | `mono`")).toContain("<code>mono</code>");

  const plain = await new Vizer().render('digraph { n [label="**b** and <b>"] }');
  const box = shapeHtml(new DiagramBagger().bag(plain).nodes[0]!);
  expect(box).toContain("<strong>b</strong>");
  expect(box).toContain("&lt;b&gt;");
});

test("inline image markdown renders as an icon and newlines become break tags", async () => {
  const markup = await html("![cloud](cloud.svg) Line 1\\nLine 2");
  expect(markup).toContain('<img class="icon" src="data:image/svg+xml,');
  expect(markup).toContain('alt="cloud" />');
  expect(markup).toContain("Line 1<br />Line 2");
});

test("an unbalanced label throws instead of emitting repairable markup", async () => {
  const unbalanced = await node("{a | b");
  expect(() => shapeHtml(unbalanced)).toThrow("unbalanced");
});
