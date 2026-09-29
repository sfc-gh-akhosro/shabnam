# Shabnam, redesigned — the story

Story → types → architecture → code. `coding-rules.md` binds; the current
architecture does not. Two walls survive on merit: one class sees the DOT
parser, one class sees the layout library.

Names read. A bare `Book`, `Reader` or `Layout` says nothing; `styleBook`,
`dotReader`, `dagreLayout` say what they hold. And a class does one job
through a few verbs, so `styleBook.add(style)` is the only way in — never an
`add` beside an `absorb`.

---

## 1. The story, and who is in it

You make a **diagram**. You write its meaning in DOT, dress it with a **style
book**, pin **notes** on it, and maybe leave a **script** for last. Press Draw
and the diagram shows itself on the canvas. Export takes the picture away.

So the diagram is not a file we pass around. It is a living thing on the page:
it holds what you wrote and knows how to draw itself. Everything else either
helps it draw or lets you edit it.

| Player | Job | Kind |
|---|---|---|
| `Diagram` | holds dot · styleBook · notes · script; `draw()` renders into `#diagram-canvas` | the living state |
| `DotReader` | DOT → model, derived styles, bare graph (walls `@ts-graphviz/ast`) | pure |
| `DagreLayout` | bare graph → rank, order, rough x/y (walls `dagre`) | pure |
| `DiagramPainter` | model + positions → HTML; measured boxes → SVG | pure |
| `StyleBook` | the style rules and the one live CSSOM sheet | owns `#style-css` |
| `Workbench` | the page: builds the pieces, binds them to the diagram, runs the verbs | owns the chrome |

The **bare graph** is nodes as sizeless points plus the arrows between them —
the least layout needs. The reader produces it; dagre places it.

Draw, told once:

```
dot ─DotReader─▶ model ───────────────────────────────┐
            ├──▶ styles (source 1) ─▶ styleBook.add(each)
            └──▶ bare graph ─DagreLayout─▶ positions ─DiagramPainter─▶ #diagram-html
                         [browser paints] ─ measure ─DiagramPainter─▶ #diagram-svg
                         notes ─▶ #annotation-html, then the script runs
```

The workbench edits the diagram's parts; the diagram reads them when it draws.
Nothing passes a store down, and nothing reaches into another piece's DOM.

```
src/
  index.html   the page skeleton, the canvas, <template>s for repeated bits
  index.ts     new Workbench(document.body)
  app.css      tokens · skeleton · surfaces · one block per piece
  types.ts     the players, their data, the pieces — the design, readable

  diagram/     Diagram — the living state and draw(); files (open, save, export)
  read/        DotReader — the only DOT reader
  layout/      DagreLayout — the only geometry source
  paint/       DiagramPainter + framer, shaper, sheller, router, drawer, markdown
  style/       StyleBook + sheet — rules and CSSOM. no view
  ui/          topic, radios, checks, row-list, dialog-ask — know nothing about DOT
  workbench/   workbench, commands, style-tab, note-tab, export-dialog
```

Arrows point one way: `workbench → ui, diagram` · `diagram → read, layout,
paint, style` · `ui → types`. A `ui/` piece never imports the diagram. The
rows are not the rules, so the styles view lives in `workbench/`.

---

## 2. What you see

```
body ──────────────────────────────────────────────────────────────────────────
│ main.col                                         │ aside.col.glass          │
│ nav.row  [logo] Shabnam (Draw)(Open)(Save)       │ nav.radios               │
│                 (Export…)(HTML)(Save styles)     │  DOT│styles│notes│JS     │
│ article#diagram-canvas                           │ section[data-tab=dot]    │
│   #diagram-html     ranks, nodes                 │   textarea               │
│   svg#diagram-svg   clusters, shells, edges      │ section[data-tab=styles] │
│   #annotation-html  notes                        │   .checks  theme│dot│me  │
│   style#style-css   script#action-js             │   .rows  [.row]…         │
│                                  .checks.pin 📌  │ section …notes, script   │
──────────────────────────────────────────────────────────────────────────────
dialog.paper  .radios SVG│PNG  .checks transparent  scale [3]  (Export)(Cancel)
```

`index.html` is the skeleton: main, aside, the canvas sinks and all four tab
sections, written once. A tab shows by flipping `hidden`, so nothing mounts or
unmounts, a textarea keeps its caret, and no listener is ever removed. Code
builds only what repeats (a row, a choice) from `<template>`s.

---

## 3. The pieces

Each wraps a native control. To JS a checkbox is a checkbox; CSS does the face.

| Piece | Is | Used for |
|---|---|---|
| `Radios<K>` | `label > input[type=radio]`, tight; chosen **sinks in** | tabs, export format |
| `Checks<K>` | `label > input[type=checkbox]`, tight; checked **rises and glows** | source filter, transparent, pin |
| `RowList<R>` | `.row`s of inputs, ❌ and ➕; a `Map` of row kinds decides the columns | styles, notes |
| `DialogAsk<A>` | native `<dialog>`: `await exportDialog.ask()` | export |
| `Topic<T>` | a typed value you subscribe to; no DOM | shared state |

Not pieces: the toolbar (`nav` of `button[data-command]`), the textareas, the
canvas. Each is HTML plus one listener.

A tab is where you are, so it recedes; a check is something you turned on, so
it stands out. The pin is a one-label `Checks`, not a special case.

`new Checks(el, choices, topic)`: the host already exists, the piece fills it
and binds the topic, and never attaches itself. More than about three
`querySelector`s means it is two pieces.

---

## 4. How the pieces talk

| You are… | You… |
|---|---|
| telling a piece what to show | **call** it: `noteList.render(notes)` |
| a piece the user touched | let the **native event** bubble (`change`, `click`); dispatch your own only when native says too little (`row-edit {index, row}`) |
| sharing a fact with someone you don't name | a **`Topic`**: `pub`, `sub`, `value` |
| waiting for an answer | **`await`** a promise the dialog's `close` settles |
| running a verb (draw, open, save, export) | **`COMMANDS.get(cmd)()`**; the toolbar and the chords share one `Map` |

The diagram's parts and the page's view are topics:

```
diagram.dot · diagram.notes · diagram.script · diagram.styleBook.changed
view.tab · view.pinned · view.shown
```

- `Cmd+2` is `view.tab.pub("styles")`; the strip and the sections follow.
- Open makes a new `Diagram`; the textarea follows its `dot`. Files never touch
  a textarea.
- A note edit publishes `diagram.notes`; the diagram re-places its marks (no
  draw) and the note tab re-renders.
- A style row commits with `styleBook.add(style)`; `false` marks the row
  `.invalid`, and the book is untouched.

Five rules:
1. A topic holds a fact, never a verb.
2. Nothing draws while you type: `dot` is published on `input`, but only
   `draw()` reads it. Rows commit on `change`.
3. A subscriber that throws, throws. husk's shape, without its `try`.
4. No `unsub` yet: nothing ever unmounts.
5. One listener per piece, on its root; lists delegate with `closest(".row")`.

---

## 5. `types.ts` — the design, readable

Only what the story names. Row columns, event details and intermediate shapes
live in the files that use them.

```ts
type TabId   = "dot" | "styles" | "notes" | "script";
type Command = "draw" | "open" | "save" | "export-picture" | "export-html" | "save-styles";
type Source  = 0 | 1 | 2;                                    // theme · dot · user
type Style   = { selector: Selector; property: Property; value: string; source: Source };

interface Topic<T> { readonly value: T; pub(v: T): void; sub(fn: (v: T) => void): void }

interface Diagram {                                          // the living state
  readonly dot: Topic<string>;
  readonly styleBook: StyleBook;
  readonly notes: Topic<Note[]>;
  readonly script: Topic<string>;
  draw(): Promise<void>;
  place(): void;                                             // re-anchor notes, no draw
}

interface StyleBook {
  add(style: Style): boolean;          // false: CSSOM refused it, or a higher source owns it
  remove(style: Style): void;
  styles(): Style[];                   // what the styles tab shows
  readonly changed: Topic<number>;
}

interface DotReader      { model(): DiagramModel; styles(): Style[]; graph(): PointGraph }
interface DagreLayout    { place(graph: PointGraph): Positions }
interface DiagramPainter { frame(m: DiagramModel, p: Positions): Html; svg(m: DiagramModel, b: Box[]): SvgLayers }

interface Piece { readonly el: HTMLElement }
interface RowList<R>   extends Piece { render(rows: R[]): void; mark(i: number, invalid: boolean): void }
interface DialogAsk<A> extends Piece { ask(): Promise<A | undefined> }   // undefined = cancelled
// Radios and Checks add no methods: they read and write their Topic.
```

What falls out:

- **One door into the book.** Theme, DOT and user all arrive through
  `styleBook.add`, each style carrying its own source, so the "lower source
  never overwrites higher" guard lives in exactly one place.
- **The reader stamps `source: 1`.** It knows where its styles came from.
- **No row id in the public shape.** A style is found by selector + property,
  as CSSOM finds it; the row carries the pair as `data-` attributes.
- **No `reset()`.** Open makes a new `Diagram`, whose new `StyleBook` is seeded
  from the theme — `add` in a loop again.

---

## 6. CSS

Same look; names and order change.

| Class | Is | Today |
|---|---|---|
| `.row` `.col` | flex row / column with the token gap | `.row` + position selectors |
| `.paper` `.glass` | the two surfaces | tokens, copied by hand |
| `.radios` | tight strip, chosen sinks | `aside nav button` + `.active` |
| `.checks` (`.pin`) | tight strip, checked rises and glows | `.checkbox`, `#freeze` |
| `.rows` / `.rows.notes` | the list / the note variant | `.rows` / `.annotations` |
| `.invalid` | a refused value | same |

```css
.radios, .checks             { display: flex; gap: 0; }
.radios input, .checks input { appearance: none; margin: 0; }
.radios label, .checks label { flex: 1; text-align: center; box-shadow: var(--flat-shadow); }
.radios label:has(:checked)  { box-shadow: inset var(--flat-shadow); }
.checks label:has(:checked)  { box-shadow: var(--raised-shadow), 0 0 6px var(--accent-color); }
```

`.active` is gone; a real radio owns the chosen state.

The four core names are chrome classes, and the theme's mixins of the same
name never reach CSSOM: the style book expands them into the rules that
`@apply` them and never feeds them to the sheet on their own. So restyling the
diagram's `.row` can never move the styles tab.

---

## 7. The lab

```
research-lab/ui-redesign/
  index.html   the new skeleton + templates, linking src/app.css
  ui/          the pieces, built here first
  lab.ts       every piece on one page, fake data: rest / checked / invalid
  probe.ts     subscribes to every topic, listens on body for every event,
               prints each message as it crosses
```

The lab calls `src/` as it is, so once the pieces feel right it mounts a real
`Diagram` and proves the draw story. Then `ui/` and `workbench/` move into
`src/`, and SolidJS leaves `package.json`.

---

## 8. Decided, so you can disagree

1. The `Diagram` is the living state and draws itself; there is no Engine.
2. Names read on their own: `StyleBook`, `DotReader`, `DagreLayout`,
   `DiagramPainter`. One verb per job — `styleBook.add` is the only way in.
3. The skeleton is HTML and tabs flip `hidden`: no mount, no destroy, no `unsub`.
4. Mixins never reach CSSOM; that is what makes the four names shareable.
5. `types.ts` holds the design; details live with their code.
6. No `Button`, `TextEditor` or `Toolbar` class: native HTML already is one.
