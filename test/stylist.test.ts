import { describe, expect, test } from "bun:test";
import { applyBound, resolve, serialize } from "../src/stylist/sheet.ts";
import { asFile, asRules } from "../src/stylist/stylist.ts";

import basicTheme from "../theme/basic-theme.json";
import type { StyleFile } from "../src/types.ts";

// The Stylist class itself needs CSSOM, which bun does not have. What is
// testable headless is the whole interesting half: the map, and @apply.

describe("Stylist rules — @apply and the map", () => {
  test("@apply expands in place, and the selector's own later properties win", () => {
    const rules = asRules({
      ".paper": { background: "white", "border-radius": "3px" },
      ".node": { "@apply": ".paper", "border-radius": "6px", padding: "1em" },
    });

    const node = resolve(rules).get(".node")!;
    expect([...node]).toEqual([
      ["background", "white"],
      ["border-radius", "6px"],
      ["padding", "1em"],
    ]);
  });

  test("@apply takes several names, later name wins", () => {
    const rules = asRules({
      ".paper": { background: "white" },
      ".raised": { background: "grey", "box-shadow": "0 2px 4px" },
      ".node": { "@apply": ".paper .raised" },
    });

    expect(resolve(rules).get(".node")!.get("background")).toBe("grey");
    expect(resolve(rules).get(".node")!.get("box-shadow")).toBe("0 2px 4px");
  });

  test("nested @apply resolves", () => {
    const rules = asRules({
      ".glass": { fill: "var(--glass-background)" },
      ".raised": { "@apply": ".glass", "box-shadow": "var(--raised-shadow)" },
      ".cluster_": { "@apply": ".raised" },
    });

    const cluster = resolve(rules).get(".cluster_")!;
    expect(cluster.get("fill")).toBe("var(--glass-background)");
    expect(cluster.get("box-shadow")).toBe("var(--raised-shadow)");
    expect(cluster.has("@apply")).toBe(false);
  });

  test("an undefined @apply name throws", () => {
    const rules = asRules({ ".node": { "@apply": ".nowhere" } });
    expect(() => resolve(rules)).toThrow("@apply .nowhere: not defined");
  });

  test("an @apply cycle throws", () => {
    const rules = asRules({
      ".a": { "@apply": ".b" },
      ".b": { "@apply": ".a" },
    });
    expect(() => resolve(rules)).toThrow("@apply cycle:");
  });

  test("applyBound spots the selectors a row edit must re-feed", () => {
    const rules = asRules({
      ".paper": { background: "white" },
      ".node": { "@apply": ".paper" },
    });
    expect(applyBound(".paper", rules)).toBe(true);
    expect(applyBound(".node", rules)).toBe(false);
  });

  test("the shipped theme resolves, mixins and all", () => {
    const resolved = resolve(asRules(basicTheme as StyleFile));
    expect(resolved.get(".node")!.get("background")).toContain("color-mix(");
    expect(resolved.get(".cluster_")!.get("fill")).toBe("var(--glass-background)");
    expect(resolved.get(":root, svg")!.get("--primary-color")).toBe("#0b3d91");
    for (const own of resolved.values()) expect(own.has("@apply")).toBe(false);
  });

  test("a file round-trips through the map, order kept", () => {
    const file: StyleFile = {
      ":root, svg": { "--primary-color": "red" },
      ".node": { "@apply": ".paper", padding: "1em" },
    };
    expect(asFile(asRules(file))).toEqual(file);
    expect([...asRules(file).keys()]).toEqual([":root, svg", ".node"]);
  });

  test("serialize is the one place a rule becomes text", () => {
    const css = serialize(asRules({
      ".paper": { background: "white" },
      ".node": { "@apply": ".paper", padding: "1em" },
    }));
    expect(css).toContain(".node {\n  background: white;\n  padding: 1em;\n}");
    expect(css).not.toContain("@apply");
  });
});
