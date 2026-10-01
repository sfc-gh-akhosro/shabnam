// The rounded outline: corner points → one SVG `d`. The only place `[m, c]`
// becomes `x,y`.

import type * as C from "./types.ts";

export function outline(points: C.RankPoint[], radius: C.Px, lr: boolean): string {
  const xy = ([m, c]: C.RankPoint) => (lr ? `${m},${c}` : `${c},${m}`);
  const pts = corners(points);
  const d = [`M${xy(pts[0]!)}`];
  for (let k = 1; k < pts.length - 1; k++) {
    const [p, q, s] = [pts[k - 1]!, pts[k]!, pts[k + 1]!];
    const r = Math.min(radius, distance(p, q) / 2, distance(q, s) / 2);
    d.push(`L${xy(toward(q, p, r))}`, `Q${xy(q)} ${xy(toward(q, s, r))}`);
  }
  d.push(`L${xy(pts.at(-1)!)}`);
  return d.join(" ");
}

// Three points on one line are one segment: only real corners round.
function corners(points: C.RankPoint[]): C.RankPoint[] {
  return points.filter((q, k) => {
    const [p, s] = [points[k - 1], points[k + 1]];
    return !p || !s || !((p[0] === q[0] && q[0] === s[0]) || (p[1] === q[1] && q[1] === s[1]));
  });
}

function distance(a: C.RankPoint, b: C.RankPoint): C.Px {
  return Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
}

// `r` px from `from` toward `to`.
function toward(from: C.RankPoint, to: C.RankPoint, r: C.Px): C.RankPoint {
  const length = distance(from, to);
  return [from[0] + ((to[0] - from[0]) * r) / length, from[1] + ((to[1] - from[1]) * r) / length];
}
