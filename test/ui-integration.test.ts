import { readdirSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { DiagramBagger } from "../src/diagram/diagram-bagger.ts";
import { CssBagger } from "../src/diagram/css-bagger.ts";
import { LayoutFramer } from "../src/diagram/layout-framer.ts";
import { NodeSheller } from "../src/diagram/node-sheller.ts";
import { EdgeDrawer } from "../src/diagram/edge-drawer.ts";
import { Vizer } from "../src/diagram/vizer.ts";
import type { StyleRow, TabText } from "../src/types.ts";
import { userFile } from "../src/workbench/files.ts";

const BARE_BONE_DOT = `digraph barebone {
  rankdir=LR

  subgraph cluster_source {
    label = "Source"
    a [label="Node A"]
    b [label="Node B"]
  }

  c [label="Node C"]

  a -> b
  b -> c
}
`;

const RECORD_DOT = `digraph records {
  rankdir=TB
  rec [shape=record, label="Header | { Left | Right } | Footer"]
}
`;

describe("UI & Workbench Integration Suite", () => {
  test("theme/ ships exactly one theme, and its decomposed JSON", () => {
    expect(readdirSync("theme").sort()).toEqual(["basic-theme.json", "basic.css"]);
  });

  test("Bare-bone DOT derives only the token block", async () => {
    const vizer = new Vizer();
    const bagger = new DiagramBagger();
    const cssBagger = new CssBagger();

    const json = await vizer.render(BARE_BONE_DOT);
    const model = bagger.bag(json);
    const derived = cssBagger.bag(model);

    expect([...derived.keys()]).toEqual([":root, svg"]);
    const tokens = derived.get(":root, svg")!;
    expect(tokens.get("--primary-color")).toBeDefined();
    expect(tokens.get("--secondary-color")).toBeDefined();
    expect(tokens.get("--accent-color")).toBeDefined();
  });

  test("shape=record correctly parses and builds nested flex structure", async () => {
    const vizer = new Vizer();
    const bagger = new DiagramBagger();
    const framer = new LayoutFramer();

    const json = await vizer.render(RECORD_DOT);
    const model = bagger.bag(json);
    const html = framer.frame(model);

    expect(html).toContain('class="record"');
    expect(html).toContain('class="cell _1"');
    expect(html).toContain("<div>");
    expect(html).toContain('class="cell _2_1"');
    expect(html).toContain('class="cell _2_2"');
    expect(html).toContain('class="cell _3"');
    expect(html).toContain("Header");
    expect(html).toContain("Left");
    expect(html).toContain("Right");
    expect(html).toContain("Footer");
  });

  test("LayoutFramer generates pure semantic HTML with zero inline styles", async () => {
    const vizer = new Vizer();
    const bagger = new DiagramBagger();
    const framer = new LayoutFramer();

    const json = await vizer.render(BARE_BONE_DOT);
    const model = bagger.bag(json);
    const html = framer.frame(model);

    expect(html).toContain('<div class="diagram">');
    expect(html).toContain('<div class="rank">');
    expect(html).toContain('id="a" class="node cluster_source"');
    expect(html).toContain('id="b" class="node cluster_source"');
    expect(html).toContain('id="c" class="node"');
    expect(html).not.toContain("style=");
  });

  test("CssBagger emits quantized position margin rules under #id in derived CSS", async () => {
    const vizer = new Vizer();
    const bagger = new DiagramBagger();
    const cssBagger = new CssBagger();

    const FIXTURE = new URL("../research-lab/example-1.dot", import.meta.url).pathname;
    const dot = await Bun.file(FIXTURE).text();
    const json = await vizer.render(dot);
    const model = bagger.bag(json);
    const derived = cssBagger.bag(model);

    expect(derived.has(":root, svg")).toBe(true);
    // Verify that staggered nodes carry a quantized margin under their own id
    const margins = [...derived]
      .filter(([selector]) => selector.startsWith("#"))
      .flatMap(([, properties]) => [...properties])
      .filter(([property]) => property === "margin-top");
    expect(margins.length).toBeGreaterThan(0);
    for (const [, value] of margins) {
      expect(value).toMatch(/^calc\(\d+ \* \(var\(--vertical-gap\) \+ 2\.5em\)\)$/);
    }
  });

  test("Syntax highlighters tokenize JS, HTML, CSS, and DOT correctly", async () => {
    const { highlightJs, highlightHtml, highlightCss, highlightDot } = await import(
      "../src/workbench/highlight.ts"
    );

    const js = highlightJs("const x = 42; // note");
    expect(js).toContain('<span class="hl-keyword">const</span>');
    expect(js).toContain('<span class="hl-number">42</span>');
    expect(js).toContain('<span class="hl-comment">// note</span>');

    const html = highlightHtml('<div class="box">text</div>');
    expect(html).toContain('<span class="hl-tag">&lt;div</span>');
    expect(html).toContain('<span class="hl-attr">class</span>');

    const css = highlightCss(".node { color: red; }");
    expect(css).toContain('<span class="hl-selector">.node </span>');
    expect(css).toContain('<span class="hl-property">color</span>');

    const dot = highlightDot('digraph { a -> b [label="Hi"] }');
    expect(dot).toContain('<span class="hl-keyword">digraph</span>');
    expect(dot).toContain('<span class="hl-operator">-&gt;</span>');
  });

  test("The export seed carries the three text tabs and the user rows only", () => {
    const text: TabText = {
      dot: BARE_BONE_DOT,
      action: "console.log('hello');",
      annotation: "<div>Note</div>",
    };
    const rows: StyleRow[] = [
      { selector: ".node", property: "background", value: "red", origin: "theme" },
      { selector: ".node", property: "color", value: "white", origin: "derived" },
      { selector: ".node", property: "@apply", value: ".glass", origin: "user" },
      { selector: "#a", property: "border-width", value: "2px", origin: "user" },
    ];

    const parsed = JSON.parse(JSON.stringify({ ...text, styles: userFile(rows) }));

    expect(parsed.dot).toBe(BARE_BONE_DOT);
    expect(parsed.action).toBe("console.log('hello');");
    expect(parsed.annotation).toBe("<div>Note</div>");
    expect(parsed.styles).toEqual({ ".node": { "@apply": ".glass" }, "#a": { "border-width": "2px" } });
    expect(parsed.theme).toBeUndefined();
  });
});
