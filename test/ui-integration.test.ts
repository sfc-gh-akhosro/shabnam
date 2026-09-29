import { readdirSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { LayoutFramer } from "../src/paint/layout-framer.ts";
import { GraphvizLayout } from "../src/layout/graphviz-layout.ts";
import { DotReader } from "../src/read/dot-reader.ts";
import { bag } from "./bag.ts";
import type { Note, Style } from "../src/types.ts";
import { asFile } from "../src/style/book.ts";
import { annotationHtml } from "../src/diagram/notes.ts";
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

/** A note with every field but the ones a test cares about left blank. */
const note = (fields: Partial<Note> = {}): Note => ({ selector: "", dx: "", dy: "", class: "", text: "", ...fields });

const layout = await GraphvizLayout.load();
const framer = new LayoutFramer();

function drawn(dot: string): string {
  const reader = new DotReader(dot);
  return framer.frame(reader.model(), layout.layout(reader.points()));
}

describe("UI & Workbench Integration Suite", () => {
  test("theme/ ships exactly one theme, and no CSS file", () => {
    expect(readdirSync("theme").sort()).toEqual(["basic-theme.json"]);
  });

  test("Bare-bone DOT derives nothing — tokens are the theme's", () => {
    expect([...bag(new DotReader(BARE_BONE_DOT).styles()).keys()]).toEqual([]);
  });

  test("shape=record correctly parses and builds nested flex structure", () => {
    const html = drawn(RECORD_DOT);

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

  test("LayoutFramer generates pure semantic HTML with zero inline styles", () => {
    const html = drawn(BARE_BONE_DOT);

    expect(html).toContain('<div class="diagram">');
    expect(html).toContain('<div class="rank">');
    expect(html).toContain('id="a" class="node cluster_source"');
    expect(html).toContain('id="b" class="node cluster_source"');
    expect(html).toContain('id="c" class="node"');
    expect(html).not.toContain("style=");
  });

  test("a derived bag never invents a margin", async () => {
    const FIXTURE = new URL("../research-lab/example-1.dot", import.meta.url).pathname;
    const derived = bag(new DotReader(await Bun.file(FIXTURE).text()).styles());

    expect(derived.size).toBe(0);
    for (const [, properties] of derived) {
      for (const property of properties.keys()) {
        expect(property).not.toStartWith("margin");
      }
    }
  });

  test("The export seed carries the DOT, the script, the whole book, and the notes", () => {
    const text = { dot: BARE_BONE_DOT, script: "console.log('hello');" };
    const styles: Style[] = [
      { selector: ".node", property: "background", value: "red", source: 0 },
      { selector: ".node", property: "color", value: "white", source: 1 },
      { selector: ".node", property: "@apply", value: ".glass", source: 2 },
      { selector: "#a", property: "border-width", value: "2px", source: 2 },
    ];
    const notes: Note[] = [note({ selector: "#a", dy: "4em", text: "note" })];

    const parsed = JSON.parse(JSON.stringify({ ...text, styles: asFile(styles), notes }));

    expect(parsed.dot).toBe(BARE_BONE_DOT);
    expect(parsed.script).toBe("console.log('hello');");
    // An export paints what you see, so every source travels.
    expect(parsed.styles).toEqual({
      ".node": {
        background: { value: "red", source: 0 },
        color: { value: "white", source: 1 },
        "@apply": { value: ".glass", source: 2 },
      },
      "#a": { "border-width": { value: "2px", source: 2 } },
    });
    // The rows travel, not the marks: the exported page derives its own HTML.
    expect(parsed.notes).toHaveLength(1);
    expect(parsed.notes[0].selector).toBe("#a");
    expect(parsed.notes[0].text).toBe("note");
    expect(parsed.theme).toBeUndefined();
  });
});

// The annotation rows are the model and the mark is derived from them (§4). This
// is that derivation, which is the only direction there is.
describe("an annotation row becomes a mark", () => {
  test("selector and text are the gate, and a half-filled row emits nothing", () => {
    // Not politeness: `querySelectorAll("")` throws, so a row with no selector
    // would take the next `place()` down with it.
    expect(annotationHtml([note({ text: "orphan" })])).toBe("");
    expect(annotationHtml([note({ selector: "#a" })])).toBe("");
    expect(annotationHtml([note()])).toBe("");
    expect(annotationHtml([note({ selector: "#a", text: "both" })])).toContain("both");
  });

  test("an offset is a style custom property, and a blank one is left out", () => {
    const both = annotationHtml([note({ selector: "#a", dx: "1em", dy: "4em", text: "x" })]);
    expect(both).toContain('style="--dx: 1em; --dy: 4em"');

    // Omitted rather than emitted empty, so the theme's `var(--dy, 0px)` applies.
    const one = annotationHtml([note({ selector: "#a", dy: "4em", text: "x" })]);
    expect(one).toContain('style="--dy: 4em"');
    expect(one).not.toContain("--dx");

    const none = annotationHtml([note({ selector: "#a", text: "x" })]);
    expect(none).not.toContain("style=");
    expect(none).not.toContain("class=");
  });

  test("any CSS length passes through, because nothing here parses one", () => {
    const html = annotationHtml([note({ selector: "#a", dx: "calc(-50% + 1em)", text: "x" })]);
    expect(html).toContain("--dx: calc(-50% + 1em)");
  });

  test("the class column reaches the mark, where the styles tab can select it", () => {
    expect(annotationHtml([note({ selector: "#a", class: "note", text: "x" })])).toContain('class="note"');
  });

  test("text is block markdown, so a list is a list", () => {
    const html = annotationHtml([note({ selector: "#a", text: "**bold** and *it*" })]);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>it</em>");
    // Block mode, unlike a label: a note wants paragraphs.
    expect(html).toContain("<p>");
  });

  test("`\\n` breaks a line here exactly as it does in a label", () => {
    const html = annotationHtml([note({ selector: "#a", text: "one\\ntwo" })]);
    expect(html).toContain("one<br />two");
  });

  test("a quote in a selector survives as an attribute", () => {
    // How text enters an attribute, not a guard: `[data-kind="x"]` is an ordinary
    // selector, and an unescaped quote would end the attribute early.
    const html = annotationHtml([note({ selector: '[data-kind="x"]', text: "y" })]);
    expect(html).toContain('data-selector="[data-kind=&quot;x&quot;]"');
  });

  test("the list is ordered, and two marks may share a selector", () => {
    const html = annotationHtml([
      note({ selector: "#a", text: "first" }),
      note({ selector: "#a", text: "second" }),
    ]);
    expect(html.indexOf("first")).toBeLessThan(html.indexOf("second"));
    expect(html.match(/data-selector/g)).toHaveLength(2);
  });
});

// Shape and style are carried, not interpreted (§3.1). `record` is the one shape
// with a renderer and a class of its own; every other shape is a `.node` that
// says which shape it is. A `style` word becomes a class and the theme decides
// what it means — `.invis` is the theme's, not the reader's.
describe("shape and style reach the DOM as themselves", () => {
  test("shape=record is a class, and carries no data-shape", () => {
    const html = drawn('digraph { r [shape=record label="{a|b}"]; r -> x }');
    expect(html).toContain('id="r" class="record"');
    expect(html).not.toContain('id="r" class="record" data-shape');
  });

  test("every other shape is a .node that names itself in data-shape", () => {
    const html = drawn("digraph { n [shape=none]; d [shape=box3d]; n -> d }");
    expect(html).toContain('id="n" class="node" data-shape="none"');
    expect(html).toContain('id="d" class="node" data-shape="box3d"');
  });

  test("the default shape says so too, rather than being a special case", () => {
    const html = drawn("digraph { plain; plain -> other }");
    expect(html).toContain('id="plain" class="node" data-shape="box"');
  });

  test("a style word is a class, one per word", () => {
    const html = drawn('digraph { g [style=invis]; f [style="filled,dashed"]; g -> f }');
    expect(html).toContain('id="g" class="node invis"');
    expect(html).toContain('id="f" class="node filled dashed"');
  });

  test("the theme is what makes .invis mean hidden", () => {
    expect(basicTheme[".invis"]!.display!.value).toBe("none");
  });
});
