// Model → derived StyleBag (§3.2). Graphviz has already resolved `node [...]` /
// `edge [...]` defaults onto every object, so we recover them statistically:
// the most common value wins, ties break on the lexicographically smallest, and
// identical input therefore produces an identical map in an identical insertion
// order.
//
// When a DOT diagram is bare-bone (no presentation overrides), the derived layer
// holds ONLY the `#diagram-canvas, svg` token block, leaving all presentation and
// structure to the theme.
//
// Nothing here builds CSS text. Selectors are composed flat — a cluster member
// is `.cluster_x.node, .cluster_x.record` — because CSSOM has no nesting and the
// Stylist keeps one rule per selector.

import type * as T from "../types.ts";

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

// The token block extracted from the DOT model on each Redraw. `svg` joins the
// canvas because the SVG layer is a sibling document fragment and custom
// properties set on the canvas alone do not reach it.
//
// The canvas, and not `:root`, is the token root — in both documents. A picture
// export renders the canvas inside a `<foreignObject>`, where there is no `body`
// for the chrome's own `body { --main-font: … }` block to land on. Rooted at
// `:root`, the tokens therefore lost to `app.css` on screen (a nearer ancestor
// wins an inherited value, whatever the specificity) and won in the exported
// file — two token sets, and an export that did not match what you were looking
// at. Naming the canvas makes it the nearest ancestor in both places. The theme
// roots itself here too, and the two must always agree: the derived block is
// source 1 and has to stay at least as near as the theme's source 0.
const TOKENS = "#diagram-canvas, svg";

function preamble(model: T.DiagramModel, nodeBag: Bag, edgeBag: Bag): Bag {
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

  return new Map([
    ["--primary-color", primaryColor],
    ["--secondary-color", secondaryColor],
    ["--accent-color", accentColor],
    ["--main-font", mainFont],
    ["--title-font", titleFont],
    ["--base-font-size", "14px"],
    ["--horizontal-gap", "2em"],
    ["--vertical-gap", "2em"],
    ["--connector-style", model.attrs.get("splines") ?? "spline"],
    ["--raised-shadow", "0 6px 12px lightgrey"],
    ["--flat-shadow", "0 0 2px lightgrey"],
  ]);
}

type Bag = Map<string, string>;

export class CssBagger {
  bag(model: T.DiagramModel): T.StyleBag {
    const out: T.StyleBag = new Map();
    const graphBag = pick(model.attrs);
    const nodeBag = mode(model.nodes.map((node) => node.attrs));
    const edgeBag = mode(model.edges.map((edge) => edge.attrs));
    const clusterBags = new Map<string, Bag>();
    const granted = new Map<string, Bag>();

    own(out, TOKENS, preamble(model, nodeBag, edgeBag));

    put(out, ".diagram", graphBag);
    put(out, ".node, .record", inheriting(nodeBag, graphBag));
    for (const cluster of roots(model)) {
      this.cluster(out, cluster, model, nodeBag, clusterBags, granted, "");
    }
    this.nodeOverrides(out, model, nodeBag, clusterBags);
    put(out, ".edge", edgeBag, ATTR_SVG);
    for (const edge of model.edges) {
      put(out, `#${edge.id}`, differing(edge.attrs, edgeBag), ATTR_SVG);
    }

    return out;
  }

  private cluster(
    out: T.StyleBag,
    cluster: T.Cluster,
    model: T.DiagramModel,
    inherited: Bag,
    bags: Map<string, Bag>,
    granted: Map<string, Bag>,
    prefix: string,
  ): void {
    const members = cluster.nodes.map((id) => nodeOf(model, id));
    const held = merge(inherited, shared(members.map((node) => granted.get(node.id) ?? new Map())));
    const own = unanimous(members.map((node) => node.attrs), held);
    bags.set(cluster.name, own);
    for (const node of members) granted.set(node.id, merge(granted.get(node.id) ?? new Map(), own));

    const path = `${prefix}.${cluster.name}`;
    put(out, `${path}.node, ${path}.record`, own);
    for (const name of cluster.clusters) {
      this.cluster(out, clusterOf(model, name), model, merge(inherited, own), bags, granted, path);
    }
  }

  private nodeOverrides(
    out: T.StyleBag,
    model: T.DiagramModel,
    nodeBag: Bag,
    bags: Map<string, Bag>,
  ): void {
    for (const node of model.nodes) {
      const inherited = node.classes.reduce((bag, cls) => merge(bag, bags.get(cls)!), nodeBag);
      put(out, `#${node.id}`, differing(node.attrs, inherited));
    }
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

// ----------------------------------------------------------------- collecting

// Translates a bag of Graphviz attributes into one map entry. A selector that
// would say nothing is never created, so an empty subgraph leaves no trace.
function put(
  out: T.StyleBag,
  selector: string,
  bag: Bag,
  registry: T.AttrCss = ATTR_CSS,
): void {
  const declarations = [...bag].filter(([key]) => registry.has(key));
  if (declarations.length === 0) return;

  const properties = own(out, selector);
  for (const [key, value] of declarations) {
    properties.set(registry.get(key)!, `${value}${ATTR_UNIT.get(key) ?? ""}`);
  }
}

// Get-or-create, because two passes can both have something to say about `#id`.
function own(out: T.StyleBag, selector: string, seed?: Bag): Bag {
  const properties = out.get(selector) ?? seed ?? new Map<string, string>();
  out.set(selector, properties);
  return properties;
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
