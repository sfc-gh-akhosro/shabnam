# Shabnam

Nothing is in progress. The section below is orientation; the section after it is
the menu. Read `AGENTS.md`, then `app-architecture.md`, then `coding-rules.md`
before touching anything — this file does not repeat them, and where it disagrees
with the architecture, the architecture wins.

---

## What Shabnam is

**A DOT diagram goes in, a styleable HTML page comes out.** You write Graphviz
DOT for the *structure* — who exists, who points at whom, who is grouped with
whom — and then you style the result with plain CSS instead of DOT attributes.
The diagram is real HTML: divs, spans, an SVG layer. Not an image, not a canvas.
That is the whole idea, and everything below follows from it.

The one law that makes it usable: **identity in CSS is identity in DOT.** A
subgraph named `cluster_a` is `.cluster_a`, a node named `lake` is `#lake`, an edge
`lake -> runtime` is `#lake_runtime`. Nothing is added, nothing is stripped. Whoever
wrote the diagram already knows every selector they need, and no lookup table
exists to fall out of date. (§3.1)

It is a **single-page browser app** with no server, no database and no Snowflake
dependency. ~2,000 lines of TypeScript. Graphviz runs in the page via
`@viz-js/viz`, and it is asked only for *layout* — `renderJSON` gives coordinates
and attributes, never SVG. There is no DOT parser anywhere in this codebase and
there must never be one (§3.5).

## The shape of it

Five tabs — **DOT**, **Base CSS**, **My Style**, **HTML**, **JS** — over a live
canvas. Press Redraw and the pipeline runs:

```
DOT → Vizer → VizJson → DiagramBagger → DiagramModel
        ├→ CssBagger    → Base CSS   (generated, editable)
        └→ LayoutFramer → HTML       → Measurer → NodeSheller (shells)
                                               → EdgeDrawer  (connectors)
```

**Base CSS is generated from the DOT, and it is the interesting part.** Every
colour, font and stroke the DOT asked for arrives as a CSS rule you can read and
change, and it contains *only* what the DOT actually said — a four-colour diagram
produces exactly four colour mentions, never a default we invented. **My Style**
is yours and is never regenerated.

Because Base CSS is both generated and editable, edits to it have to survive the
Redraw that regenerates it. They do: on Redraw, edits are diffed against the
*last derived* text and rebased into My Style, and the status line reports how
many rules moved. The diff is done by **CSSOM** — an off-document
`CSSStyleSheet` is the parser — so reformatting, `RED` vs `red`, and shorthand
vs longhand do not register as edits. The browser's own serialisation decides
what "changed" means, which is why no CSS knowledge is hand-maintained here.

## What works today

- Load/save DOT, load/save theme, export standalone HTML, export PNG.
- Keyboard: `↵` redraw · `o`/`s` DOT · `⇧o`/`⇧s` theme · `p` PNG · `e` HTML · `1`–`5` tabs.
- Node shells drawn as SVG behind the HTML, connectors as SVG lines with arrowheads.
- Captions and icons per node; `rankdir` honoured; clusters as classes.
- A shipped theme, `theme/blueprint.css`, that restyles everything through CSS alone.
- 14 tests (`bun test`), typecheck clean, `bun run build` → `dist/`.

Verified in a browser against `research-lab/example-1.dot`, which is the fixture
every iteration is checked against. `bun research-lab/probe-json.ts` dumps the
model headlessly when you need to see it without a browser.

## Where the bodies are buried

- `docs/archive.md` — how it got built, iteration by iteration, plus closed debts
  and *why* they were closed. Read this before re-litigating a decision.
- `docs/technical-debts.md` — open debts only, with what closing each one costs.
- **Shells and icons travel as markup**, not as file paths, so an export needs
  nothing external.
- **App-owned ids are prefixed `shabnam-`.** Node ids come from the DOT and share
  the page's id space, so this prefix is the only thing stopping a node named
  `connectors` from colliding with our SVG sink of the same name.
- `style/` is the one package allowed to touch CSSOM, and it cannot be tested
  under `bun` (no CSSOM) — it is verified in a browser. See S2.

---

## Next — make it useful

The framework and visual styling grid are down. The direction from here:

1. **A library of predefined effects and animations** to pick from in CSS —
   hovers, glows, dashes, transitions, entrances.
2. **More shells** (R3) in `svg/`.
3. **S3** warning diagnostics when an unrecognized CSS declaration drops.






