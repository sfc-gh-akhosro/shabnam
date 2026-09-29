// Which DOT attributes move a 0×0 point under `dot`? One change at a time on a
// small graph; prints rank/order before and after, and whether x/y moved.
//   bun research-lab/layout-probe/attrs.ts

const { Graphviz } = await import("@hpcc-js/wasm-graphviz");
const gv = await Graphviz.load();

const NODE = `node [shape=point width=0 height=0 label=""]`;
// a → b → c, a → d, e → c, f alone, g → h: enough freedom for every attribute to show.
const edges = (extra: Record<string, string> = {}) =>
  ["a->b", "b->c", "a->d", "e->c", "g->h", "d->c"].map((e) => `${e} [${extra[e] ?? ""}]`).join("\n");
const base = (graph = "", body = "", ex: Record<string, string> = {}) =>
  `digraph { ${graph}\n${NODE}\na b c d e f g h\n${edges(ex)}\n${body} }`;

function read(src: string) {
  const out = JSON.parse(gv.layout(src, "json", "dot"));
  const pts = new Map<string, [number, number]>();
  for (const o of out.objects ?? []) if (o.pos && !o.nodes) pts.set(o.name, o.pos.split(",").map(Number));
  const ys = [...new Set([...pts.values()].map(([, y]) => -y))].sort((p, q) => p - q);
  const ranks = ys.map((y) => [...pts].filter(([, [, py]]) => -py === y).sort((p, q) => p[1][0] - q[1][0]).map(([n]) => n).join(""));
  return { ranks: ranks.join(" | "), xy: JSON.stringify([...pts]) };
}

const ref = read(base());
console.log(`base                          ${ref.ranks}`);
const cases: [string, string][] = [
  // graph
  ["rankdir=LR", base("rankdir=LR")],
  ["nodesep=2", base("nodesep=2")],
  ["ranksep=2", base("ranksep=2")],
  ["ordering=out", base("ordering=out")],
  ["newrank=true + cluster rank", base("newrank=true", "subgraph cluster_x { b e }")],
  ["clusterrank=none", base("clusterrank=none", "subgraph cluster_x { d e }")],
  ["concentrate=true", base("concentrate=true")],
  ["splines=ortho", base("splines=ortho")],
  ["size=1,1", base('size="1,1"')],
  ["center=true", base("center=true")],
  ["searchsize=1", base("searchsize=1")],
  ["mclimit=0.01", base("mclimit=0.01")],
  ["remincross=true", base("remincross=true")],
  // subgraph
  ["{rank=same d e}", base("", "{rank=same d e}")],
  ["{rank=min c}", base("", "{rank=min c}")],
  ["{rank=max f}", base("", "{rank=max f}")],
  ["{rank=source g}", base("", "{rank=source g}")],
  ["{rank=sink b}", base("", "{rank=sink b}")],
  ["cluster {d e}", base("", "subgraph cluster_x { d e }")],
  ["plain subgraph {d e}", base("", "subgraph x { d e }")],
  ["cluster=true subgraph", base("", "subgraph x { cluster=true d e }")],
  // node
  ["node group b,d", base("", "b [group=g1] d [group=g1] a [group=g1]")],
  ["node ordering=out a", base("", "a [ordering=out]")],
  ["node pos (dot ignores?)", base("", 'f [pos="0,0!"]')],
  // edge
  ["edge weight=100 a->d", base("", "", { "a->d": "weight=100" })],
  ["edge minlen=3 a->b", base("", "", { "a->b": "minlen=3" })],
  ["edge constraint=false b->c", base("", "", { "b->c": "constraint=false" })],
  ["edge tailport=w a->d", base("", "", { "a->d": "tailport=w" })],
  ["edge dir=back a->b", base("", "", { "a->b": "dir=back" })],
  ["edge label=L a->b", base("", "", { "a->b": 'label="LONG LABEL"' })],
  ["edge xlabel=L a->b", base("", "", { "a->b": 'xlabel="LONG LABEL"' })],
  ["edge style=invis a->b", base("", "", { "a->b": "style=invis" })],
  ["edge samehead d->c,e->c", base("", "", { "d->c": "samehead=h", "e->c": "samehead=h" })],
];
for (const [name, src] of cases) {
  const got = read(src);
  const mark = got.ranks !== ref.ranks ? "RANK/ORDER" : got.xy !== ref.xy ? "xy only" : "-";
  console.log(`${name.padEnd(30)}${mark.padEnd(12)}${got.ranks !== ref.ranks ? got.ranks : ""}`);
}
