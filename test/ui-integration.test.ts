import { readdirSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { DiagramBagger } from "../src/diagram/diagram-bagger.ts";
import { CssBagger } from "../src/diagram/css-bagger.ts";
import { LayoutFramer } from "../src/diagram/layout-framer.ts";
import { NodeSheller } from "../src/diagram/node-sheller.ts";
import { EdgeDrawer } from "../src/diagram/edge-drawer.ts";
import { Vizer } from "../src/diagram/vizer.ts";
import type { Annotation, StyleRow, TabText } from "../src/types.ts";
import { SOURCE } from "../src/types.ts";
import { annotation, annotationHtml } from "../src/workbench/annotations.tsx";
import { bookFile } from "../src/workbench/files.ts";
import basicTheme from "../theme/basic-theme.json";

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
  test("theme/ ships exactly one theme, and no CSS file", () => {
    expect(readdirSync("theme").sort()).toEqual(["basic-theme.json"]);
  });

  test("Bare-bone DOT derives only the token block", async () => {
    const vizer = new Vizer();
    const bagger = new DiagramBagger();
    const cssBagger = new CssBagger();

    const json = await vizer.render(BARE_BONE_DOT);
    const model = bagger.bag(json);
    const derived = cssBagger.bag(model);

    expect([...derived.keys()]).toEqual(["#diagram-canvas, svg"]);
    const tokens = derived.get("#diagram-canvas, svg")!;
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

  test("CssBagger derives no margin — a node is spaced by the theme alone", async () => {
    const vizer = new Vizer();
    const bagger = new DiagramBagger();
    const cssBagger = new CssBagger();

    const FIXTURE = new URL("../research-lab/example-1.dot", import.meta.url).pathname;
    const dot = await Bun.file(FIXTURE).text();
    const json = await vizer.render(dot);
    const model = bagger.bag(json);
    const derived = cssBagger.bag(model);

    expect(derived.has("#diagram-canvas, svg")).toBe(true);
    // `pos` buys a rank and an order in it, nothing else. Spacing is the theme's
    // and the author's — no margin is computed from the layout.
    for (const [, properties] of derived) {
      for (const property of properties.keys()) {
        expect(property).not.toStartWith("margin");
      }
    }
  });

  test("The export seed carries the two text tabs, the whole book, and the annotations", () => {
    const text: TabText = {
      dot: BARE_BONE_DOT,
      action: "console.log('hello');",
    };
    const rows: StyleRow[] = [
      { selector: ".node", property: "background", value: "red", id: 1, source: SOURCE.theme },
      { selector: ".node", property: "color", value: "white", id: 2, source: SOURCE.dot },
      { selector: ".node", property: "@apply", value: ".glass", id: 3, source: SOURCE.user },
      { selector: "#a", property: "border-width", value: "2px", id: 4, source: SOURCE.user },
    ];
    const annotations: Annotation[] = [annotation({ selector: "#a", dy: "4em", text: "note" })];

    const parsed = JSON.parse(JSON.stringify({ ...text, styles: bookFile(rows), annotations }));

    expect(parsed.dot).toBe(BARE_BONE_DOT);
    expect(parsed.action).toBe("console.log('hello');");
    // An export paints what you see, so every source travels — and the id does
    // not, because it means nothing on the other page.
    expect(parsed.styles).toEqual({
      ".node": {
        background: { value: "red", source: 0 },
        color: { value: "white", source: 1 },
        "@apply": { value: ".glass", source: 2 },
      },
      "#a": { "border-width": { value: "2px", source: 2 } },
    });
    // The rows travel, not the marks: the exported page derives its own HTML.
    expect(parsed.annotations).toHaveLength(1);
    expect(parsed.annotations[0].selector).toBe("#a");
    expect(parsed.annotations[0].text).toBe("note");
    expect(parsed.theme).toBeUndefined();
  });
});

// The annotation rows are the model and the mark is derived from them (§4). This
// is that derivation, which is the only direction there is.
describe("an annotation row becomes a mark", () => {
  test("selector and text are the gate, and a half-filled row emits nothing", () => {
    // Not politeness: `querySelectorAll("")` throws, so a row with no selector
    // would take the next `place()` down with it.
    expect(annotationHtml([annotation({ text: "orphan" })])).toBe("");
    expect(annotationHtml([annotation({ selector: "#a" })])).toBe("");
    expect(annotationHtml([annotation()])).toBe("");
    expect(annotationHtml([annotation({ selector: "#a", text: "both" })])).toContain("both");
  });

  test("an offset is a style custom property, and a blank one is left out", () => {
    const both = annotationHtml([annotation({ selector: "#a", dx: "1em", dy: "4em", text: "x" })]);
    expect(both).toContain('style="--dx: 1em; --dy: 4em"');

    // Omitted rather than emitted empty, so the theme's `var(--dy, 0px)` applies.
    const one = annotationHtml([annotation({ selector: "#a", dy: "4em", text: "x" })]);
    expect(one).toContain('style="--dy: 4em"');
    expect(one).not.toContain("--dx");

    const none = annotationHtml([annotation({ selector: "#a", text: "x" })]);
    expect(none).not.toContain("style=");
    expect(none).not.toContain("class=");
  });

  test("any CSS length passes through, because nothing here parses one", () => {
    const html = annotationHtml([annotation({ selector: "#a", dx: "calc(-50% + 1em)", text: "x" })]);
    expect(html).toContain("--dx: calc(-50% + 1em)");
  });

  test("the class column reaches the mark, where the styles tab can select it", () => {
    expect(annotationHtml([annotation({ selector: "#a", class: "note", text: "x" })])).toContain('class="note"');
  });

  test("text is block markdown, so a list is a list", () => {
    const html = annotationHtml([annotation({ selector: "#a", text: "**bold** and *it*" })]);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>it</em>");
    // Block mode, unlike a label: a note wants paragraphs.
    expect(html).toContain("<p>");
  });

  test("`\\n` breaks a line here exactly as it does in a label", () => {
    const html = annotationHtml([annotation({ selector: "#a", text: "one\\ntwo" })]);
    expect(html).toContain("one<br />two");
  });

  test("a quote in a selector survives as an attribute", () => {
    // How text enters an attribute, not a guard: `[data-kind="x"]` is an ordinary
    // selector, and an unescaped quote would end the attribute early.
    const html = annotationHtml([annotation({ selector: '[data-kind="x"]', text: "y" })]);
    expect(html).toContain('data-selector="[data-kind=&quot;x&quot;]"');
  });

  test("the list is ordered, and two marks may share a selector", () => {
    const html = annotationHtml([
      annotation({ selector: "#a", text: "first" }),
      annotation({ selector: "#a", text: "second" }),
    ]);
    expect(html.indexOf("first")).toBeLessThan(html.indexOf("second"));
    expect(html.match(/data-selector/g)).toHaveLength(2);
  });
});

// Shape and style are carried, not interpreted (§3.1). `record` is the one shape
// with a renderer and a class of its own; every other shape is a `.node` that
// says which shape it is. A `style` word becomes a class and the theme decides
// what it means — `.invis` is the theme's, not the bagger's.
describe("shape and style reach the DOM as themselves", () => {
  async function frame(dot: string): Promise<string> {
    const model = new DiagramBagger().bag(await new Vizer().render(dot));
    return new LayoutFramer().frame(model);
  }

  test("shape=record is a class, and carries no data-shape", async () => {
    const html = await frame('digraph { r [shape=record label="{a|b}"]; r -> x }');
    expect(html).toContain('id="r" class="record"');
    expect(html).not.toContain('id="r" class="record" data-shape');
  });

  test("every other shape is a .node that names itself in data-shape", async () => {
    const html = await frame("digraph { n [shape=none]; d [shape=box3d]; n -> d }");
    expect(html).toContain('id="n" class="node" data-shape="none"');
    expect(html).toContain('id="d" class="node" data-shape="box3d"');
  });

  test("the default shape says so too, rather than being a special case", async () => {
    // Graphviz resolves the default onto every node, so `box` arrives like any
    // other value. Suppressing it would be a rule the author cannot see.
    const html = await frame("digraph { plain; plain -> other }");
    expect(html).toContain('id="plain" class="node" data-shape="box"');
  });

  test("a style word is a class, one per word", async () => {
    const html = await frame("digraph { g [style=invis]; f [style=\"filled,dashed\"]; g -> f }");
    expect(html).toContain('id="g" class="node invis"');
    expect(html).toContain('id="f" class="node filled dashed"');
  });

  test("the theme is what makes .invis mean hidden", async () => {
    // The bagger never emits `display`. Hiding is the theme's word on the class.
    expect(basicTheme[".invis"]!.display!.value).toBe("none");
  });
});
