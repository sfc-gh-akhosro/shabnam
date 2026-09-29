
Always read these files in each session:
- [describe the app](./user-story.md)
- [how to design and develop](./coding-rules.md)

# Implementation Plan

The design is [`research-lab/ui-redesign/design-story.md`](research-lab/ui-redesign/design-story.md).
Every session reads it first. Each session starts fresh, ends green
(`bun test` and `bun run test:browser`), and ends with the closing ceremony
and a commit. The app works at the end of every session.

## Session 2 — The pieces, in the lab

- Carried over from Session 1 (the law files are rewritten): sketch the target
  `src/types.ts` as the story's types only, and `ui/types.ts` for the pieces.

- `research-lab/ui-redesign/`: `index.html` (the new skeleton and
  `<template>`s, linking `src/app.css`), `ui/topic.ts`, `ui/radios.ts`,
  `ui/checks.ts`, `ui/row-list.ts`, `ui/dialog-ask.ts`.
- `lab.ts` shows every piece with fake data in rest, checked and invalid
  states. `probe.ts` prints every topic publish and every custom event.
- Try the CSS renames (`.radios`, `.checks`, `.pin`, `.rows.notes`, `.col`)
  in a lab stylesheet laid over `app.css`.
- Done when: the page looks right by eye, the probe output reads like §4 of
  the story, and nothing in `src/` changed.

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
