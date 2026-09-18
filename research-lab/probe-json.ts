// headless smoke: Vizer + DiagramBagger against the fixture
import { DiagramBagger } from "../src/diagram/diagram-bagger.ts";
import { Vizer } from "../src/diagram/vizer.ts";

const dot = await Bun.file("research-lab/example-1.dot").text();
const model = new DiagramBagger().bag(await new Vizer().render(dot));
console.log("rankdir", model.rankdir, "nodes", model.nodes.length, "edges", model.edges.length, "clusters", model.clusters.length);
for (const n of model.nodes) console.log(n.id, "[" + n.classes.join(" ") + "]", n.x, n.y, n.shape, JSON.stringify([...n.attrs]));
for (const c of model.clusters) console.log(c.name, c.isInvis, c.nodes, c.label);
for (const e of model.edges) console.log(e.id, e.from, "->", e.to);
