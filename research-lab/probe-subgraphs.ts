// Discovery: what exactly sits in `objects[0 .. _subgraph_cnt)` — is the root
// graph ever one of them? Answer: no. Every entry is a real subgraph; the
// anonymous ones are named `%1`, `%3`, … and carry their own members.
import { Vizer } from "../src/diagram/vizer.ts";

const v = new Vizer();
const cases: [string, string][] = [
  ["named-only", `digraph g { subgraph cluster_source { a } b; a->b }`],
  ["anon+named", `digraph g { { c d } subgraph cluster_x { a } b; a->b }`],
  ["two-anon", `digraph g { { c d } { e f } a->b }`],
  ["example-1", await Bun.file("research-lab/example-1.dot").text()],
];

for (const [tag, dot] of cases) {
  const j: any = await v.render(dot);
  const nodes = j.objects.slice(j._subgraph_cnt).map((o: any) => o.name);
  console.log(`\n${tag}  subgraphs=${j._subgraph_cnt}  nodes=${nodes.length} [${nodes}]`);
  for (let i = 0; i < j._subgraph_cnt; i++) {
    const o = j.objects[i];
    const members = (o.nodes ?? []).map((g: number) => j.objects[g].name);
    console.log(`  ${i}: ${o.name.padEnd(18)} [${members}]`);
  }
}
