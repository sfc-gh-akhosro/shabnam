// Smart connectors: Edge routing supporting spline (cubic bezier), ortho (rounded step), and straight line modes.

import { expect, test } from "bun:test";
import { DiagramBagger } from "../src/diagram/diagram-bagger.ts";
import { EdgeDrawer } from "../src/diagram/edge-drawer.ts";
import { Vizer } from "../src/diagram/vizer.ts";
import type { Box, DiagramModel } from "../src/types.ts";

async function makeModel(dot: string): Promise<DiagramModel> {
  return new DiagramBagger().bag(await new Vizer().render(dot));
}

test("spline mode (default) generates cubic bezier SVG paths", async () => {
  const dot = `digraph {
    rankdir=LR
    a -> b
  }`;

  const model = await makeModel(dot);
  const edger = new EdgeDrawer();

  const boxes: Box[] = [
    { id: "a", left: 50, top: 50, width: 80, height: 40 },
    { id: "b", left: 200, top: 120, width: 80, height: 40 },
  ];

  const svg = edger.draw(boxes, model);

  expect(svg).toContain('<path id="a_b" class="edge"');
  expect(svg).toContain('d="M');
  expect(svg).toContain('C');
  expect(svg).toContain('marker-end="url(#shabnam-arrow)"');
});

test("ortho mode generates rounded corner step paths", async () => {
  const dot = `digraph {
    rankdir=LR
    splines = ortho
    a -> b
  }`;

  const model = await makeModel(dot);
  const edger = new EdgeDrawer();

  const boxes: Box[] = [
    { id: "a", left: 50, top: 50, width: 80, height: 40 },
    { id: "b", left: 250, top: 150, width: 80, height: 40 },
  ];

  const svg = edger.draw(boxes, model);

  expect(svg).toContain('<path id="a_b" class="edge"');
  expect(svg).toContain('Q');
  expect(svg).toContain('marker-end="url(#shabnam-arrow)"');
});

test("straight line mode generates direct L segments", async () => {
  const dot = `digraph {
    splines = line
    a -> b
  }`;

  const model = await makeModel(dot);
  const edger = new EdgeDrawer();

  const boxes: Box[] = [
    { id: "a", left: 50, top: 50, width: 80, height: 40 },
    { id: "b", left: 200, top: 120, width: 80, height: 40 },
  ];

  const svg = edger.draw(boxes, model);

  expect(svg).toContain('<path id="a_b" class="edge"');
  expect(svg).toContain('L');
  expect(svg).not.toContain('C');
  expect(svg).not.toContain('Q');
});

test("per-edge splines attribute overrides diagram default", async () => {
  const dot = `digraph {
    rankdir=LR
    splines = spline
    a -> b [splines=ortho]
    b -> c [splines=line]
  }`;

  const model = await makeModel(dot);
  const edger = new EdgeDrawer();

  const boxes: Box[] = [
    { id: "a", left: 50, top: 50, width: 80, height: 40 },
    { id: "b", left: 200, top: 120, width: 80, height: 40 },
    { id: "c", left: 350, top: 200, width: 80, height: 40 },
  ];

  const svg = edger.draw(boxes, model);

  // a_b uses ortho (contains Q)
  expect(svg).toMatch(/<path id="a_b"[^>]*d="[^"]*Q[^"]*"/);
  // b_c uses line (contains L, no C or Q in its segment)
  expect(svg).toMatch(/<path id="b_c"[^>]*d="[^"]*L[^"]*"/);
});

