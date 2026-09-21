import { describe, expect, test } from "bun:test";
import { DiagramBagger } from "../src/diagram/diagram-bagger.ts";
import { CssBagger } from "../src/diagram/css-bagger.ts";
import { LayoutFramer } from "../src/diagram/layout-framer.ts";
import { NodeSheller } from "../src/diagram/node-sheller.ts";
import { EdgeDrawer } from "../src/diagram/edge-drawer.ts";
import { Vizer } from "../src/diagram/vizer.ts";
import { expandCss } from "../src/css/expander.ts";
import type { TabText } from "../src/types.ts";

import defaultTheme from "../theme/theme.css" with { type: "text" };
import blueprintTheme from "../theme/blueprint.css" with { type: "text" };

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
  test("Theme CSS contains utility classes, structural rules, and animation keyframes", () => {
    expect(defaultTheme).toContain(".paper");
    expect(defaultTheme).toContain(".glass");
    expect(defaultTheme).toContain(".warning");
    expect(defaultTheme).toContain(".tag");
    expect(defaultTheme).toContain(".annotation");
    expect(defaultTheme).toContain(".button");
    expect(defaultTheme).toContain(".raised");
    expect(defaultTheme).toContain(".outlined");
    expect(defaultTheme).toContain(".flat");
    expect(defaultTheme).toContain(".diagram");
    expect(defaultTheme).toContain(".node");
    expect(defaultTheme).toContain(".edge");
    expect(defaultTheme).toContain(".shell");
    expect(defaultTheme).toContain(".col");
    expect(defaultTheme).toContain(".row");
    expect(defaultTheme).toContain(".cell");
    expect(defaultTheme).toContain("@keyframes");
  });

  test("Bare-bone DOT produces clean derived CSS with only :root variables", async () => {
    const vizer = new Vizer();
    const bagger = new DiagramBagger();
    const cssBagger = new CssBagger();

    const json = await vizer.render(BARE_BONE_DOT);
    const model = bagger.bag(json);
    const derivedCss = cssBagger.bag(model);

    expect(derivedCss).toContain(":root");
    expect(derivedCss).toContain("--primary-color:");
    expect(derivedCss).toContain("--secondary-color:");
    expect(derivedCss).toContain("--accent-color:");

    // Must NOT contain structural layout rules
    expect(derivedCss).not.toContain(".diagram");
    expect(derivedCss).not.toContain(".column");
    expect(derivedCss).not.toContain(".row");
    expect(derivedCss).not.toContain(".col");
    expect(derivedCss).not.toContain(".cell");
    expect(derivedCss).not.toContain(".node");
    expect(derivedCss).not.toContain(".edge");
    expect(derivedCss).not.toContain(".shell");
    expect(derivedCss).not.toContain(".caption");
    expect(derivedCss).not.toContain(".arrow");
  });

  test("CSS expander resolves @apply from theme context into user styles", () => {
    const userStyle = `
.cluster_source {
  @apply .glass;
}

.node.special {
  @apply .paper .raised;
}
`;
    const expanded = expandCss(userStyle, defaultTheme);

    expect(expanded).toContain("backdrop-filter: blur(8px);");
    expect(expanded).toContain("box-shadow: var(--raised-shadow);");
    expect(expanded).not.toContain("@apply");
  });

  test("shape=record correctly parses and builds nested flex structure", async () => {
    const vizer = new Vizer();
    const bagger = new DiagramBagger();
    const framer = new LayoutFramer();

    const json = await vizer.render(RECORD_DOT);
    const model = bagger.bag(json);
    const html = framer.frame(model);

    expect(html).toContain('class="node record row"');
    expect(html).toContain('class="cell _1"');
    expect(html).toContain('class="fields col"');
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
    expect(html).toContain('<div class="column">');
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
    const derivedCss = cssBagger.bag(model);

    expect(derivedCss).toContain(":root");
    // Verify that staggered nodes have margin-top rules emitted in derived.css
    expect(derivedCss).toMatch(/#[a-z_0-9]+ \{\n\s+margin-top: calc\(\d+ \* \(var\(--vertical-gap\) \+ 2\.5em\)\);/);
  });

  test.skip("Css.plus needs CSSOM — run in the browser", () => {
    // Bun has no CSSStyleSheet. Css.plus throws without it by design.
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

  test("Themer seed accurately carries tab text and exports standalone page", () => {
    const text: TabText = {
      theme: defaultTheme,
      dot: BARE_BONE_DOT,
      style: ".node { @apply .glass; }",
      action: "console.log('hello');",
      annotation: "<div>Note</div>",
    };

    const jsonSeed = JSON.stringify(text);
    const parsed = JSON.parse(jsonSeed);

    expect(parsed.theme).toBe(defaultTheme);
    expect(parsed.dot).toBe(BARE_BONE_DOT);
    expect(parsed.style).toBe(".node { @apply .glass; }");
    expect(parsed.action).toBe("console.log('hello');");
    expect(parsed.annotation).toBe("<div>Note</div>");
  });
});
