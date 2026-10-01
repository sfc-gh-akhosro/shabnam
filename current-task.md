Always read these files in each session:
- [describe the app](./user-story.md)
- [how to design and develop](./coding-rules.md)

# Current Task

## Connectors: port the lab class into `src/`, logic intact

**Goal.** `src/connectors/` is `research-lab/connectors/connectors.js` behind
the no-DOM wall: measures in, one path `d` per edge out. The logic is the
lab's. If a picture differs from the lab page, the port is wrong.

**Why this task exists.** The last port retyped the lab into six files (about
401 lines), renamed its internals and changed its geometry: gutters and the
open-port corridor were built from `clearance` because `--gap` was dropped, and
a fallback and an invisible-node case were added. Do not repeat that.

**Read first:**
- `research-lab/connectors/connectors.js` — the product. 200 lines, one class.
- `research-lab/connectors/story.md` — the human story, parts 1–3.
- `research-lab/connectors/index.html` — the 12-edge fixture: 14 bends, LR and TD.
- The three lab files stay where they are.

### Decisions (made with the user)

- **Keep the wall that exists.** `Connectors.place(ranks, boxes) → Placement`
  is the only code that knows boxes. `new Connectors(placement, rules)
  .paths(links) → string[]`, one `d` per link in order. `EdgeDrawer` writes
  markup only. `DiagramPainter.svg(boxes, model, ds)` stays. Axis from the
  measured boxes, never `rankdir`. A node is `{ rank, start, length, cross,
  depth }` in whole px.
- **One player, one file.** `src/connectors/connectors.ts` is the class and its
  helpers. Pathways, ports and polish are paragraphs of the story, not files.
  Delete `pathways.ts`, `ports.ts`, `polish.ts`, `outline.ts`.
- **Copy, do not retype.** Lab function and field names stay: `meet`,
  `nearest`, `holding`, `ports`, `stab`, `choose`, `place`, `points`,
  `inRank`, `assignLanes`, `rounded`; `r i lo hi o m0 m1 extra free segs`.
  The only new code is the wall: `place` (+ building the lab's `g`, which
  `measure` built from the DOM) and `paths` (lab `route` + `polish`, with
  `rounded` returning the `d`s instead of `render` writing them).
- **`--gap`, as in the lab.** A token on `#diagram-canvas, svg`, beside
  `--node-clearance` (lab `--clear`), `--connector-lane` (lab `--lane`) and
  `--connector-radius` (lab `--edge-radius`). Gutters are `m0 − gap/2`,
  midpoints, `m1 + gap/2`; the open corridor is `[lo − gap, lo − clear]` and
  `[hi + clear, hi + gap]`. No number is derived from another. `inset` stays
  the code constant 6.
- **Invisible is not there.** The connectors' entry removes it: `place` drops
  a node that does not paint (`.invis` measures 0×0), and an edge to a node it
  dropped is not routed. Past the entry, the router never sees one. No other
  code removes them.
- **No fallback.** Lab `choose` returns the best clear pair. If there is none,
  it throws. Let it.

### Steps

Stop after step 1 for review, as the ritual says.

1. **Story, types, architecture.** No class code.
   - `src/connectors/connectors-story.md`: rewritten from the lab story and
     the lab's rules, in the user's words (gutters, pathways, ports, lanes).
     Every number traces to the lab. Remove the corridor-from-clearance, the
     fallback, the empty-`d` exception and the `bands`/`open` wording. The
     public types at the end, one line each.
   - `src/connectors/types.ts`: the public contract only — `Px`, `Placed`,
     `Placement`, `ConnectorRules` (`gap, clear, inset, lane, radius`),
     `Link`, `interface Connectors { paths(links): string[] }`. The lab's
     inner records are typed in `connectors.ts`. Root `src/types.ts` is
     unchanged.
   - `app-architecture.md` §4: point at the package story, name the tokens,
     state the three decisions above in one sentence each; keep the arrow
     paragraph. §8: `connectors/` is one file. §1 and §2 stay.
   - `user-story.md` Connectors paragraph: only what "no fallback" makes untrue.
2. **Stitch.** Paste the lab class into `connectors.ts`, swap
   `measure`/`render` for `place`/`paths`, add TS types. Delete the four extra
   files.
3. **Wire.** `Diagram.rules()` reads `--gap`; add `--gap` to
   `theme/basic-theme.json` with the lab's value (5em).
4. **Tests.** Replace `test/connectors.test.ts`: pure, radius 0, one test per
   story claim (adjacent ranks, middle-rank pathway, open port saving bends,
   in-rank neighbours, slide instead of a lane, lanes only when both ends
   differ), plus the lab fixture parity on bends per edge
   `[2,2,2,0,0,2,2,0,2,0,0,2]` in LR and TD, on the lab's boxes and numbers
   (`gap` 5em, `clear` 2em at 13px). Drop the fallback and invisible-node
   tests. No float checks. If parity fails, fix the copy, not the geometry.

### Done when

- `bun test` and `bun run test:browser` pass.
- `src/connectors/` is `connectors.ts`, `types.ts`, `connectors-story.md` —
  about 250–280 lines of code, down from about 401.
- The starter and `research-lab/example-2.dot` on `bun run dev` look like the
  lab page by eye.
- No fallback, no derived gap, no renamed lab internals.

## For Later
