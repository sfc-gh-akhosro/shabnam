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

Five CodeJar tabs — **diagram.dot**, **theme.css**, **style.css**, **annotation.html**, **action.js** — over a live canvas. Press Redraw:

```
DOT → Vizer → VizJson → Diagram.bag → DiagramModel
        ├→ Diagram.derived → Css.plus → style.css
        └→ Diagram.frame   → measure → clusters / shells / connectors
```

`theme/theme.css` is locked and always injected first; other `theme/*.css` files are overlays. `style.css` is derived ⊎ user via CSSOM (`Css.plus`), `:root` first. If DOT has no style, derived is almost empty.

## What works today

- Load/save DOT, load/save theme, export standalone HTML, export PNG.
- Keyboard: `↵` redraw · `o`/`s` DOT · `⇧o`/`⇧s` theme overlay · `p` PNG · `e` HTML · `1`–`5` tabs.
- Node shells drawn as SVG behind the HTML, connectors as SVG lines with arrowheads.
- Captions and icons per node; `rankdir` honoured; clusters as classes.
- Themes live in `theme/`. `theme.css` is locked; overlays such as `blueprint.css` overwrite/add.
- Completer is current-line, four slots, on every tab.

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
- `css/` is the one package allowed to touch CSSOM. `Css.plus` throws without it; the expander is tested under `bun`. See S2.

---

## Next

1. Effects library (hover / glow / dash / entrance) as theme mixins.
2. More shells (R3).
3. Completer lists from the live canvas + last model (ids, classes, mixins).






