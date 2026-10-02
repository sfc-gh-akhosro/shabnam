// Cluster shells: SVG bounding boxes drawn around member nodes of `subgraph cluster_...`.

import { expect, test } from "bun:test";
import { clusterSvg } from "../src/engine/painter.ts";
import { Parser } from "../src/engine/parser.ts";

const parse = (dot: string) => new Parser().parse(dot);
import type { NodeBox, DiagramModel } from "../src/types.ts";

function makeModel(dot: string): DiagramModel {
  return parse(dot).model;
}

test("clusters draw an SVG box enclosing member node bounding boxes", () => {
  const dot = `digraph {
    subgraph cluster_sources {
      label = "Data Sources"
      a; b;
    }
  }`;

  const model = makeModel(dot);

  const boxes: NodeBox[] = [
    { id: "a", left: 100, top: 50, width: 80, height: 40 },
    { id: "b", left: 100, top: 120, width: 90, height: 40 },
  ];

  const svg = clusterSvg(boxes, model);

  expect(svg).toContain('<g id="cluster_sources" class="cluster_">');
  expect(svg).toContain('<rect x="84" y="22" width="122" height="154" rx="8" ry="8" />');
  expect(svg).toContain('<text class="label" x="96" y="39">Data Sources</text>');
});

test("cluster with style=invis is omitted from cluster SVG output", () => {
  const dot = `digraph {
    subgraph cluster_hidden {
      style = invis
      a;
    }
    subgraph cluster_visible {
      b;
    }
  }`;

  const model = makeModel(dot);

  const boxes: NodeBox[] = [
    { id: "a", left: 50, top: 50, width: 60, height: 30 },
    { id: "b", left: 150, top: 50, width: 60, height: 30 },
  ];

  const svg = clusterSvg(boxes, model);

  expect(svg).not.toContain("cluster_hidden");
  expect(svg).toContain("cluster_visible");
});

test("non-cluster subgraphs (anonymous or without cluster prefix) do not emit cluster boxes", () => {
  const dot = `digraph {
    subgraph anon {
      a;
    }
    subgraph {
      b;
    }
  }`;

  const model = makeModel(dot);

  const boxes: NodeBox[] = [
    { id: "a", left: 50, top: 50, width: 60, height: 30 },
    { id: "b", left: 150, top: 50, width: 60, height: 30 },
  ];

  const svg = clusterSvg(boxes, model);
  expect(svg).toBe("");
});

test("nested clusters compute bounds encompassing member nodes", () => {
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

  const model = makeModel(dot);

  const boxes: NodeBox[] = [
    { id: "p1", left: 50, top: 50, width: 100, height: 40 },
    { id: "c1", left: 200, top: 100, width: 80, height: 40 },
  ];

  const svg = clusterSvg(boxes, model);

  expect(svg).toContain('id="cluster_parent"');
  expect(svg).toContain('id="cluster_child"');
});
