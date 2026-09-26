// The ortho snake: one shape, no modes. A route attaches perpendicular to a box
// side and crawls through the gaps the layout already left between nodes (§3.4).
//
// Radius 0 is used almost everywhere here on purpose: it makes the path pure
// `M`/`L`, so a test can read the waypoints straight out of the `d` attribute
// instead of picking them out of curves.

import { expect, test } from "bun:test";
import { DiagramBagger } from "../src/diagram/diagram-bagger.ts";
import { EdgeDrawer } from "../src/diagram/edge-drawer.ts";
import { Vizer } from "../src/diagram/vizer.ts";
import type { Box, ConnectorMetrics, DiagramModel, Point } from "../src/types.ts";

const SHARP: ConnectorMetrics = { clearance: 14, radius: 0 };

async function makeModel(dot: string): Promise<DiagramModel> {
  return new DiagramBagger().bag(await new Vizer().render(dot));
}

function pathOf(svg: string, id: string): string {
  // `\sd="` rather than `d="`: the attribute list also contains `marker-end="`,
  // which ends in `d="`, and a greedy scan happily captures the marker instead.
  return svg.match(new RegExp(`<path id="${id}"[^>]*?\\sd="([^"]*)"`))![1]!;
}

/** The waypoints of a sharp path, read back out of `d`. */
function points(d: string): Point[] {
  const numbers = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  return numbers.reduce<Point[]>((all, value, index) => {
    if (index % 2 === 0) all.push({ x: value, y: numbers[index + 1]! });
    return all;
  }, []);
}

function axisOf(a: Point, b: Point): "h" | "v" | "diagonal" {
  if (a.y === b.y) return "h";
  if (a.x === b.x) return "v";
  return "diagonal";
}

function rect(box: Box) {
  return { left: box.left, top: box.top, right: box.left + box.width, bottom: box.top + box.height };
}

/** Every point along the polyline, every pixel. */
function samples(way: Point[]): Point[] {
  const all: Point[] = [];
  for (const [index, from] of way.entries()) {
    const to = way[index + 1];
    if (!to) break;
    const steps = Math.max(1, Math.abs(to.x - from.x) + Math.abs(to.y - from.y));
    for (let s = 0; s <= steps; s++) {
      all.push({ x: from.x + ((to.x - from.x) * s) / steps, y: from.y + ((to.y - from.y) * s) / steps });
    }
  }
  return all;
}

function bends(way: Point[]): number {
  return way.slice(1, -1).filter((_, index) => {
    const [a, b, c] = [way[index]!, way[index + 1]!, way[index + 2]!];
    return axisOf(a, b) !== axisOf(b, c);
  }).length;
}

// ---------------------------------------------------------------------------

test("a cross-rank edge attaches on the sides, and leaves perpendicular", async () => {
  const model = await makeModel("digraph { rankdir=LR; a -> b }");
  const boxes: Box[] = [
    { id: "a", left: 0, top: 100, width: 80, height: 40 },
    { id: "b", left: 300, top: 260, width: 80, height: 40 },
  ];

  const way = points(pathOf(new EdgeDrawer().draw(boxes, model, SHARP), "a_b"));

  expect(axisOf(way[0]!, way[1]!)).toBe("h");
  expect(axisOf(way.at(-2)!, way.at(-1)!)).toBe("h");
  // It leaves a's right edge and enters b's left edge, both at the shell.
  expect(way[0]!.x).toBeGreaterThan(80);
  expect(way.at(-1)!.x).toBeLessThan(300);
});

test("a same-rank edge attaches top and bottom instead", async () => {
  // A side attachment here would have to leave the right edge and loop back to
  // the left to get in, which is worse than the vertical it would replace.
  const model = await makeModel("digraph { rankdir=LR; a -> b }");
  const boxes: Box[] = [
    { id: "a", left: 100, top: 0, width: 80, height: 40 },
    { id: "b", left: 100, top: 200, width: 80, height: 40 },
  ];

  const way = points(pathOf(new EdgeDrawer().draw(boxes, model, SHARP), "a_b"));

  expect(axisOf(way[0]!, way[1]!)).toBe("v");
  expect(axisOf(way.at(-2)!, way.at(-1)!)).toBe("v");
  expect(way[0]!.y).toBeGreaterThan(40);
  expect(way.at(-1)!.y).toBeLessThan(200);
});

test("the snake goes round a node in the way, not through it", async () => {
  const model = await makeModel("digraph { rankdir=LR; a -> b; blocker }");
  const blocker: Box = { id: "blocker", left: 200, top: 100, width: 80, height: 40 };
  const boxes: Box[] = [
    { id: "a", left: 0, top: 100, width: 80, height: 40 },
    blocker,
    { id: "b", left: 400, top: 100, width: 80, height: 40 },
  ];

  const way = points(pathOf(new EdgeDrawer().draw(boxes, model, SHARP), "a_b"));
  const box = rect(blocker);
  const through = samples(way).filter(
    (at) => at.x > box.left && at.x < box.right && at.y > box.top && at.y < box.bottom,
  );

  expect(through).toEqual([]);
  // A straight run at y=120 would have hit it, so the route had to bend.
  expect(bends(way)).toBeGreaterThan(0);
});

test("clearance is kept off a node the edge does not belong to", async () => {
  const model = await makeModel("digraph { rankdir=LR; a -> b; blocker }");
  const blocker: Box = { id: "blocker", left: 200, top: 100, width: 80, height: 40 };
  const boxes: Box[] = [
    { id: "a", left: 0, top: 100, width: 80, height: 40 },
    blocker,
    { id: "b", left: 400, top: 100, width: 80, height: 40 },
  ];

  const way = points(pathOf(new EdgeDrawer().draw(boxes, model, SHARP), "a_b"));
  const box = rect(blocker);
  const nearest = Math.min(
    ...samples(way).map((at) =>
      Math.max(box.left - at.x, at.x - box.right, box.top - at.y, at.y - box.bottom),
    ),
  );

  expect(nearest).toBeGreaterThanOrEqual(SHARP.clearance);
});

test("a clear pair takes the fewest bends that reach it", async () => {
  // Nothing in the way, two ranks, different rows: a Z is two bends and there is
  // no reason for a third.
  const model = await makeModel("digraph { rankdir=LR; a -> b }");
  const boxes: Box[] = [
    { id: "a", left: 0, top: 0, width: 80, height: 40 },
    { id: "b", left: 300, top: 200, width: 80, height: 40 },
  ];

  const way = points(pathOf(new EdgeDrawer().draw(boxes, model, SHARP), "a_b"));

  expect(bends(way)).toBeLessThanOrEqual(2);
});

test("radius 0 is sharp, and a radius curves the same corners", async () => {
  const model = await makeModel("digraph { rankdir=LR; a -> b }");
  const boxes: Box[] = [
    { id: "a", left: 0, top: 0, width: 80, height: 40 },
    { id: "b", left: 300, top: 200, width: 80, height: 40 },
  ];
  const edger = new EdgeDrawer();

  const sharp = pathOf(edger.draw(boxes, model, SHARP), "a_b");
  const round = pathOf(edger.draw(boxes, model, { clearance: 14, radius: 10 }), "a_b");

  expect(sharp).not.toContain("Q");
  expect(round).toContain("Q");
  // Curving a bend must not move where the connector meets the boxes.
  expect(points(round)[0]).toEqual(points(sharp)[0]);
  expect(points(round).at(-1)).toEqual(points(sharp).at(-1));
});

test("a corner radius never overruns the segments it joins", async () => {
  // A huge radius against a tight route: clamping is what stops the curve from
  // overshooting into the segment beyond the corner.
  const model = await makeModel("digraph { rankdir=LR; a -> b }");
  const boxes: Box[] = [
    { id: "a", left: 0, top: 0, width: 80, height: 40 },
    { id: "b", left: 120, top: 60, width: 80, height: 40 },
  ];

  const svg = new EdgeDrawer().draw(boxes, model, { clearance: 14, radius: 9999 });
  const numbers = pathOf(svg, "a_b").match(/-?\d+(?:\.\d+)?/g)!.map(Number);

  expect(numbers.every((value) => Number.isFinite(value))).toBe(true);
  expect(Math.max(...numbers)).toBeLessThan(400);
});

test("the same boxes route to the same path, twice", async () => {
  const model = await makeModel("digraph { rankdir=LR; a -> b; blocker }");
  const boxes: Box[] = [
    { id: "a", left: 0, top: 100, width: 80, height: 40 },
    { id: "blocker", left: 200, top: 100, width: 80, height: 40 },
    { id: "b", left: 400, top: 100, width: 80, height: 40 },
  ];
  const edger = new EdgeDrawer();

  expect(edger.draw(boxes, model, SHARP)).toBe(edger.draw(boxes, model, SHARP));
});

test("a route with nowhere to go is still drawn", async () => {
  // Boxes packed tight enough that no corridor satisfies the clearance. Falling
  // back to a tight route beats leaving the edge off the picture (§3.4).
  const model = await makeModel("digraph { rankdir=LR; a -> b; wall }");
  const boxes: Box[] = [
    { id: "a", left: 0, top: 0, width: 80, height: 1000 },
    { id: "wall", left: 80, top: 0, width: 80, height: 1000 },
    { id: "b", left: 160, top: 0, width: 80, height: 1000 },
  ];

  const d = pathOf(new EdgeDrawer().draw(boxes, model, SHARP), "a_b");

  expect(d.startsWith("M")).toBe(true);
  expect(points(d).length).toBeGreaterThanOrEqual(2);
});

test("an edge's style words become classes, the way a node's do", async () => {
  // `edge [style=invis]` is how DOT holds a rank in place without drawing
  // anything, so the class has to reach the path for the theme to hide it.
  const model = await makeModel("digraph { rankdir=LR; a -> b [style=invis] }");
  const boxes: Box[] = [
    { id: "a", left: 50, top: 50, width: 80, height: 40 },
    { id: "b", left: 200, top: 120, width: 80, height: 40 },
  ];

  expect(new EdgeDrawer().draw(boxes, model, SHARP)).toContain('class="edge invis"');
});

test("every connector still carries the arrowhead marker", async () => {
  const model = await makeModel("digraph { rankdir=LR; a -> b }");
  const boxes: Box[] = [
    { id: "a", left: 0, top: 0, width: 80, height: 40 },
    { id: "b", left: 300, top: 0, width: 80, height: 40 },
  ];

  const svg = new EdgeDrawer().draw(boxes, model, SHARP);

  expect(svg).toContain('<path id="a_b" class="edge"');
  expect(svg).toContain('marker-end="url(#connector-arrow)"');
});
