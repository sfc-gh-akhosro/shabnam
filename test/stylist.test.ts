import { describe, expect, test } from "bun:test";
import { applyBound, expand, priority, resolve, serialize } from "../src/stylist/sheet.ts";
import {
  asDocument,
  asFile,
  documentEntries,
  fileEntries,
  REFUSED,
  themeOf,
  writeRule,
} from "../src/stylist/stylist.ts";

import basicTheme from "../theme/basic-theme.json";
import * as T from "../src/types.ts";

// The Stylist class itself needs CSSOM, which bun does not have. What is
// testable headless is the whole interesting half: the book, the source guard,
// and @apply. The live sheet and the rows tab are the browser half's job.

/** A book, built the way the Stylist builds one — through the guard. */
function book(entries: Iterable<[string, string, string, T.Source]>): T.StyleRules {
  const rules: T.StyleRules = new Map();
  let counter = 1;
  for (const [selector, property, value, source] of entries) {
    if (writeRule(rules, selector, property, value, source, counter) === counter) counter += 1;
  }
  return rules;
}

const theme = (selector: string, property: string, value: string) =>
  [selector, property, value, T.SOURCE.theme] as [string, string, string, T.Source];
const dot = (selector: string, property: string, value: string) =>
  [selector, property, value, T.SOURCE.dot] as [string, string, string, T.Source];
const user = (selector: string, property: string, value: string) =>
  [selector, property, value, T.SOURCE.user] as [string, string, string, T.Source];

describe("the book — one entry per key, arbitrated by source", () => {
  test("a repeated key is one entry, not two rows", () => {
    const rules = book([theme(":root, svg", "--main-font", "serif"), dot(":root, svg", "--main-font", "Inter")]);
    expect([...rules.get(":root, svg")!.keys()]).toEqual(["--main-font"]);
  });

  test("an accepted overwrite keeps the entry's id", () => {
    const rules = book([theme(".node", "background", "white"), dot(".node", "background", "pink")]);
    const entry = rules.get(".node")!.get("background")!;
    expect(entry).toEqual({ value: "pink", id: 1, source: T.SOURCE.dot });
  });

  test("a lower source is refused, and changes nothing", () => {
    const rules = book([user(".node", "background", "red")]);
    const before = { ...rules.get(".node")!.get("background")! };

    expect(writeRule(rules, ".node", "background", "pink", T.SOURCE.dot, 9)).toBe(REFUSED);
    expect(writeRule(rules, ".node", "background", "white", T.SOURCE.theme, 9)).toBe(REFUSED);
    expect(rules.get(".node")!.get("background")).toEqual(before);
  });

  test("the dot may overwrite the theme, but not the other way round", () => {
    const rules = book([dot(".edge", "stroke", "grey")]);
    expect(writeRule(rules, ".edge", "stroke", "black", T.SOURCE.theme, 9)).toBe(REFUSED);
    expect(writeRule(rules, ".edge", "stroke", "blue", T.SOURCE.dot, 9)).toBe(1);
    expect(rules.get(".edge")!.get("stroke")!.value).toBe("blue");
  });

  test("an equal source overwrites — a second redraw updates what the first derived", () => {
    const rules = book([dot("#lake", "background-color", "pink"), dot("#lake", "background-color", "teal")]);
    expect(rules.get("#lake")!.get("background-color")).toEqual({ value: "teal", id: 1, source: T.SOURCE.dot });
  });

  test("a refused write does not invent a selector", () => {
    const rules = book([user(".node", "color", "red")]);
    writeRule(rules, ".nowhere", "color", "blue", T.SOURCE.dot, 2);
    expect(rules.has(".nowhere")).toBe(true);

    // ... but a refusal on an existing key leaves the book exactly as it was.
    const shape = JSON.stringify(asFile(rules));
    writeRule(rules, ".node", "color", "blue", T.SOURCE.dot, 3);
    expect(JSON.stringify(asFile(rules))).toBe(shape);
  });

  test("no entry ever carries the id a row uses for `not in the book`", () => {
    const rules = book([theme(".a", "color", "red"), dot(".b", "color", "blue"), user(".c", "color", "green")]);
    for (const properties of rules.values()) {
      for (const entry of properties.values()) expect(entry.id).not.toBe(REFUSED);
    }
  });

  test("a file round-trips through the book, order and source kept", () => {
    const file: T.StyleFile = {
      ":root, svg": { "--primary-color": { value: "red", source: 0 } },
      ".node": { "@apply": { value: ".paper", source: 0 }, padding: { value: "1em", source: 2 } },
    };
    const rules = book(fileEntries(file));
    expect(asFile(rules)).toEqual(file);
    expect([...rules.keys()]).toEqual([":root, svg", ".node"]);
  });
});

describe("@apply — expansion over the book", () => {
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

  test("nested @apply resolves, and no @apply survives", () => {
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

  test("an undefined @apply name throws", () => {
    const rules = book([user(".node", "@apply", ".nowhere")]);
    expect(() => resolve(rules)).toThrow("@apply .nowhere: not defined");
  });

  test("an @apply cycle throws", () => {
    const rules = book([user(".a", "@apply", ".b"), user(".b", "@apply", ".a")]);
    expect(() => resolve(rules)).toThrow("@apply cycle:");
  });

  test("applyBound spots the selectors a row edit must re-feed", () => {
    const rules = book([theme(".paper", "background", "white"), theme(".node", "@apply", ".paper")]);
    expect(applyBound(".paper", rules)).toBe(true);
    expect(applyBound(".node", rules)).toBe(false);
  });

  test("the shipped theme is a source-0 book, and it resolves, mixins and all", () => {
    const rules = book(fileEntries(basicTheme as T.StyleFile));
    for (const properties of rules.values()) {
      for (const entry of properties.values()) expect(entry.source).toBe(T.SOURCE.theme);
    }

    const resolved = resolve(rules);
    expect(resolved.get(".node")!.get("background")).toContain("color-mix(");
    expect(resolved.get(".cluster_")!.get("fill")).toBe("var(--glass-background)");
    expect(resolved.get(":root, svg")!.get("--primary-color")).toBe("#0b3d91");
    for (const own of resolved.values()) expect(own.has("@apply")).toBe(false);
  });

  test("serialize is the one place a rule becomes text", () => {
    const css = serialize(book([
      theme(".paper", "background", "white"),
      user(".node", "@apply", ".paper"),
      user(".node", "padding", "1em"),
    ]));
    expect(css).toContain(".node {\n  background: white;\n  padding: 1em;\n}");
    expect(css).not.toContain("@apply");
  });
});

describe("the saved document — your rules, over a named theme", () => {
  const mixed = () =>
    book([
      theme(".node", "background", "white"),
      dot(".node", "border-color", "grey"),
      user(".node", "background", "pink"),
      user("#lake", "color", "red"),
    ]);

  test("only source 2 travels; the theme and the DOT are left to regenerate", () => {
    const saved = asDocument("basic-theme.json", mixed());
    expect(saved.style).toEqual({
      ".node": { background: { value: "pink", source: T.SOURCE.user } },
      "#lake": { color: { value: "red", source: T.SOURCE.user } },
    });
  });

  test("the document names the theme its rules were laid over", () => {
    expect(asDocument("basic-theme.json", mixed()).theme).toBe("basic-theme.json");
  });

  test("a selector the user never touched leaves no empty husk behind", () => {
    const saved = asDocument("basic-theme.json", book([theme(".only-theme", "color", "red")]));
    expect(saved.style).toEqual({});
  });

  test("the whole book still serialises when no source is asked for", () => {
    // The export seed wants every entry, theme included — it has no theme file
    // to lean on when it paints (§Files).
    expect(Object.keys(asFile(mixed()))).toEqual([".node", "#lake"]);
    expect(asFile(mixed())[".node"]).toHaveProperty("border-color");
  });

  test("a document round-trips: save, read back, same rules", () => {
    const saved = asDocument("basic-theme.json", mixed());
    const reread = book(documentEntries(saved));
    expect(asDocument("basic-theme.json", reread).style).toEqual(saved.style);
  });

  test("a bare file still reads, and reports the founding theme", () => {
    // What an exported page carries. No `theme` key, so it is not a document.
    const file: T.StyleFile = { ".node": { padding: { value: "1em", source: T.SOURCE.user } } };
    expect([...documentEntries(file)]).toEqual([[".node", "padding", "1em", T.SOURCE.user]]);
    expect(themeOf(file)).toBe("basic-theme.json");
    expect(themeOf(asDocument("other.json", mixed()))).toBe("other.json");
  });
});

describe("\!important — a priority, not part of the value", () => {
  test("a trailing \!important is lifted out of the value", () => {
    expect(priority("0\!important")).toEqual(["0", "important"]);
    expect(priority("0 \!important")).toEqual(["0", "important"]);
    expect(priority("0 \! important")).toEqual(["0", "important"]);
    expect(priority("1em 2em \!IMPORTANT")).toEqual(["1em 2em", "important"]);
  });

  test("a plain value is handed back untouched, with no priority", () => {
    expect(priority("0")).toEqual(["0", ""]);
    expect(priority("var(--main-font)")).toEqual(["var(--main-font)", ""]);
  });

  test("the word only counts at the end", () => {
    // A content string may say it, and a font may be named it. Neither is a
    // priority, and neither may be eaten.
    expect(priority('"\!important"')).toEqual(['"\!important"', ""]);
    expect(priority("important")).toEqual(["important", ""]);
  });

  test("the book keeps the text as typed, so serialised CSS still carries it", () => {
    // `serialize` feeds Export HTML and Save PNG, where the declaration is text
    // again and `\!important` belongs in it. Only the CSSOM path splits.
    expect(serialize(book([user(".record", "margin", "0 \!important")]))).toContain(
      "margin: 0 \!important;",
    );
  });
});
