import { describe, expect, test } from "bun:test";
import { applyBound, expand, resolve, serialize } from "../src/stylist/sheet.ts";
import { asFile, fileEntries, REFUSED, writeRule } from "../src/stylist/stylist.ts";

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
