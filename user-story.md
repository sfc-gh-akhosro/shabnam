# Shabnam

The story of the app, told to a peer. It is the first of the defining files and
the one the others grow from:

```
user-story.md ─▶ types.ts ─▶ app-architecture.md ─▶ src/ ─▶ test/
                      coding-rules.md: how every step is written
```

Read this and you should be able to say: *oh, this app does **this**, in
**this** way.* Every name in bold is a player you will meet again in the types
and in the file tree.

---

## What you do here

You make a **diagram** for a blog post or a paper. You write its meaning in DOT
— who exists, who connects, who belongs together — and Shabnam draws it. Then
you make it beautiful with CSS, pin **notes** on it (the thing diagrams are
usually bad at), and maybe leave a small **script** that runs last. When it looks
right, you export it as SVG, PNG or a standalone HTML page.

Shabnam does not compete with Graphviz. It borrows a DOT parser to read the
language and a layout library to decide what sits where, and it owns everything
after that. The picture is HTML and SVG, styled by real CSS, in a real browser.

## The page

One page, two halves. On the left, `main`: a toolbar of verbs (Draw, Open, Save,
Export…) above the canvas where the diagram lives. On the right, `aside`: four
tabs packed into one strip — DOT, styles, notes, script. The chosen tab sinks
in. Under the strip is the tab's pane: a plain textarea for DOT and script, a
list of rows for styles and notes.

The aside gets out of the way: click the canvas and it slides off; hover the
right edge and it returns. A pin — a single checkbox — holds it open.

## The diagram is alive

What you wrote is a **sketch** — the DOT, the notes, the script — and your
styles live in the **Stylist**. The **Workbench** holds both while you edit
them in its four tabs, and the **Chrome** along the top runs the verbs: draw,
open, save, export. When you ask for a draw, the Workbench hands the sketch and
the stylist to the **Painter**, which owns the canvas and is the only thing that
writes the picture.

Drawing is a short relay, each runner owning one leg:

- The **Parser** reads the DOT once and gives three answers: the *model*
  (who exists, who connects, who belongs), the *styles* the author wrote in DOT,
  and the *points* — your own graph with everything that gives a node size cut
  away, so every node is a point and every layout hint you wrote survives.
- The **Layout** hands the points to Graphviz and reads back where
  they landed: each node gets a rank and an order inside it. That is all we
  ask of layout.
- The **Painter** frames model and ranks as HTML — ranks of real divs. The
  browser paints them under whatever CSS is live, the Painter **measures** the
  real boxes, the **Router** finds a way for every edge between them, and the
  Painter draws one SVG around them: cluster boxes, node shells, connectors.
- The notes are placed on what they point at, and the script runs last.

Two libraries, two walls: only the `Parser` knows the DOT parser exists, only
the `Layout` knows Graphviz does. Replacing either is one file.

Measuring after paint is the trick that makes CSS the boss. Put
`font-size: 24px` on `.node` and the divs grow; the shells and connectors are
drawn from the measured boxes, so they stay glued.

## Identity in CSS is identity in DOT

Because DOT defines the meaning, we use its names religiously. Node `bq` is
`#bq`. The edge from `bq` to `catalog` is `#bq_catalog`. A `subgraph cluster_x`
becomes the class `.cluster_x` on every member, and a cluster also gets its box
drawn in SVG. A node is `.node`, or `.record` for `shape=record`; any other
shape names itself in `data-shape`. Someone who can read the DOT can write the
CSS without learning a second vocabulary.

## The style book

Every style is one line: *selector's property = value*, plus where it came
from — the **theme** (0), the **DOT** (1), or **you** (2). The **Stylist**
keeps them and drives the browser's CSSOM directly; there is no CSS text on the
way to the screen.

There is one door in: `stylist.add(style)`. It asks CSSOM first — a value the
browser refuses never enters the book, and your row is marked invalid. It also
refuses a style from a lower source than the one already there, so a redraw
re-reading the DOT can never take a line back from you. That single guard is
what used to take three layers.

`@apply` is ours: a property whose value names other selectors, expanded when
fed to CSSOM. The theme's building blocks — `.row`, `.col`, `.paper`,
`.glass` — exist only to be applied; they never reach the sheet on their own,
so the chrome can use the same four words without the diagram's styles leaking
onto it.

## Connectors

The **Router** draws them. Connectors run across ranks through **pathways** — the gaps between nodes, each
node grown by a clearance — and along ranks only in the **gutters** between
them; the layout already is a grid, so there is no search for free space. A
route needs as few pathways as it can, then picks its ports: fewer bends, then
the directional face, then shorter. Crossing runs slide apart before a gutter
gets a second lane. A layout with no clear way through is a bug we want to
see, so it throws rather than drawing a guess. Bends are rounded by one radius. The whole story is
`src/engine/story-router.md`.

## Export

Export is a wrapper, not a translation. The SVG is the canvas cloned into a
`<foreignObject>` with the style book printed beside it, so the same browser
engine that painted the screen paints the file — shadows, gradients and fonts
included. PNG is that SVG rasterized. Transparency is one appended rule, not a
rectangle painted behind. The price, paid knowingly: the SVG opens in a browser.

## The pieces, and how they talk

The chrome is built from four small pieces, each a native control with a CSS
face: **Radios** (the tab strip, the export format — the chosen one sinks in),
**Checks** (the style filter, the transparency flag, the pin — a checked one
rises and glows), **RowList** (style rows and note rows, one widget with two row
kinds), and **DialogAsk** (a native dialog you `await`). The toolbar, the
textareas and the canvas are plain HTML; wrapping them would add nothing.

The **Workbench** is the page. It finds the skeleton already written in
`index.html`, fills in the pieces, binds them to the diagram, and runs the
verbs. Tabs are shown and hidden, never rebuilt.

They talk in four ways, and each situation has exactly one:

- To tell a piece what to show, **call** it.
- When the user touches a piece, its **native event** bubbles up.
- When two parts share a fact without knowing each other, they share a
  **Topic** — a typed value you publish and subscribe to. The diagram's DOT,
  notes and script are topics; so are the page's active tab and the pin.
- When you must wait for an answer, you **await** it.

A topic holds a fact, never a command. Verbs — draw, open, save, export — are
one map from command to action, shared by the toolbar and the keyboard.

Nothing draws while you type. The DOT textarea publishes as you type, but only
`draw()` reads it; rows commit on `change`, not per keystroke.

## What we refuse

No DOT parser of our own, no CSS parser, no second layout engine, no second UI
framework. No config tab, no IDE — the text panes stay bare textareas. No
recovering an author's defaults by statistics: the parse tree says where each
attribute was written. And no "what if": code for a state nobody has observed.
