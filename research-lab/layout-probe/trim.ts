// Parse → trim what gives a node size → print → Graphviz. Does the trimmed
// tree lay out like the real DOT?   bun research-lab/layout-probe/trim.ts [file]

import { parse, stringify } from "@ts-graphviz/ast";

const file = process.argv[2] ?? "research-lab/example-2.dot";
const dot = await Bun.file(file).text();

/** Attributes that only give a node (or label) a size. Everything else stays. */
const SIZE = new Set([
  "label", "xlabel", "headlabel", "taillabel",
  "shape", "width", "height", "fixedsize", "margin", "peripheries", "sides", "regular",
  "fontsize", "fontname", "image",
]);

function trim(tree: any): any {
  tree.children = tree.children.filter((child: any) => !(child.type === "Attribute" && SIZE.has(child.key.value)));
  for (const child of tree.children) trim(child);
  return tree;
}

// NOTRIM=1: only prepend `node [shape=point …]`, to see whether trimming is needed.
const tree = process.env.NOTRIM ? parse(dot) : trim(parse(dot));
const graph = tree.children.find((child: any) => child.type === "Graph");
const points = parse(`digraph { node [shape=point width=0 height=0 label=""] }`)
  .children.find((c: any) => c.type === "Graph").children[0];
graph.children.unshift(points);
const bare = stringify(tree);

const { Graphviz } = await import("@hpcc-js/wasm-graphviz");
const gv = await Graphviz.load();

function ranks(source: string): string[][] {
  const out = JSON.parse(gv.layout(source, "json", "dot"));
  const across = /rankdir\s*=\s*"?(LR|RL)/.test(source);
  const pts: [string, number, number][] = (out.objects ?? []).filter((o: any) => o.pos && !o.nodes)
    .map((o: any) => { const [x, y] = o.pos.split(",").map(Number); return [o.name, across ? x : -y, across ? -y : x]; });
  const keys = [...new Set(pts.map((p) => p[1]))].sort((a, b) => a - b);
  return keys.map((k) => pts.filter((p) => p[1] === k).sort((a, b) => a[2] - b[2]).map((p) => p[0]));
}

if (process.argv.includes("--print")) console.log(bare);
const [real, trimmed] = [ranks(dot), ranks(bare)];
console.log("== graphviz on the DOT as written");
real.forEach((r, i) => console.log(`  ${i}: ${r.join("  ")}`));
console.log("== graphviz on the trimmed tree (0×0 points)");
trimmed.forEach((r, i) => console.log(`  ${i}: ${r.join("  ")}`));
console.log("same ranks (as sets):", JSON.stringify(real.map((r) => [...r].sort())) === JSON.stringify(trimmed.map((r) => [...r].sort())));
console.log("same order:          ", JSON.stringify(real) === JSON.stringify(trimmed));
