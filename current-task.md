# Shabnam

Read `AGENTS.md`, then `app-architecture.md`, then `coding-rules.md` before
touching anything. Where this file disagrees with the architecture, the
architecture wins.

---

# The story

## What it feels like to use

You open one page. On the left, a picture of a diagram. On the right, a small
stack of tabs. You type in the first tab, in DOT — the same language you would
use for any architecture diagram, `a -> b`, a `subgraph cluster_source`, a label.
You press Redraw. The picture appears.

That much is Graphviz's job, and Shabnam does not compete with it. What happens
next is the whole point. The diagram on screen is not an image. It is HTML boxes
and an SVG layer drawn on top, and **every part of it is addressable by the names
you already wrote**. The node you called `lake` is `#lake`. The subgraph you
called `cluster_source` is `.cluster_source` on each of its members. There is no
second vocabulary to learn and nothing to look up: if you can read your DOT, you
can style your diagram.

So you move to the **styles** tab. It is not a text editor; it is a list of rows.
Each row is three things — a selector, a property, a value — and that is all a
style rule has ever been. You pick `.node` from the selector box, `background`
from the property box, and a colour from the swatch. The picture changes as you
type. No Redraw, no flicker, no waiting: the row you edited became one
`setProperty` call on a live stylesheet, and the browser repainted the one thing
that changed.

The rows you see are not all yours. The list opens with the rows that came from
the **theme**, then the rows Shabnam **derived** from your DOT — if you wrote
`fillcolor=lightblue`, that is sitting there as a row you can read — and then
your own. Editing a theme row or a derived row does not damage either: it writes
a row of your own that shadows it. Your file only ever holds your rows, which is
why a redraw can throw away everything it derived last time and rebuild it
without touching a thing you typed.

Two more tabs: `annotation.html`, for the one kind of label DOT cannot express —
a note parked at a coordinate — and `action.js`, which runs last, for when you
want the picture to do something. Then you export. You get one HTML file that
paints the same diagram on a machine that has never heard of Shabnam.

## How it is built

The pipeline is short and each stage has exactly one owner.

**Graphviz reads the DOT, and nothing else does.** `Vizer.render` calls
`renderJSON` and hands back one JSON blob. That is the only DOT consumer in the
codebase — no tokenizer, no AST, no regex over statements. When DOT is malformed
mid-keystroke, one `try` / `catch` — the only one in the app — shows the message
and leaves the last good picture standing.

**`Diagram.bag` reads that JSON, and nothing else does.** It produces a
`DiagramModel`: nodes, edges, clusters, `rankdir`, with positions already turned
into numbers. Graphviz's peculiar shape is quarantined in one file. This is also
where identity is decided once for everybody — ids sanitized, subgraph names
turned into classes, a collision made loud instead of silent.

From the model, three workers build the picture, and they are all pure functions:
data in, data out, no DOM.

- `Diagram.frame` lays nodes into ranks and emits the HTML layer. It carries
  **zero inline styles** — just ids and classes, so it is measurable and stylable.
- `Diagram.derived` walks the model and returns `StyleRules` — the rules implied
  by your DOT attributes. It never invents a colour: every value traces back to
  something you wrote or a `:root` token.
- Once the browser has painted, `Workbench.measure` reads the **real** geometry,
  and `clusters` / `shells` / `connectors` draw the SVG layer around those
  measured boxes. Graphviz's own pixel sizes and paths are never used. This is why
  an edge keeps touching its boxes after you change a font or a gap.

**The `Stylist` owns style, and it owns one stylesheet.** It holds **one book**,
not three layers: `selector → property → (value, id, source)`, where source is
theme, dot or user. A write whose source ranks below the entry already there is
refused, which is what lets a redraw feed derived rules without taking a typed
row back. Then it feeds CSSOM: one `CSSStyleRule` per selector, each property a
`setProperty`.
There is no CSS text on this path. Nothing builds a string to paint with, and
nothing parses a sheet back to find out what is in it, because the map already
knows. `@apply` survives as a property whose value names other selectors, and it
is resolved at the moment of feeding, against the live map.

The one place a rule becomes text again is `Stylist.serialize()`, and only Export
HTML and Save PNG call it.

## The interfaces worth knowing

Seven of them, in `src/types.ts`. `interface` means methods; `type` means data.

```ts
interface Vizer   { render(dot) }                        // the only DOT reader
interface Diagram { bag, frame, derived, clusters, shells, connectors }
interface Stylist { addRule, removeRule, reset, cleanup, rows, save, serialize }
interface Workbench { redraw, inject, measure, place }   // the DOM owner
interface Files   { loadDot, saveDot, exportHtml, exportPng }
```

And the one data shape everything style-related agrees on:

```ts
type StyleRules = Map<string, Map<string, Entry>>   // selector → property → (value, id, source)
```

A rule is a map entry. The file on disk is the same thing as a nested object. The
row in the tab is the same thing with an origin tag. There is one representation,
which is the reason this design is smaller than the one it replaced.

## What we refuse, and why it keeps mattering

No DOT parser — Graphviz already is one. No CSS parser and no CSS algebra — CSSOM
already is one, and a rule that stays data never needs to be re-read. No second
layout engine, no config tab, no IDE. The tab window is a bare `<textarea>`: no
highlighting, no completion, no library, and it is not allowed to grow into an
editor.

Every one of those refusals has been tried in some form and written down in
`docs/archive.md` with the reason it lost. Read that before reopening one.

---

# Current task

Nothing open. Iteration 14 closed the derived-margin question by deleting it
(`docs/archive.md`).

Next session picks from `docs/technical-debts.md` — S10 (delete is not revert)
and S11 (a `StyleDocument` is written but nothing loads it) are the two that
affect a user today.
