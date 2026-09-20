// Model → Base CSS (§3.2). Graphviz has already resolved `node [...]` /
// `edge [...]` defaults onto every object, so we recover them statistically:
// the most common value wins, ties break on the lexicographically smallest, and
// identical input therefore produces byte-identical output.
//
// When a DOT diagram is bare-bone (no presentation overrides), derived CSS
// produces ONLY the `:root` variables block, leaving all presentation and
// structure to theme.css.

import type * as T from "../types.ts";
import { AXES, bucket, calculateStep } from "./layout-framer.ts";

// Graphviz attribute → CSS property, for the HTML layer.
const ATTR_CSS: T.AttrCss = new Map([
  ["bgcolor", "background-color"],
  ["fillcolor", "background-color"],
  ["color", "border-color"],
  ["fontname", "font-family"],
  ["fontsize", "font-size"],
  ["penwidth", "border-width"],
  ["width", "width"],
  ["height", "height"],
]);

// The same bags, translated for the SVG layer.
const ATTR_SVG: T.AttrCss = new Map([
  ["color", "stroke"],
  ["penwidth", "stroke-width"],
]);

// Graphviz measures these in points; CSS needs to be told.
const ATTR_UNIT = new Map([
  ["fontsize", "pt"],
  ["penwidth", "pt"],
  ["width", "in"],
  ["height", "in"],
]);

// The keys whose CSS property inherits down the DOM.
const ATTR_INHERITS = new Set(["fontname", "fontsize"]);

// The `:root` variables extracted from the DOT model on each Redraw.
function preamble(model: T.DiagramModel, nodeBag: Bag, edgeBag: Bag): string {
  const primaryColor =
    model.attrs.get("bgcolor") ??
    model.attrs.get("fillcolor") ??
    nodeBag.get("fillcolor") ??
    nodeBag.get("bgcolor") ??
    "blue";

  const secondaryColor =
    nodeBag.get("color") ??
    model.nodes.find((n) => n.attrs.has("color"))?.attrs.get("color") ??
    "green";

  const accentColor =
    edgeBag.get("color") ??
    model.edges.find((e) => e.attrs.has("color"))?.attrs.get("color") ??
    "orange";

  const mainFont =
    nodeBag.get("fontname") ??
    model.nodes.find((n) => n.attrs.has("fontname"))?.attrs.get("fontname") ??
    "sans-serif";

  const titleFont =
    model.attrs.get("fontname") ??
    model.clusters.find((c) => c.attrs.has("fontname"))?.attrs.get("fontname") ??
    mainFont;

  return `:root {
  --primary-color: ${primaryColor};
  --secondary-color: ${secondaryColor};
  --accent-color: ${accentColor};

  --main-font: ${mainFont};
  --title-font: ${titleFont};
  --base-font-size: 14px;

  --horizontal-gap: 2em;
  --vertical-gap: 2em;
  --connector-style: ${model.attrs.get("splines") ?? "spline"};

  --raised-shadow: 0 6px 12px lightgrey;
  --flat-shadow: 0 0 2px lightgrey;
}`;
}

type Bag = Map<string, string>;

export class CssBagger implements T.CssBagger {
  bag(model: T.DiagramModel): string {
    const graphBag = pick(model.attrs);
    const nodeBag = mode(model.nodes.map((node) => node.attrs));
    const edgeBag = mode(model.edges.map((edge) => edge.attrs));
    const clusterBags = new Map<string, Bag>();
    const granted = new Map<string, Bag>();

    const graphRules = rules(".diagram", graphBag, 0);
    const nodeRules = rules(".node", inheriting(nodeBag, graphBag), 0);
    const clusterRules = roots(model).flatMap((c) =>
      this.cluster(c, model, nodeBag, clusterBags, granted, 0),
    );
    const nodeOverrideRules = this.nodeOverrides(model, nodeBag, clusterBags);
    const positionRules = this.nodePositionMargins(model);
    const edgeRules = rules(".edge", edgeBag, 0, [], ATTR_SVG);
    const edgeOverrideRules = model.edges.flatMap((edge) =>
      rules(`#${edge.id}`, differing(edge.attrs, edgeBag), 0, [], ATTR_SVG),
    );

    const explicitRules = [
      ...graphRules,
      ...nodeRules,
      ...clusterRules,
      ...nodeOverrideRules,
      ...positionRules,
      ...edgeRules,
      ...edgeOverrideRules,
    ];

    if (explicitRules.length === 0) {
      return preamble(model, nodeBag, edgeBag);
    }

    return [preamble(model, nodeBag, edgeBag), "", ...explicitRules].join("\n");
  }

  private cluster(
    cluster: T.Cluster,
    model: T.DiagramModel,
    inherited: Bag,
    bags: Map<string, Bag>,
    granted: Map<string, Bag>,
    depth: number,
  ): string[] {
    const members = cluster.nodes.map((id) => nodeOf(model, id));
    const held = merge(inherited, shared(members.map((node) => granted.get(node.id) ?? new Map())));
    const own = unanimous(members.map((node) => node.attrs), held);
    bags.set(cluster.name, own);
    for (const node of members) granted.set(node.id, merge(granted.get(node.id) ?? new Map(), own));

    if (own.size === 0 && cluster.clusters.length === 0) {
      return [];
    }

    const inner = [
      ...rules("&.node", own, depth + 1),
      ...cluster.clusters.flatMap((name) =>
        this.cluster(clusterOf(model, name), model, merge(inherited, own), bags, granted, depth + 1),
      ),
    ];
    if (inner.length === 0) return [];
    const selector = depth === 0 ? `.${cluster.name}` : `&.${cluster.name}`;
    return rules(selector, new Map(), depth, inner);
  }

  private nodeOverrides(model: T.DiagramModel, nodeBag: Bag, bags: Map<string, Bag>): string[] {
    return model.nodes.flatMap((node) => {
      const inherited = node.classes.reduce((bag, cls) => merge(bag, bags.get(cls)!), nodeBag);
      return rules(`#${node.id}`, differing(node.attrs, inherited), 0);
    });
  }

  private nodePositionMargins(model: T.DiagramModel): string[] {
    const axes = AXES.get(model.rankdir) ?? AXES.get("TB")!;
    const columns = bucket(model.nodes, axes);
    for (const column of columns) {
      column.sort((a, b) => (axes.within(a) - axes.within(b)) * axes.inside);
    }

    const step = calculateStep(model.nodes, axes);
    const isHorizontal = model.rankdir === "LR" || model.rankdir === "RL";

    const topAnchor = isHorizontal
      ? Math.max(...model.nodes.map((n) => n.y))
      : Math.min(...model.nodes.map((n) => n.x));

    const marginRules: string[] = [];

    for (const column of columns) {
      for (let i = 0; i < column.length; i++) {
        const node = column[i]!;
        if (i === 0) {
          const drop = isHorizontal ? topAnchor - node.y : node.x - topAnchor;
          const slots = Math.round(drop / step);
          if (slots > 0) {
            const prop = isHorizontal ? "margin-top" : "margin-left";
            const gapVar = isHorizontal ? "var(--vertical-gap)" : "var(--horizontal-gap)";
            marginRules.push(`#${node.id} {\n  ${prop}: calc(${slots} * (${gapVar} + 2.5em));\n}`);
          }
        } else {
          const prev = column[i - 1]!;
          const gap = isHorizontal ? prev.y - node.y : node.x - prev.x;
          const extraSlots = Math.max(0, Math.round(gap / step) - 1);
          if (extraSlots > 0) {
            const prop = isHorizontal ? "margin-top" : "margin-left";
            const gapVar = isHorizontal ? "var(--vertical-gap)" : "var(--horizontal-gap)";
            marginRules.push(`#${node.id} {\n  ${prop}: calc(${extraSlots} * (${gapVar} + 2.5em));\n}`);
          }
        }
      }
    }

    return marginRules;
  }
}

// -------------------------------------------------------------------- bagging

function inheriting(bag: Bag, graph: Bag): Bag {
  return new Map(
    [...bag].filter(([key, value]) => !(ATTR_INHERITS.has(key) && graph.get(key) === value)),
  );
}

function shared(bags: Bag[]): Bag {
  const first = bags[0];
  if (first === undefined) return new Map();

  return new Map(
    [...first].filter(([key, value]) => bags.every((bag) => bag.get(key) === value)),
  );
}

const ABSENT = "\u0000";

function mode(bags: Bag[]): Bag {
  const chosen: Bag = new Map();

  for (const key of ATTR_CSS.keys()) {
    const counts = new Map<string, number>();
    for (const bag of bags) {
      const value = bag.get(key) ?? ABSENT;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const best = [...counts].sort((a, b) => b[1] - a[1] || compare(a[0], b[0]))[0];
    if (best !== undefined && best[0] !== ABSENT) chosen.set(key, best[0]);
  }
  return chosen;
}

function unanimous(bags: Bag[], inherited: Bag): Bag {
  const chosen: Bag = new Map();
  if (bags.length === 0) return chosen;

  for (const key of ATTR_CSS.keys()) {
    const values = bags.map((bag) => bag.get(key));
    const first = values[0];
    if (first === undefined || first === inherited.get(key)) continue;
    if (values.every((value) => value === first)) chosen.set(key, first);
  }
  return chosen;
}

function differing(attrs: Bag, inherited: Bag): Bag {
  const chosen: Bag = new Map();

  for (const [key, value] of pick(attrs)) {
    if (value !== inherited.get(key)) chosen.set(key, value);
  }
  return chosen;
}

function pick(attrs: Bag): Bag {
  return new Map([...ATTR_CSS.keys()].flatMap((key) => {
    const value = attrs.get(key);
    return value === undefined ? [] : [[key, value] as [string, string]];
  }));
}

function merge(base: Bag, over: Bag): Bag {
  return new Map([...base, ...over]);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ------------------------------------------------------------------ rendering

function rules(
  selector: string,
  bag: Bag,
  depth: number,
  inner: string[] = [],
  registry: T.AttrCss = ATTR_CSS,
): string[] {
  const declarations = [...bag]
    .filter(([key]) => registry.has(key))
    .map(
      ([key, value]) =>
        `${pad(depth + 1)}${registry.get(key)}: ${value}${ATTR_UNIT.get(key) ?? ""};`,
    );
  if (declarations.length === 0 && inner.length === 0) return [];

  return [`${pad(depth)}${selector} {`, ...declarations, ...inner, `${pad(depth)}}`];
}

function pad(depth: number): string {
  return "  ".repeat(depth);
}

function nodeOf(model: T.DiagramModel, id: string): T.Node {
  return model.nodes.find((node) => node.id === id)!;
}

function clusterOf(model: T.DiagramModel, name: string): T.Cluster {
  return model.clusters.find((cluster) => cluster.name === name)!;
}

function roots(model: T.DiagramModel): T.Cluster[] {
  const nested = new Set(model.clusters.flatMap((cluster) => cluster.clusters));
  return model.clusters.filter((cluster) => !nested.has(cluster.name));
}
