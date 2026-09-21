import { describe, expect, test } from "bun:test";
import { suggestions } from "../src/workbench/complete.ts";

describe("current-line completer", () => {
  test("empty CSS line offers selectors", () => {
    const slot = suggestions("style", "");
    expect(slot.kind).toBe("selector");
    expect(slot.items).toContain(":root");
    expect(slot.items).toContain(".node");
  });

  test("after a selector offers markers", () => {
    const slot = suggestions("style", ".node ");
    expect(slot.kind).toBe("marker");
    expect(slot.items).toContain("{");
  });

  test("inside a rule offers properties", () => {
    const slot = suggestions("style", ".node { col");
    expect(slot.kind).toBe("property");
    expect(slot.items).toContain("color");
    expect(slot.prefix).toBe("col");
  });

  test("color property offers a color input", () => {
    const slot = suggestions("style", ".node { color: ");
    expect(slot.kind).toBe("value");
    expect(slot.input).toBe("color");
  });

  test("DOT after [ offers attributes", () => {
    const slot = suggestions("dot", "core [lab");
    expect(slot.kind).toBe("property");
    expect(slot.items).toContain("label");
  });
});
