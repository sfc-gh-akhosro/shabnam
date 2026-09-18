// Model → Base CSS (§3.2). Graphviz has already resolved `node [...]` /
// `edge [...]` defaults onto every object, so we recover them statistically:
// the most common value wins, ties break on the lexicographically smallest, and
// identical input therefore produces byte-identical output.
//
// Two rules from §3.2 shape everything below. **Naming is DOT naming**: node
// `lake` is `#lake`, subgraph `cluster_a` is `.cluster_a`, edge `lake -> runtime` is
// `#bq_runtime`, and selectors are as short as still identifies the thing —
// `.column` and `.diagram .column` are the same place, so the short one wins,
// and `.shell` needs no `#shabnam-node-shells` in front of it either. **No
// colour is invented**: every colour here came from a DOT attribute or from a
// `:root` variable, so counting the colours in the DOT and counting them here
// gives the same answer.

import type * as T from "../types.ts";

// Graphviz attribute → CSS property, for the HTML layer. Unmapped attributes are
// skipped, `style` among them — it is a value-to-declaration case, not this pass
// (§3.2). This map's insertion order is also the declaration order, which is
// what makes the output stable.
const ATTR_CSS: T.AttrCss = new Map([
  ["bgcolor", "background-color"],
  ["fillcolor", "background-color"],
  ["color", "border-color"],
  ["fontname", "font-family"],
  ["fontsize", "font-size"],
  ["penwidth", "border-width"],
]);

// The same bags, translated for the SVG layer. A `<line>` has no border, so DOT
// colour and `penwidth` reach the connectors and the shells only through here.
const ATTR_SVG: T.AttrCss = new Map([
  ["color", "stroke"],
  ["penwidth", "stroke-width"],
]);

// Graphviz measures these in points; CSS needs to be told.
const ATTR_UNIT = new Map([
  ["fontsize", "pt"],
  ["penwidth", "pt"],
]);

// The keys whose CSS property inherits down the DOM. A node sitting in a
// `.diagram` that already says `font-family: Helvetica` does not need to be told
// again; a background does not inherit, so it does.
const ATTR_INHERITS = new Set(["fontname", "fontsize"]);

// The declarations that make a column of divs read as a diagram. They are
// constant, so they are not bagged — but they belong to the same selectors the
// bags do, and emitting a selector twice is the redundancy §3.2 forbids. So a
// selector's structure is looked up here and its bag is appended to it.
const STRUCTURE = new Map([
  [".diagram", ["display: flex", "align-items: flex-start", "gap: var(--horizontal-gap)", "padding: var(--horizontal-gap)", "font-family: var(--main-font)", "font-size: var(--base-font-size)"]],
  [".node", ["border-style: solid", "border-width: 1px", "border-radius: 4px", "padding: 0.5em 0.75em", "min-width: 9em"]],
  [".shell", ["fill: none", "stroke-dasharray: 4 3"]],
  [".edge", ["fill: none"]],
]);

// The `:root` contract of §3.2 and the rules that carry no styling decision at
// all. Derived output — every Redraw rewrites it — so none of it belongs in My
// Style, which the user owns.
const PREAMBLE = `:root {
  --primary-color: blue;
  --secondary-color: green;
  --accent-color: orange;

  --main-font: sans-serif;
  --title-font: sans-serif;
  --base-font-size: 14px;

  --horizontal-gap: 1em;
  --vertical-gap: 1em;

  --raised-shadow: 0 6px 12px lightgrey;
  --flat-shadow: 0 0 2px lightgrey;
}

.column {
  display: flex;
  flex-direction: column;
  gap: var(--vertical-gap);
}

.label {
  white-space: pre-line;
}

.caption {
  font-family: var(--title-font);
  font-size: 10px;
}

.arrow {
  /* One shared marker, so it takes the colour of the line that referenced it. */
  fill: context-stroke;
}
`;

type Bag = Map<string, string>;

export class CssBagger implements T.CssBagger {
  bag(model: T.DiagramModel): string {
    const graphBag = pick(model.attrs);
    const nodeBag = mode(model.nodes.map((node) => node.attrs));
    const edgeBag = mode(model.edges.map((edge) => edge.attrs));
    const clusterBags = new Map<string, Bag>();
    const granted = new Map<string, Bag>();

    return [
      PREAMBLE,
      // Graph-level attrs land on the wrapper. `bgcolor` is a real background on
      // a real div, so unlike a cluster's it is not inert.
      ...rules(".diagram", graphBag, 0),
      // `.node` drops what it would inherit from `.diagram` anyway, but the full
      // bag travels onward: a subgraph has to know the effective value, or it
      // will "discover" the dropped one and restate it under its own name.
      ...rules(".node", inheriting(nodeBag, graphBag), 0),
      ...roots(model).flatMap((c) => this.cluster(c, model, nodeBag, clusterBags, granted, 0)),
      ...this.nodeOverrides(model, nodeBag, clusterBags),
      "",
      // The shells take the nodes' own outline: the HTML box draws the border it
      // was given, and the shell is the same pen one step out.
      ...rules(".shell", nodeBag, 0, [], ATTR_SVG),
      ...rules(".edge", edgeBag, 0, [], ATTR_SVG),
      ...model.edges.flatMap((edge) =>
        rules(`#${edge.id}`, differing(edge.attrs, edgeBag), 0, [], ATTR_SVG),
      ),
    ].join("\n");
  }

  // A subgraph block is emitted when all its members share a value that differs
  // from what they already inherit. Nested subgraphs inherit that in turn, which
  // is why the bag travels down the recursion.
  //
  // Subgraphs overlap, too: example-1's `cluster_a` members all sit in the
  // anonymous block that already filled them, so "what they already have" is
  // `inherited` *plus* whatever every member was granted by an earlier block.
  // Without that, the same colour is stated twice under two different names.
  //
  // A cluster gets no element of its own: the SVG layer paints above
  // `#shabnam-main-html`, so a cluster background drawn there would cover its own
  // members. Hence member rules only, and no `.graph` block anywhere.
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

    const inner = [
      ...rules("&.node", own, depth + 1),
      ...cluster.clusters.flatMap((name) =>
        this.cluster(clusterOf(model, name), model, merge(inherited, own), bags, granted, depth + 1),
      ),
    ];
    // A subgraph class lands on the node element itself (§3.3), so inside a
    // subgraph block `.node` has to be `&.node` — a descendant selector would
    // wait forever for a wrapper element that the HTML layer does not have.
    const selector = depth === 0 ? `.${cluster.name}` : `&.${cluster.name}`;
    return rules(selector, new Map(), depth, inner);
  }

  // An `#id` rule is emitted only when that one node still differs after the
  // class rules apply. Classes first, `#id` last, and rare (§3.2). Edges get no
  // rule in this space: they are `<line>` elements, and a border on a line is
  // output that does nothing.
  private nodeOverrides(model: T.DiagramModel, nodeBag: Bag, bags: Map<string, Bag>): string[] {
    return model.nodes.flatMap((node) => {
      const inherited = node.classes.reduce((bag, cls) => merge(bag, bags.get(cls)!), nodeBag);
      return rules(`#${node.id}`, differing(node.attrs, inherited), 0);
    });
  }
}

// -------------------------------------------------------------------- bagging

// A value a node would inherit from the wrapper anyway is not worth restating.
function inheriting(bag: Bag, graph: Bag): Bag {
  return new Map(
    [...bag].filter(([key, value]) => !(ATTR_INHERITS.has(key) && graph.get(key) === value)),
  );
}

// The keys every one of these bags agrees on. Used to ask what a subgraph's
// members already have in common before the subgraph says anything.
function shared(bags: Bag[]): Bag {
  const first = bags[0];
  if (first === undefined) return new Map();

  return new Map(
    [...first].filter(([key, value]) => bags.every((bag) => bag.get(key) === value)),
  );
}

// Absence counts as a value. One edge out of eighteen carrying `penwidth=3`
// makes 3pt the most common *present* value, and hoisting it to `.edge` would
// thicken every other edge — absence is the majority, so the key is skipped and
// that one edge gets an `#id` rule instead.
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

// Nothing to say, nothing emitted — an empty rule is noise in every diff. A key
// the registry does not map is skipped, which is how one bag serves two layers.
function rules(
  selector: string,
  bag: Bag,
  depth: number,
  inner: string[] = [],
  registry: T.AttrCss = ATTR_CSS,
): string[] {
  const properties = new Set(
    [...bag.keys()].filter((key) => registry.has(key)).map((key) => registry.get(key)!),
  );
  // A structural declaration the bag also sets would be overwritten on the next
  // line — two values for one property, one of them dead.
  const structure = (STRUCTURE.get(selector) ?? [])
    .filter((text) => !properties.has(text.slice(0, text.indexOf(":"))))
    .map((text) => `${pad(depth + 1)}${text};`);
  const declarations = [...bag]
    .filter(([key]) => registry.has(key))
    .map(
      ([key, value]) =>
        `${pad(depth + 1)}${registry.get(key)}: ${value}${ATTR_UNIT.get(key) ?? ""};`,
    );
  if (structure.length === 0 && declarations.length === 0 && inner.length === 0) return [];

  return [`${pad(depth)}${selector} {`, ...structure, ...declarations, ...inner, `${pad(depth)}}`];
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

// A cluster is a root unless another cluster claims it as a child.
function roots(model: T.DiagramModel): T.Cluster[] {
  const nested = new Set(model.clusters.flatMap((cluster) => cluster.clusters));
  return model.clusters.filter((cluster) => !nested.has(cluster.name));
}
