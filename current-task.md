
Always read these files in each session:
- [describe the app](./user-story.md)
- [how to design and develop](./coding-rules.md)

# Implementation Plan

The design is [`research-lab/ui-redesign/design-story.md`](research-lab/ui-redesign/design-story.md).
Every session reads it first. Each session starts fresh, ends green
(`bun test` and `bun run test:browser`), and ends with the closing ceremony
and a commit. The app works at the end of every session.

## Lab, done in Session 2

`research-lab/ui-redesign/` holds the pieces (`ui/`), the target types
(`types.ts`, `ui/types.ts`), the skeleton, `lab.css` (the renames over
`app.css`) and the probe. Run it with `bun run research-lab/ui-redesign/serve.ts`
→ `http://localhost:3100`. Two shapes the lab settled, for Session 6 to keep:

- `Checks<K>` binds a `Topic<Set<K>>`, so `view.pinned` is a one-key set.
- `DialogAsk` is a `<form method="dialog">`: the pressed button's `value` is
  the answer, `"ok"` reads the form, anything else (Cancel, Escape) is
  `undefined`. No submit handler.

## Session 3 — StyleBook: one way in

- `stylist/` → `style/`, `Stylist` → `StyleBook`: `add(style): boolean`,
  `remove(style)`, `styles()`, `changed: Topic<number>`. Source travels on
  the `Style`. `absorb` and `reset` are gone.
- `DotReader.styles()` (still `GraphvizAst` until Session 4) returns
  `Style[]` stamped `source: 1`.
- `@apply` at minimal support (architecture §5): names only selectors already
  in the book, and an unknown name makes `add` return `false`. Move the theme's
  mixins (`.paper .glass .row .col`) to the top of `basic-theme.json`, and delete
  the cycle check.
- Mixins stop reaching CSSOM: they are expanded where they are `@apply`d and
  never fed to the sheet on their own. Changing a mixin re-feeds the selectors
  that apply it.
- `topic.ts` moves from the lab to `src/ui/`.
- The Solid rows tab keeps working through a thin adapter, which is deleted in
  Session 6.
- Done when: tests are green, the styles tab behaves as before, and a theme
  `.row` no longer reaches the chrome.

## Session 4 — Renames: read, layout, paint

- `dot/` → `read/` (`GraphvizAst` → `DotReader`, `points()` → `graph()`),
  `dagre-layout.ts` → `layout/`, `diagram/` → `paint/` (`Diagram` facade →
  `DiagramPainter`).
- Only names and paths change. Behaviour stays the same.
- Done when: tests are green and `grep` finds no old names.

## Session 5 — Diagram: the living state that draws itself

- `src/diagram/diagram.ts`: `Diagram` holds `dot`, `notes` and `script` as
  topics, plus a `styleBook`. `draw()` absorbs `Engine.redraw`, and `place()`
  re-anchors the notes. `files.ts` moves here. Open DOT makes a new `Diagram`.
- `engine.ts` is deleted. The Solid workbench calls `diagram.draw()` so the
  app keeps running.
- Done when: draw, open, save and all exports work, and tests are green.

## Session 6 — Workbench, vanilla

- `src/index.html` becomes the skeleton plus templates. `ui/` pieces move in
  from the lab.
- `workbench/`: `workbench.ts`, `commands.ts` (`COMMANDS` and chords, replacing
  `keys.ts`), `style-tab.ts`, `note-tab.ts`, `export-dialog.ts`.
- `app.css` gets the renames tried in the lab. The look stays the same.
- Delete every `.tsx` file, SolidJS and its JSX plugin.
- Done when: the app works as before, `package.json` has no `solid-js`, and
  the browser tests are re-pointed at the new DOM and green.

## Session 7 — Close the loop

- Final `types.ts` pass: the design types only, readable top to bottom.
- Check that the story, the architecture and the code agree, then trim
  `design-story.md` to what the code did not already say.

# For Later
