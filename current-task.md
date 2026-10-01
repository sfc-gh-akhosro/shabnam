Always read these files in each session:
- [describe the app](./user-story.md)
- [how to design and develop](./coding-rules.md)

# Current Task

## Connectors: replace the ortho snake with the `connectors2` design

**Goal.** `src/` draws connectors with the router proven in
`research-lab/connectors/` (pathways → ports → polish) becomes a pure package with its own story. The old snake (`src/paint/edge-router.ts` and
most of `edge-drawer.ts`) is deleted.

**Read first:**
- `research-lab/connectors/story.md` — the human story (parts 1–3). This is the law for behaviour.
- `research-lab/connectors/connectors.js` — the working algorithm, as a DOM-reading class.
- `research-lab/connectors/index.html` — the 12-edge fixture: 14 bends in total, in LR and TD.
- All three files in `research-lab/connectors/` stay; do not delete or move them.

### Decisions already made (with the user)

- **The class takes no DOM.** It is built from a placement — what the layout and the measurement already give us — and returns one SVG path `d` per edge. Rendering is `Diagram.inject("connector-paths", …)`, the existing generic "write into a layer". There is no `render` in the package.
- **One node is its box in rank coordinates**, `Map<NodeId, Placed>`, in whole px:
  `{ rank, start, length, cross, depth }`.
  - `start` and `length` are the position and size on the order axis.
  - `cross` and `depth` are the position and size on the rank axis (width in LR, height in TD).
  - `cross` is needed because nodes in one rank can differ in width and alignment. The directional port sits on the node's own face, the open-side ports sit along its own `depth`, and gutters are the midpoints between neighbouring ranks' outer edges.
- **Clearance.** `--node-clearance` grows each node at both ends of the order axis; that cuts the pathways. On the rank axis connectors only run in gutters (midpoints), and the open-side ports start at least `--node-clearance` out, so the effect is clearance on all sides.
- **Ranks and order come from geometry.** Ranks are sorted ascending along the rank axis, and nodes by `start`. The axis is read from the measured boxes, never from `rankdir`. BT/RL then need no special case.
- **Port choice**, from the story: fewer bends, then directional, then shorter path (`length = entry.at − exit.at`).
  - Every node offers its directional port on the face toward the other end.
  - The first and last node of a rank also offer their open outer side: 3 positions in LR (`nw n ne` / `sw s se`), and 1 middle port in TD.
  - No debug or port-name logic.
- **An edge always draws.** When no port pair finds clear pathways, use the smallest fallback: the directional pair plus one jog in the head's gutter, ignoring the middle ranks.

- **Package at `src/connectors/`**, not inside `paint/`, because it has its own story.
- **Tokens in px**: `--node-clearance: 24px` and `--connector-lane: 6px`, beside `--connector-radius`. They go on `#diagram-canvas, svg` per §5 (not `:root`), so exports carry them. `inset` (room for the marker) is a code constant.

### Steps

1. **`app-architecture.md` first, reviewed with the user.**
   - §1: add a `Connectors` player (no DOM). Add `connectors/` to the pure packages.
   - §2: the measure line becomes boxes → placement → `Connectors` → `d` per edge → painter.
   - §4: replace the "ortho snake" paragraph with the new rules, pointing at the story. Keep the arrow paragraph and "an edge always draws".
   - §8: add `connectors/`. `paint/` loses `router`. Imports gain `diagram → connectors`; `connectors → types` only.
   - `coding-rules.md`: no change expected.
2. **`src/connectors/connectors-story.md`**, a very important doc:
   - The user's story, proofread and lightly reordered, keeping the user's vocabulary: gutters, pathways, ports, lanes.
   - The design: the steps and algorithms in general (free gaps + greedy stabbing; the port table + the three-key sort; slide; in-rank; lanes; rounded outline; fallback).
   - The core types and interface, one line each.
3. **`src/connectors/types.ts`**, core only: `Px`, `Placed` (`rank, start, length, cross, depth`), `Placement`, `ConnectorRules` (clearance, inset, lane, radius), `Link` (`from`/`to`; a `DiagramEdge` fits), `Gap`, `Port`, `Route`, and `interface Connectors { paths(links): string[] }`. `paths` returns one `d` per link, in the same order, because parallel edges share an id.
4. **The package**, soft 7, with files named after players:
   - `connectors.ts`: the class, `static place(ranks: Ranks, boxes: Box[]): Placement` (the only code that knows boxes), `constructor(placement, rules)`, and `paths(links)`.
   - `pathways.ts`: part 1.
   - `ports.ts`: part 2.
   - `polish.ts`: part 3 (slide, in-rank, lanes).
   - `outline.ts`: rounded `d`, and the only `[m, c] → x,y` mapping.
5. **Wire and remove:**
   - `Diagram.draw()`: keep `ranks` and build the placement after `painted()`.
   - `metrics()` → `rules()`, reading the tokens.
   - `EdgeDrawer` shrinks to markup: ARROW plus `<path id class d marker-end>`.
   - `DiagramPainter.svg` takes the `d`s.
   - Delete `edge-router.ts`, the snake helpers and `T.ConnectorMetrics`.
6. **Tests:**
   - Delete `test/smart-connectors.test.ts`.
   - Add `test/connectors.test.ts`: pure, hand-written placements, `radius: 0`, one test per story claim:
     - adjacent ranks
     - a middle-rank pathway
     - an open port that saves bends
     - in-rank neighbours
     - slide instead of a lane
     - lanes only when both ends differ
     - the fallback draws
   - Add the lab fixture as a parity test on the bend count per edge. No float checks.
   - The browser checks stay as they are.

### Done when

- `bun test` and `bun run test:browser` pass.
- The starter diagram and the examples look right by eye in LR and TB.
- No reference is left to `EdgeRouter`, `snake` or `ConnectorMetrics`.
- §4 describes what the code does.

## For Later
