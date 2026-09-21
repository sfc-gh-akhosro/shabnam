// Current-line completer. Four slots: selector → marker → property → value.

import type * as T from "../types.ts";

const CSS_MARKERS = ["{", ".", "#", ">", ",", " "];
const DOT_MARKERS = ["[", "{", "=", ";", ","];

const CSS_PROPERTIES = [
  "@apply",
  "color",
  "background",
  "background-color",
  "border",
  "border-color",
  "border-width",
  "border-radius",
  "box-shadow",
  "opacity",
  "padding",
  "margin",
  "margin-top",
  "font-family",
  "font-size",
  "transform",
  "animation",
  "--connector-style",
  "--connector-type",
  "--horizontal-gap",
  "--vertical-gap",
  "--primary-color",
  "--secondary-color",
  "--accent-color",
];

const DOT_KEYWORDS = ["digraph", "graph", "subgraph", "node", "edge", "rankdir"];
const DOT_ATTRS = ["label", "shape", "rankdir", "fillcolor", "color", "style", "caption", "icon", "shell", "splines"];

const CONNECTORS = ["spline", "ortho", "line"];
const RANKDIRS = ["LR", "RL", "TB", "BT"];
const MIXINS = [".glass", ".paper", ".warning", ".tag", ".annotation", ".button", ".raised", ".outlined", ".flat"];

const COLOR_PROPS = new Set([
  "color",
  "background",
  "background-color",
  "border-color",
  "--primary-color",
  "--secondary-color",
  "--accent-color",
  "fillcolor",
]);

export function suggestions(tab: T.TabId, line: string, model?: T.DiagramModel): T.Slot {
  if (tab === "dot") return dotSlot(line, model);
  if (tab === "annotation") return annotationSlot(line, model);
  if (tab === "action") {
    return { kind: "selector", items: filter(["document", "console", "shabnam-canvas"], line.trim()), prefix: line.trim() };
  }
  return cssSlot(line, model);
}

function cssSlot(line: string, model?: T.DiagramModel): T.Slot {
  const open = Math.max(line.lastIndexOf("{"), line.lastIndexOf("["));
  if (open < 0) {
    if (/[.#\w-]$/.test(line) && /[\s,]$/.test(line.slice(0, -1) + " ") === false && /\s/.test(line.trimStart()) === false) {
      const prefix = lastToken(line);
      return { kind: "selector", items: filter(cssSelectors(model), prefix), prefix };
    }
    if (line.trim() !== "" && !line.includes("{")) {
      return { kind: "marker", items: CSS_MARKERS, prefix: "" };
    }
    const prefix = lastToken(line);
    return { kind: "selector", items: filter(cssSelectors(model), prefix), prefix };
  }

  const after = line.slice(open + 1);
  if (!/[:/=]/.test(after)) {
    const prefix = lastToken(after);
    return { kind: "property", items: filter(CSS_PROPERTIES, prefix), prefix };
  }

  const prop = after.split(/[:/=]/)[0]!.trim();
  const prefix = lastToken(after);
  if (COLOR_PROPS.has(prop)) {
    return { kind: "value", items: [], input: "color", prefix };
  }
  const list = prop === "@apply" || prop.includes("apply") ? MIXINS
    : prop.includes("connector") ? CONNECTORS
    : [];
  return { kind: "value", items: filter(list, prefix), input: "text", prefix };
}

function dotSlot(line: string, model?: T.DiagramModel): T.Slot {
  const open = Math.max(line.lastIndexOf("["), line.lastIndexOf("{"));
  if (open < 0) {
    const prefix = lastToken(line);
    const names = [...DOT_KEYWORDS, ...(model?.nodes.map((n) => n.id) ?? [])];
    if (line.trim() !== "" && /\w$/.test(line) === false) {
      return { kind: "marker", items: DOT_MARKERS, prefix: "" };
    }
    return { kind: "selector", items: filter(names, prefix), prefix };
  }
  const after = line.slice(open + 1);
  if (!after.includes("=")) {
    const prefix = lastToken(after);
    return { kind: "property", items: filter(DOT_ATTRS, prefix), prefix };
  }
  const prop = after.split("=")[0]!.trim();
  const prefix = lastToken(after);
  if (COLOR_PROPS.has(prop)) return { kind: "value", items: [], input: "color", prefix };
  const list = prop === "rankdir" ? RANKDIRS : prop === "splines" ? CONNECTORS : [];
  return { kind: "value", items: filter(list, prefix), input: "text", prefix };
}

function annotationSlot(line: string, model?: T.DiagramModel): T.Slot {
  const ids = model?.nodes.map((n) => n.id) ?? [];
  const prefix = lastToken(line);
  return { kind: "value", items: filter(ids, prefix), prefix };
}

function cssSelectors(model?: T.DiagramModel): string[] {
  const found = new Set<string>([":root", ".diagram", ".column", ".node", ".edge", ".cluster", ...MIXINS]);
  if (typeof document !== "undefined") {
    const canvas = document.getElementById("shabnam-canvas");
    if (canvas) {
      for (const el of canvas.querySelectorAll<HTMLElement | SVGElement>("*")) {
        if (el.id && !el.id.startsWith("shabnam-")) found.add(`#${el.id}`);
        for (const c of el.classList) {
          if (!c.startsWith("shabnam-")) found.add(`.${c}`);
        }
      }
    }
  }
  for (const n of model?.nodes ?? []) found.add(`#${n.id}`);
  for (const c of model?.clusters ?? []) found.add(`.${c.name}`);
  return [...found].sort((a, b) => a.localeCompare(b));
}

function lastToken(text: string): string {
  const m = text.match(/[^\s,;:={}\[\]>]*$/);
  return m ? m[0]! : "";
}

function filter(items: string[], prefix: string): string[] {
  if (!prefix) return items;
  const p = prefix.toLowerCase();
  return items.filter((i) => i.toLowerCase().startsWith(p) || i.toLowerCase().includes(p));
}
