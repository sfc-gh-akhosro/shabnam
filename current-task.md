# Shabnam

Read `AGENTS.md`, then `app-architecture.md`, then `coding-rules.md` before
touching anything. Where this file disagrees with the architecture, the
architecture wins.

---

# Memo

A note to the next session. Two columns of the same design. Names are the ones
in `src/types.ts` and the packages that implement them.

## Product (same in both columns)

Shabnam is **DOT semantics** + **viz.js parse and layout** + **CSS / HTML / JS**
for look and interaction + **ready themes and effects** + **a fiddle** +
**portable** (HTML now; SVG later).

The end-user object is a **dotFiddler** (name still open): one page, five tabs,
one canvas, export that runs without us.

We only do our job. We do not reinvent Graphviz, layout, CSS parsing, or a code
editor. The idea goes to market on a short stack. Adding, removing, or rescoping
a library is a conversation. A library means we accept its whole dependency tree.

**Stack we have accepted**

| | Role |
|---|---|
| Bun | Package and run. ESM only. |
| TypeScript | `interface` = methods, `type` = data, `Map` = dispatch. |
| SolidJS | Page shell. |
| HTML + CSS | Picture and cascade. The browser is the CSS engine. |
| viz.js (`@viz-js/viz`) | Only DOT consumer. |
| CodeJar | **Experiment.** Read/write/highlight in a tab. Not an IDE. Same conversation to drop it as to add it. |

Nothing else is on the stack until we talk.

## 1. How it should be

Process, interfaces, UX, and architecture as one thing. This is also what
`app-architecture.md` §4, §5, and §10 already say.

### Workbench

The fiddle *is* `Workbench`. Tabs hold source. Sinks on `#shabnam-canvas` hold
the picture. `SetTab` is how bytes enter a tab (load, seed, user edit, or a
deliberate machine write). `inject` is how bytes enter a sink. Those are
different directions.

```ts
interface Workbench {
  redraw(): Promise<void>;
  inject(sink: string, text: string): void;
  measure(): Box[];
  place(boxes: Box[]): void;
}

interface Files {
  loadDot(text: string): void;
  saveDot(): string;
  listThemes(): string[];
  loadTheme(name: string): string;
  saveTheme(name: string, css: string): void;
  exportHtml(): Promise<string>;
  exportPng(): Promise<Blob>;
}
```

`redraw` is **sync with the DOT tab** — the full draw. Other tabs do not need
Graphviz: style re-merges and `inject`s CSS; theme re-injects the locked base
plus overlay; annotation `inject`s and `place`s; action `inject`s last. The UI
may still expose one Redraw button that always runs the DOT path. That is a
simplification, not a second pipeline.

`suggestions` does not belong on `Workbench`. Autocomplete is not the fiddle.

**`redraw` (the draw process)**

1. `Vizer.render(dot)` → `VizJson`. Only DOT parse.
2. `Diagram.bag(json)` → `DiagramModel`. Only JSON read. Identity is decided here.
3. `Diagram.frame(model)` → layout HTML. **No inline styles.**
4. `Diagram.derived(model)` → derived CSS. Almost empty if DOT had no presentation.
5. `style = Css.minus(style, lastDerived)` then `Css.plus(style, derived)` → new `style.css`.
6. `inject` theme and compiled style; `inject` main-html and annotation.
7. Wait a frame. `measure()` → `Box[]`.
8. `Diagram.clusters` / `shells` / `connectors` → SVG. Still no inline style on the HTML layer.
9. `place(boxes)` parks annotation. `inject` action last.

### Css

CSS is a value we add and subtract. The browser parses it (CSSOM). We do not.

```ts
interface Css {
  plus(style: string, derived: string): string;
  minus(style: string, take: string): string;
  expand(css: string, theme: string): string;
}
```

`plus` overlays derived onto style; same selector+prop, author's existing keys
win, new derived props land. Missing `CSSStyleSheet` throws. No concat fallback.

`minus` is the inverse: drop what `take` asserts. Needed because `plus` writes
back into the style tab; without it we accumulate.

`expand` is not plus/minus. It compiles `@apply` / `@mixin` against the theme
**into the sink**.

Themes and effects are files. `theme/theme.css` locked base. `theme/*.css`
overlays. Effects are classes in the theme (`.glass`, `.raised`). Derived CSS
does not emit `transform` / `animation`.

**Style tab is a merge buffer** (law). `redraw` may `SetTab("style", plus(…))`.
Then `Css` (not CodeJar) owns newlines, because CSSOM `cssText` is one line per
rule. CodeJar only paints whatever `SetTab` gave it.

### Diagram and Vizer

```ts
interface Vizer {
  render(dot: string): Promise<VizJson>;
}

interface Diagram {
  bag(json: VizJson): DiagramModel;
  frame(model: DiagramModel): string;
  derived(model: DiagramModel): string;
  clusters(boxes: Box[], model: DiagramModel): string;
  shells(boxes: Box[], model: DiagramModel): string;
  connectors(boxes: Box[], model: DiagramModel): string;
}
```

viz.js answers order, names, and attributes already on objects — then leaves.
Workers in `diagram/` stay private; the facade is the package.

Identity in CSS is identity in DOT. Collision after sanitize throws. HTML owns
the visible node; SVG shell is stroke around the measured box. App sinks are
`shabnam-*`.

### Portable

`Files.exportHtml` is the fiddle saved as a page. `Files.exportPng` is a
snapshot. SVG export is a later portable of the *picture*.

## 2. How it is

`Engine implements Workbench`. Solid `Workbench()` constructs `Engine` + `Files`,
one Redraw button, always the full DOT path. `redraw` in the type takes no args;
`Engine.redraw(themeSheet)` takes the concatenated theme.

`inject` / `measure` / `place` match. `place` sets `left` / `top` on annotations
— the one intentional inline style.

`suggestions` is gone from `Workbench` and `Engine`. The current-line classifier
lives in untracked `temp/completer/` for a later *loose* completer. Not the
fiddle.

**`Engine.redraw` today**

```
parse(dot) via Vizer
Diagram.bag → model
Diagram.derived → derived
Css.minus(style, lastDerived) then Css.plus(style, derived)
setTab("style", style)            // merge buffer; Css serializes
inject theme-css / style-css / main-html / annotation
raf → measure → clusters / shells / connectors
place → status → action-js
```

`plus` / `minus` are CSSOM-only. Flatten keys on `selectorText` so nested
`&.node` and a later flat `.cluster.node` are the same rule. Author's keys win.
Emit is one declaration per line, `:root` first. `expand` is inject-only.

CodeJar is `codejar@4.3.0`. Highlight is `highlight.ts`. `tabs.tsx` is a radio
strip; workbench owns the one editor. Facades and diagram workers match. Theme
lock matches. No SVG export.

## Gap list (should → is)

| Should | Is |
|---|---|
| `Css.minus` | Done |
| `plus(style, derived)` | Done |
| Merge buffer + `Css` serializes | Done — one declaration per line |
| `Workbench.redraw()` | `Engine.redraw(themeSheet)` |
| No completer on `Workbench` | Done — parked in `temp/completer/` |
| Per-tab sync optional | Always full `redraw` |
| SVG portable | Not built |

The spine is already the design. The work is correction, not a third rewrite.

---

# Current task

Living as-is → to-be plan. One session per piece. Each piece leaves the tree
compiling, tests green, and the next session a one-line handoff. Do not start
the next piece in the same session. Architecture wins if this plan drifts.
Update this section when a session finishes.

**Done when all of this is false:** `Engine.redraw(themeSheet)` disagreeing
with `Workbench.redraw()`. Completer-on-Workbench and the Css algebra are
already false.

**Now:** Session **C**. Do not start D. Do not reopen the radio strip or
the parked completer.

## Session A — park the completer — **done**

**Goal.** Completer is not the fiddle. Keep the draft for a *loose* completer
later.

**Did.** `complete.ts` / Slot types / tests live in untracked `temp/completer/`.
Unwired from `types`, `Engine`, `src`. `bun test` scoped to `test/`. Radio strip
+ one CodeJar landed in the same pass (workbench owns the window).

**Handoff.** Types no longer mention slots. Next is B.

## Session B — Css algebra matches the law — **done**

**Goal.** `plus(style, derived)`, `minus(style, take)`, readable emit, Engine
runs minus then plus so derived bags do not stack.

**Did.** `Css` matches §10. Flatten keys on CSSOM `selectorText` so nested
`&.node` and a later flat `.cluster.node` are the same rule. `Engine` keeps
`lastDerived` and does `minus` then `plus`. Emit is one declaration per line,
`:root` first. Browser: redraw twice does not stack; author `#core { pink }`
beats DOT `#ddffdd`. `bun test && bun run build` green.

**Handoff.** Css interface is the law. Engine still takes `themeSheet`. Next is
C.

## Session C — Workbench.redraw matches the type

**Goal.** `Engine.redraw()` has no theme argument.

**Do.** Engine holds or asks Files for the current theme sheet (locked base +
selected overlay). Solid shell just calls `redraw()`. Type and call sites
agree.

**Done when.** `Workbench.redraw(): Promise<void>` is what runs. One Redraw
button still always takes the DOT path.

**Not this session.** Per-tab sync. SVG export.

**Handoff.** Types, Engine, and shell agree.

## Session D — optional later (own session each, pick one)

Do not batch.

- **Per-tab sync.** Style/theme/annotation/action skip viz.js. Only if someone
  is hurting. The one-button DOT path stays valid.
- **SVG export.** `Files.exportSvg` — picture portable, not a second workbench.
  Add to `Files` and §10 in the same session.
- **CodeJar stay-or-go.** After A–C, either write “accepted” in §0 or discuss
  removal. Do not silently replace it.
- **Loose completer.** After CodeJar is judged, revive `temp/completer/` as a
  thin layer — not an IDE, not on `Workbench` until we say so. Do not start
  from a new invention if that draft still fits.
