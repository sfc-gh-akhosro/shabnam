import { describe, expect, test } from "bun:test";
import { admits, asDocument, asFile, type Book, documentStyles, expand, fileStyles, mixins, painted } from "../src/style/book.ts";
import { priority } from "../src/style/sheet.ts";
import * as T from "../src/types.ts";

import basicTheme from "../theme/basic-theme.json";

// The StyleBook class needs CSSOM, which bun does not have. What is testable
// headless is the interesting half: the source guard, `@apply`, and the files.
// The live sheet and the rows tab are the browser half's job.

/** A book built the way the StyleBook builds one: each style through `admits`,
 *  in order. CSSOM's own verdict is the browser half's. */
function book(styles: T.Style[]): Book {
  const out: Book = new Map();
  for (const style of styles) {
    if (!admits(out, style)) continue;
    out.set(style.selector, (out.get(style.selector) ?? new Map()).set(style.property, style));
  }
  return out;
}

const at =
  (source: T.Source) =>
  (selector: string, property: string, value: string): T.Style => ({ selector, property, value, source });
const theme = at(T.SOURCE.theme);
const dot = at(T.SOURCE.dot);
const user = at(T.SOURCE.user);

describe("the guard — one entry per key, arbitrated by source", () => {
  test("a repeated key is one entry, not two rows", () => {
    const rules = book([theme("#diagram-canvas, svg", "--main-font", "serif"), dot("#diagram-canvas, svg", "--main-font", "Inter")]);
    expect([...rules.get("#diagram-canvas, svg")!.values()]).toEqual([dot("#diagram-canvas, svg", "--main-font", "Inter")]);
  });

  test("a lower source is refused", () => {
    const rules = book([user(".node", "background", "red")]);
    expect(admits(rules, dot(".node", "background", "pink"))).toBe(false);
    expect(admits(rules, theme(".node", "background", "white"))).toBe(false);
  });

  test("an equal or higher source is let in — a second redraw updates what the first derived", () => {
    const rules = book([dot("#lake", "background-color", "pink")]);
    expect(admits(rules, dot("#lake", "background-color", "teal"))).toBe(true);
    expect(admits(rules, user("#lake", "background-color", "red"))).toBe(true);
  });

  test("a key the book has not seen is open to every source", () => {
    expect(admits(book([user(".node", "color", "red")]), theme(".node", "padding", "1em"))).toBe(true);
  });
});

describe("@apply — names only what the book already has", () => {
  test("an unknown name is refused", () => {
    expect(admits(book([]), user(".node", "@apply", ".paper"))).toBe(false);
    expect(admits(book([theme(".paper", "background", "white")]), user(".node", "@apply", ".paper .nowhere"))).toBe(false);
  });

  test("a known name is let in", () => {
    expect(admits(book([theme(".paper", "background", "white")]), user(".node", "@apply", ".paper"))).toBe(true);
  });

  test("expands in place, and the selector's own later properties win", () => {
    const rules = book([
      theme(".paper", "background", "white"),
      theme(".paper", "border-radius", "3px"),
      theme(".node", "@apply", ".paper"),
      theme(".node", "border-radius", "6px"),
      theme(".node", "padding", "1em"),
    ]);
    expect([...expand(rules, ".node")]).toEqual([
      ["background", "white"],
      ["border-radius", "6px"],
      ["padding", "1em"],
    ]);
  });

  test("several names, later name wins", () => {
    const rules = book([
      theme(".paper", "background", "white"),
      theme(".raised", "background", "grey"),
      theme(".raised", "box-shadow", "0 2px 4px"),
      theme(".node", "@apply", ".paper .raised"),
    ]);
    expect(expand(rules, ".node").get("background")).toBe("grey");
    expect(expand(rules, ".node").get("box-shadow")).toBe("0 2px 4px");
  });

  test("a mixin may apply another, and no @apply survives", () => {
    const rules = book([
      theme(".glass", "fill", "var(--glass-background)"),
      theme(".raised", "@apply", ".glass"),
      theme(".raised", "box-shadow", "var(--raised-shadow)"),
      theme(".cluster_", "@apply", ".raised"),
    ]);
    const cluster = expand(rules, ".cluster_");
    expect(cluster.get("fill")).toBe("var(--glass-background)");
    expect(cluster.get("box-shadow")).toBe("var(--raised-shadow)");
    expect(cluster.has("@apply")).toBe(false);
  });

  test("expansion is a read — it never becomes a book entry", () => {
    const rules = book([theme(".paper", "background", "white"), user(".node", "@apply", ".paper")]);
    expect(expand(rules, ".node").get("background")).toBe("white");
    expect([...rules.get(".node")!.keys()]).toEqual(["@apply"]);
  });
});

describe("mixins never reach CSSOM on their own", () => {
  const rules = book([
    theme(".glass", "fill", "var(--glass-background)"),
    theme(".raised", "@apply", ".glass"),
    theme(".cluster_", "@apply", ".raised"),
    theme(".node", "padding", "1em"),
  ]);

  test("whatever an @apply names is a mixin", () => {
    expect([...mixins(rules)].sort()).toEqual([".glass", ".raised"]);
  });

  test("changing a mixin repaints what applies it, and never the mixin", () => {
    expect(painted(rules, ".glass")).toEqual([".cluster_"]);
    expect(painted(rules, ".raised")).toEqual([".cluster_"]);
  });

  test("changing a plain selector repaints only itself", () => {
    expect(painted(rules, ".node")).toEqual([".node"]);
  });
});

describe("the shipped theme", () => {
  const styles = fileStyles(basicTheme as T.StyleFile);

  test("is all source 0", () => {
    for (const style of styles) expect(style.source).toBe(T.SOURCE.theme);
  });

  test("lists its mixins first, so every style is admitted in order", () => {
    expect(book(styles).size).toBe(Object.keys(basicTheme).length);
    expect(asFile([...book(styles).values()].flatMap((own) => [...own.values()]))).toEqual(basicTheme as T.StyleFile);
  });

  test("the four chrome names are mixins, so the theme's `.row` never reaches the chrome", () => {
    const four = mixins(book(styles));
    for (const name of [".paper", ".glass", ".row", ".col"]) expect(four.has(name)).toBe(true);
  });

  test("resolves, mixins and all", () => {
    const rules = book(styles);
    expect(expand(rules, ".node").get("background")).toContain("color-mix(");
    expect(expand(rules, ".cluster_").get("fill")).toBe("var(--glass-background)");
    for (const selector of rules.keys()) expect(expand(rules, selector).has("@apply")).toBe(false);
  });
});

describe("the saved document — your rules, over a named theme", () => {
  const mixed = [
    theme(".node", "background", "white"),
    dot(".node", "border-color", "grey"),
    user(".node", "color", "pink"),
    user("#lake", "color", "red"),
  ];

  test("only source 2 travels; the theme and the DOT are left to regenerate", () => {
    expect(asDocument(mixed)).toEqual({
      theme: "basic-theme.json",
      style: {
        ".node": { color: { value: "pink", source: T.SOURCE.user } },
        "#lake": { color: { value: "red", source: T.SOURCE.user } },
      },
    });
  });

  test("a selector the user never touched leaves no empty husk behind", () => {
    expect(asDocument([theme(".only-theme", "color", "red")]).style).toEqual({});
  });

  test("the whole book serialises as a file, every source kept", () => {
    expect(fileStyles(asFile(mixed))).toEqual(mixed);
  });

  test("a document round-trips: save, read back, same rules", () => {
    const saved = asDocument(mixed);
    expect(asDocument(documentStyles(saved))).toEqual(saved);
  });

  test("a bare file still reads — what an exported page carries", () => {
    const file: T.StyleFile = { ".node": { padding: { value: "1em", source: T.SOURCE.user } } };
    expect(documentStyles(file)).toEqual([user(".node", "padding", "1em")]);
  });
});

describe("!important — a priority, not part of the value", () => {
  test("a trailing !important is lifted out of the value", () => {
    expect(priority("0!important")).toEqual(["0", "important"]);
    expect(priority("0 !important")).toEqual(["0", "important"]);
    expect(priority("0 ! important")).toEqual(["0", "important"]);
    expect(priority("1em 2em !IMPORTANT")).toEqual(["1em 2em", "important"]);
  });

  test("a plain value is handed back untouched, with no priority", () => {
    expect(priority("0")).toEqual(["0", ""]);
    expect(priority("var(--main-font)")).toEqual(["var(--main-font)", ""]);
  });

  test("the word only counts at the end", () => {
    expect(priority('"!important"')).toEqual(['"!important"', ""]);
    expect(priority("important")).toEqual(["important", ""]);
  });

  test("the book keeps the text as typed, `!important` and all", () => {
    expect(book([user(".record", "margin", "0 !important")]).get(".record")!.get("margin")!.value).toBe("0 !important");
  });
});
