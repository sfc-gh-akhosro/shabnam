// research-lab/ast/cli.ts — one DOT file, three answers.
//
//   bun run ast-layout example-2
//   bun run ast-layout example-1 --dot     (DOT attributes, before translation)
//   bun run ast-layout research-lab/example-1.dot

import { GraphvizAst } from "./graphviz-ast.ts";
import { DagreLayout } from "./dagre-layout.ts";
import type { DiagramModel, DotStyles, PointGraph, Positions } from "./types.ts";

const asked = process.argv[2] ?? "example-1";
const path = asked.endsWith(".dot") ? asked : `research-lab/${asked}.dot`;
const untranslated = process.argv.includes("--dot");

const ast = new GraphvizAst(await Bun.file(path).text());

banner(path);
showModel(ast.model());
showStyles(untranslated ? ast.dotAttrs() : ast.styles(), untranslated);
const graph = ast.points();
showPoints(graph);
showPositions(new DagreLayout().place(graph));

// --- printing: the stored shapes, not reshaped for display -----------------

function banner(of: string): void {
  console.log(`\n${"=".repeat(66)}\n  ${of}\n${"=".repeat(66)}`);
}

function showModel(model: DiagramModel): void {
  console.log(`\n--- DiagramModel  (rankdir=${model.rankdir}) ---\n`);
  console.log(`nodes (${model.nodes.length}):`);
  for (const one of model.nodes) {
    const bits = [`shape=${one.shape}`, one.icon && `icon=${one.icon}`, one.caption && `caption="${one.caption}"`];
    console.log(`  ${one.id.padEnd(30)} .${one.classes.join(" .") || "(none)"}   ${bits.filter(Boolean).join("  ")}`);
  }
  console.log(`\nclusters (${model.clusters.length}):`);
  for (const one of model.clusters) {
    const nested = one.clusters.length ? `  nested=${JSON.stringify(one.clusters)}` : "";
    console.log(`  ${one.name.padEnd(20)} label="${one.label}" invis=${one.isInvis}  ${JSON.stringify(one.nodes)}${nested}`);
  }
  console.log(`\nedges (${model.edges.length}): ${model.edges.map((e) => e.id).join(", ")}`);
}

function showStyles(styles: DotStyles, raw: boolean): void {
  console.log(`\n--- ${raw ? "DOT attributes" : "DotStyles"}  (selector → property → value) ---\n`);
  console.log(`Map(${styles.size}) {`);
  for (const [selector, properties] of styles) {
    console.log(`  "${selector}" => Map(${properties.size}) {`);
    for (const [property, value] of properties) console.log(`    "${property}" => ${JSON.stringify(value)},`);
    console.log(`  },`);
  }
  console.log(`}`);
}

function showPoints(graph: PointGraph): void {
  console.log(`\n--- PointGraph  (no styles, no sizes, no weights) ---\n`);
  console.log(`  ${graph.nodes.length} points, ${graph.arrows.length} arrows`);
  console.log(`  sameRank: ${graph.sameRank.length ? "" : "(none)"}`);
  for (const group of graph.sameRank) console.log(`    ${JSON.stringify(group)}`);
  console.log(`  boxes:    ${graph.boxes.size ? "" : "(none)"}`);
  for (const [name, members] of graph.boxes) console.log(`    ${name} ${JSON.stringify(members)}`);
}

function showPositions(positions: Positions): void {
  console.log(`\n--- Positions  (rank, order, x, y) ---\n`);
  const rows = [...positions].sort(([, a], [, b]) => a.rank - b.rank || a.order - b.order);
  let rank = -1;
  for (const [id, at] of rows) {
    if (at.rank !== rank) { console.log(`  rank ${at.rank}`); rank = at.rank; }
    console.log(`    ${String(at.order).padStart(2)}  ${id.padEnd(30)} x=${Math.round(at.x)}  y=${Math.round(at.y)}`);
  }
  console.log();
}
