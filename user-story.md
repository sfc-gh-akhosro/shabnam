# Shabnam

This document tells the story from the perspective of user-designer-architect persona. It is an interwoven story tells what user wants to do, how uses the ui, might tell about ui components (casual and scatter version of silidJS arch), even major types and interfaces (casual and scatter version of types.ts), libraries or major built-in algo that we implement (arch.md), etc.

Then as you can imagine, recreating types.ts, soldijs compoennts, major classes (that implement mentioned interfaces), major methods (that have logic), and architecture is consequential to this document. It explains Shabnam as it is (at the moment of closing ceremony) but mention briefly (while telling the story) the major technical debts as well (Decisions we delayed).

As you see, while very informal, is the gateway to our app. 

his should be the most revealing for someone like "me" that oh this app is this. LLM and most docs have tendency to cateate "technical" categorization, being precisely accurate in saying, and using jargo a lot. It is like a lawyer speaking: noone can say he is wrong but noone can say what he is talking about.

I want it how "I" would explain it to my peer. Just the core but wholestic, intersting, revealing, and focusing on parts that "define" this app.


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
from the property box, and type a colour. The picture changes as you type. No
Redraw, no flicker, no waiting: the row you edited became one `setProperty` call
on a live stylesheet, and the browser repainted the one thing that changed.

The list does not wait for you to ask for a row. There is always a blank one
sitting at the top, and you make a rule by typing into it. A rule leaves by its
❌. If you type something CSS refuses — `margin: 0px0` — the row marks itself and
says so once in the console, and nothing enters the book. Mistakes are cheap.

The rows you see are not all yours. They arrive tagged with where they came from:
the **theme** first, then what Shabnam **derived** from your DOT — if you wrote
`fillcolor=lightblue`, that is sitting there as a row you can read — and then your
own on top. Three checkboxes hide any of those groups when the list gets long.
Typing over a theme row does not damage the theme file; your own file only ever
holds your rows, which is why a redraw can rebuild everything it derived last time
without touching a thing you typed.

One honest wrinkle, and it is written down as a debt: **deleting a row is not an
undo.** The book holds one entry per selector-and-property, so when you type over
the theme's value the old one is gone rather than hidden underneath. Delete the
row and the rule simply stops existing — it does not spring back to what the theme
said. Load DOT is the reset. (Debt S10. It is on the list because it surprises
people, including me.)

Two more tabs: `annotation.html`, for the one kind of label DOT cannot express —
a note parked at a coordinate — and `action.js`, which runs last, for when you
want the picture to do something.

Then you get it out, three ways, all from the one toolbar:

- **Export HTML** — one standalone file that paints the same diagram on a machine
  that has never heard of Shabnam. It carries the whole bundle, viz.js included,
  which is why it is about 3.4 MB (debt V6). That is the price of depending on
  nothing.
- **Save SVG** — opens in a browser.
- **Save PNG** — goes in a slide. Transparent, at 3x, so it lands on any theme.

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
- `Diagram.derived` walks the model and returns the rules implied by your DOT
  attributes. It never invents a colour: every value traces back to something you
  wrote or a `:root` token.
- Once the browser has painted, `Workbench.measure` reads the **real** geometry,
  and `clusters` / `shells` / `connectors` draw the SVG layer around those
  measured boxes. Graphviz's own pixel sizes and paths are never used. This is why
  an edge keeps touching its boxes after you change a font or a gap.

Graphviz's positions buy exactly two things, by the way: which rank a node is in,
and its order inside that rank. Everything else about the picture is CSS. We tried
deriving per-node spacing from the coordinates and deleted it — it was the only
number in the pipeline that was computed rather than passed through.

**The `Stylist` owns style, and it owns one stylesheet.** The part worth
understanding: there is **one book, not three layers**.

```ts
StyleRules = Map<selector, Map<property, { value, id, source }>>
source: 0 theme · 1 dot · 2 user
```

Every entry remembers who wrote it, and `addRule` is the only door in. It
**refuses a write whose source ranks below the entry already there.** That single
guard is what the three layers used to be for: a redraw feeds the DOT's rules at
source 1 and simply cannot take a row back off you at source 2. No merge step, no
plus/minus, no second map. Then it feeds CSSOM: one rule per selector, each
property a `setProperty`.

There is no CSS text on that path. Nothing builds a string to paint with and
nothing parses a sheet back to find out what is in it, because the map already
knows. `@apply` survives as a property whose value names other selectors, and it
is resolved at the moment of feeding — expansion is a read, so an expanded
declaration never becomes a row you did not write.

The one place a rule becomes text again is `serialize()` in `sheet.ts`, and only the
picture exports call it, because an SVG file has to carry its own stylesheet.

**Export is a wrapper, not a translation — and this is the decision I would most
want a newcomer to understand.** Save SVG clones the canvas into a
`<foreignObject>`, which is SVG's own way of saying *this region holds another
language, go ask that engine*. The file contains no shapes at all. Chromium opens
it and lays it out with the same engine that painted the screen, so shadows,
`color-mix()`, gradients and text are all simply correct — including CSS features
nobody has thought of yet. PNG is that same string handed to `Image` → `<canvas>`
→ `toBlob`.

We built the alternative first: a real translator, boxes into `<rect>`, text into
`<text>`, 508 lines. It is parked in `research-lab/vectorizer/` with the reason it
lost, and the reason is short. **A translator is a dictionary with one entry per
CSS feature, and this app ships a CSS editor.** Users can always reach a property
the dictionary lacks, and then the export quietly disagrees with the screen. Ours
had already dropped shadows and per-side borders once each. The library everyone
recommends for it, `dom-to-svg`, silently dropped *every label* in a record
diagram when we measured it.

The trade we accept knowingly: the SVG opens in a browser and nowhere else. That
is the use case. **We target Chromium**, and that is not a support matrix — it is a
ban on compatibility code in `src/`. No fallbacks, no polyfills, no declining a
platform feature because some other engine is slow to it.

## The interfaces worth knowing

Five of them, in `src/types.ts`. `interface` means methods; `type` means data.

```ts
interface Vizer     { render(dot) }                      // the only DOT reader
interface Diagram   { bag, frame, derived, clusters, shells, connectors }
interface Stylist   { addRule, removeRule, reset, cleanup, rows, save, serialize }
interface Workbench { redraw, inject, measure, place }   // the DOM owner
interface Files     { loadDot, saveDot, exportHtml, exportSvg, exportPng }
```

A rule is a map entry. The file on disk is the same thing as a nested object. The
row in the tab is the same thing wearing its source. There is one representation,
which is the reason this design is smaller than the one it replaced.

## What we refuse, and why it keeps mattering

No DOT parser — Graphviz already is one. No CSS parser and no CSS algebra — CSSOM
already is one, and a rule that stays data never needs to be re-read. No second
layout engine, no config tab, no IDE. The tab window is a bare `<textarea>`: no
highlighting, no completion, no library, and it is not allowed to grow into an
editor.

And the one that governs every line: **no "what if".** Code written for a state
nobody has observed is a debt someone else services. A what-if belongs in this
document, then in the architecture, then in the types — not in `src/`. If it cannot
happen, the types say so and the check is deleted. If it can happen and we choose
not to serve it, the architecture says so and the code is deleted. `coding-rules.md`
is the code of ethics; the codebase is a temple and we are its monks.

Every one of those refusals has been tried in some form and written down in
`docs/archive.md` with the reason it lost. Read that before reopening one.

## What we know is unfinished

Beyond the export size (V6) and delete-is-not-revert (S10), the two that shape
the future most:

- **`viz.js` will be replaced** by a real DOT AST plus our own layout maths
  (debt M4). Graphviz resolves `node [...]` defaults onto members at parse time,
  so no JSON it offers can tell us *where* an attribute was written. We measured
  every format; none carries provenance. Until then the model says what Graphviz
  computed, not what you wrote.
- **A saved style document has no way back in** (S11). `Save Styles` writes the
  file and the reader exists and is tested, but no verb loads it.

And the picture exports are verified by eye (V10) — a test harness for them cost
more than it guarded, so it was deleted rather than kept.
