import { readdirSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { DiagramBagger } from "../src/diagram/diagram-bagger.ts";
import { CssBagger } from "../src/diagram/css-bagger.ts";
import { LayoutFramer } from "../src/diagram/layout-framer.ts";
import { NodeSheller } from "../src/diagram/node-sheller.ts";
import { EdgeDrawer } from "../src/diagram/edge-drawer.ts";
import { Vizer } from "../src/diagram/vizer.ts";
import type { StyleRow, TabText } from "../src/types.ts";
import { SOURCE } from "../src/types.ts";
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

  test("The export seed carries the three text tabs and the whole book, sourced", () => {
    const text: TabText = {
      dot: BARE_BONE_DOT,
      action: "console.log('hello');",
      annotation: "<div>Note</div>",
    };
    const rows: StyleRow[] = [
      { selector: ".node", property: "background", value: "red", id: 1, source: SOURCE.theme },
      { selector: ".node", property: "color", value: "white", id: 2, source: SOURCE.dot },
      { selector: ".node", property: "@apply", value: ".glass", id: 3, source: SOURCE.user },
      { selector: "#a", property: "border-width", value: "2px", id: 4, source: SOURCE.user },
    ];

    const parsed = JSON.parse(JSON.stringify({ ...text, styles: bookFile(rows) }));

    expect(parsed.dot).toBe(BARE_BONE_DOT);
    expect(parsed.action).toBe("console.log('hello');");
    expect(parsed.annotation).toBe("<div>Note</div>");
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
    expect(parsed.theme).toBeUndefined();
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
