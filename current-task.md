
Always read these files in each session:
- [describe the app](./user-story.md)
- [how to design and develop](./coding-rules.md)

# Implementation Plan

## Plan: hand-made snake connector in `research-lab/connectors/`

## Context

- There's a research spike next to `research-lab/arrow-probe/index.html` (same style: one page, open it directly). `src/` is untouched.
- Today's router (src/paint/edge-router.ts, 311 lines) is grid + A\*. This spike tests whether a hand-made snake is shorter and reads better.
- Scope is the path only: no rounding, arrows, jumps, lanes, ports or styling.

## Files

- `research-lab/connectors/index.html`: **everything in one page** (HTML + CSS + JS), opened directly in the browser.
- `research-lab/connectors/readme.md`: the rules below, plus findings (router line count, screenshots, verdict).

## The page

### HTML (hand-written, easy to edit)

```html
<main id="canvas" class="lr">
  <div class="rank" id="r1">
    <div class="node" id="n11">n11</div>
    <div class="node" id="n12">n12</div>
    <div class="node" id="n13">n13</div>
  </div>
  <div class="rank" id="r2">
    <div class="node" id="n21">n21</div>
    <div class="node" id="n22">n22</div>
  </div>
  <div class="rank" id="r3"> ... </div>
  <svg id="edges"></svg>
</main>
```

Edges are one small JS list: `const EDGES = [["n11","n22"], ["n13","n21"], ...]`. Each draws as `<polyline class="edge" id="n11_n22">`.

### CSS (minimal, meant to be changed by hand)

- `#canvas` is `display:flex; gap: var(--horizontal-gap)`. `.lr` uses `flex-direction: row` and `.td` uses `column`.
- `.rank` is `display:flex; flex-direction: column` (row in `.td`), `gap: var(--vertical-gap)`, and `justify-content` is left for you to change.
- `.node` has a border only. Sizes are per id (`#n12 { height: 80px }`) so rows don't align.
- `#edges` is absolutely positioned over the canvas, with `pointer-events:none`. `.edge` has `fill:none; stroke:black`.
- That's roughly 15 lines of CSS, with nothing decorative.

### JS (inline)

- `measure()`: reads `.node` boxes with `getBoundingClientRect` relative to `#canvas`, with the rank taken from the parent `.rank`'s order. The gaps are read from the computed `--horizontal-gap` / `--vertical-gap`.
- `route(tail, head)`: the snake, described below. Target \~100 lines.
- `draw()`: sets the `points` on each polyline. It re-runs on load, on resize and on the LR/TD toggle button. A `ResizeObserver` on the nodes lets live CSS edits in devtools re-route as well.

HTML decides the layout. The SVG only reads the boxes.

## Router rules

### Axis-free geometry

- Logic works in **(main, cross)** coordinates: main is the rank axis (x in LR, y in TD), and cross runs along a rank. One `swap(p)` converts at the input and the output.
- A **gutter** is the mid-line of the gap between adjacent ranks. It is **always safe** and never checked.
- A **cross-run** is a segment along main at a fixed cross value. It's the only thing checked: `clear(c, m1, m2)` means no node box, grown by the margin, touches it.
- **Levels** are the candidate cross values: the tail centre, the head centre, and the middle of every row gap between the two ends.

### No-going-back rule (the law)

> Every segment moves the snake toward the head on its own axis, or not at all. Along main and along cross, the distance to the head never grows.

The outside-lane fallback is the only exception, and it's taken only when nothing monotone exists.

### Ends

Each end may use the side facing the other end on main, or the side facing it on cross. Every combination that obeys the law is a candidate, and the best path wins.

### Candidates by bend count

The fewest bends wins, then the shortest. Stop at the first bend count that has a clear path.

| Bends | Shape                                                          | Checks                                                           |
| ----- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| 0     | straight                                                       | ends share a cross value; one `clear`                            |
| 1     | L: exit on the main side, bite the cross side (or the reverse) | cross-run clear; the other leg passes no node in the prey's rank |
| 2     | Z: tail level, then gutter *k*, then head level                | two `clear`s, for each gutter *k* between the ends               |
| 4     | tail level, gutter *a*, level *L*, gutter *b*, head level      | three `clear`s; *a* before *b*, *L* between the ends' levels     |

**Same-rank pair:** a direct cross-side run if the nodes between allow it. Otherwise out to the nearer gutter, along it, and back in (2 bends, always clear).

### Fallback

One cross-run on an outside lane beyond the diagram's edge, on the side nearer the ends. It's always clear, so every edge draws.

## Implementation steps

1. Write the page skeleton: HTML ranks and nodes, the minimal CSS, the SVG overlay, and an LR/TD toggle.
2. Add `measure()` and `swap()`: boxes to (main, cross), ranks, gutters and levels.
3. Add `clear()` and candidate enumeration for 0, 1, 2 and 4 bends under the law.
4. Add the winner pick, the same-rank case and the outside-lane fallback.
5. Add `draw()` with `ResizeObserver` and toggle re-runs.
6. Fill the edge list to cover every quadrant, same rank, adjacent and far ranks, and one forced fallback. Also add a copy of example-2's shape.
7. Write `readme.md` with the rules, the router line count, LR and TD screenshots, and the verdict.

## Verification

- Open `research-lab/connectors/index.html` in the browser and screenshot it in LR and TD.
- Check by eye that no polyline enters a node box, that no segment moves away from its head except the fallback edge, and that every edge draws.
- Edit a node height or a gap in devtools and confirm it re-routes live.
- Count the router's lines (the `route` + helpers block).

## Critical files

- `research-lab/connectors/index.html`: the whole spike.
- `research-lab/connectors/readme.md`: rules and findings.
- src/paint/edge-router.ts: the baseline to compare against (read only).
