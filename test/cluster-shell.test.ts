// Cluster shells: SVG bounding boxes drawn around member nodes of `subgraph cluster_...`.

import { expect, test } from "bun:test";
import { DiagramBagger } from "../src/diagram/diagram-bagger.ts";
import { NodeSheller } from "../src/diagram/node-sheller.ts";
import { Vizer } from "../src/diagram/vizer.ts";
import type { Box, DiagramModel } from "../src/types.ts";

async function makeModel(dot: string): Promise<DiagramModel> {
  return new DiagramBagger().bag(await new Vizer().render(dot));
}

test("clusters draw an SVG box enclosing member node bounding boxes", async () => {
  const dot = `digraph {
    subgraph cluster_sources {
      label = "Data Sources"
      a; b;
    }
  }`;

  const model = await makeModel(dot);
  const sheller = new NodeSheller();

  const boxes: Box[] = [
    { id: "a", left: 100, top: 50, width: 80, height: 40 },
    { id: "b", left: 100, top: 120, width: 90, height: 40 },
  ];

  const svg = sheller.clusters(boxes, model);

  // Group container with cluster id and class
  expect(svg).toContain('<g id="cluster_sources" class="cluster cluster_sources" data-cluster="cluster_sources">');

  // Enclosing rect: minLeft=100, maxRight=190, minTop=50, maxBottom=160
  // padX=16 -> x = 100 - 16 = 84, width = (190 - 100) + 32 = 122
  // padTop=28 (has label) -> y = 50 - 28 = 22, height = (160 - 50) + 28 + 16 = 154
  expect(svg).toContain('<rect class="cluster-box" x="84" y="22" width="122" height="154" rx="8" ry="8" />');

  // Label text with proper position
  expect(svg).toContain('<text class="cluster-label" x="96" y="39">Data Sources</text>');
});

test("cluster with style=invis is omitted from cluster SVG output", async () => {
  const dot = `digraph {
    subgraph cluster_hidden {
      style = invis
      a;
    }
    subgraph cluster_visible {
      b;
    }
  }`;

  const model = await makeModel(dot);
  const sheller = new NodeSheller();

  const boxes: Box[] = [
    { id: "a", left: 50, top: 50, width: 60, height: 30 },
    { id: "b", left: 150, top: 50, width: 60, height: 30 },
  ];

  const svg = sheller.clusters(boxes, model);

  expect(svg).not.toContain("cluster_hidden");
  expect(svg).toContain("cluster_visible");
});

test("non-cluster subgraphs (anonymous or without cluster prefix) do not emit cluster boxes", async () => {
  const dot = `digraph {
    subgraph anon {
      a;
    }
    subgraph {
      b;
    }
  }`;

  const model = await makeModel(dot);
  const sheller = new NodeSheller();

  const boxes: Box[] = [
    { id: "a", left: 50, top: 50, width: 60, height: 30 },
    { id: "b", left: 150, top: 50, width: 60, height: 30 },
  ];

  const svg = sheller.clusters(boxes, model);
  expect(svg).toBe("");
});

test("nested clusters compute bounds encompassing member nodes", async () => {
  const dot = `digraph {
    subgraph cluster_parent {
      label = "Parent Cluster"
      p1;
      subgraph cluster_child {
        label = "Child Cluster"
        c1;
      }
    }
  }`;

  const model = await makeModel(dot);
  const sheller = new NodeSheller();

  const boxes: Box[] = [
    { id: "p1", left: 50, top: 50, width: 100, height: 40 },
    { id: "c1", left: 200, top: 100, width: 80, height: 40 },
  ];

  const svg = sheller.clusters(boxes, model);

  expect(svg).toContain('id="cluster_parent"');
  expect(svg).toContain('id="cluster_child"');
});
