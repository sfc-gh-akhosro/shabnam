
Always read these files in each session:
- [describe the app](./user-story.md)
- [how to design and develop](./coding-rules.md)

# Implementation Plan

The design is [`research-lab/ui-redesign/design-story.md`](research-lab/ui-redesign/design-story.md).
Every session reads it first. Each session starts fresh, ends green
(`bun test` and `bun run test:browser`), and ends with the closing ceremony
and a commit. The app works at the end of every session.

## Done

- Session 2: the lab (`research-lab/ui-redesign/`). Run it with
  `bun run research-lab/ui-redesign/serve.ts` → `http://localhost:3100`.
  Two shapes it settled, for Session 6 to keep:
  - `Checks<K>` binds a `Topic<Set<K>>`, so `view.pinned` is a one-key set.
  - `DialogAsk` is a `<form method="dialog">`: the pressed button's `value`
    is the answer, `"ok"` reads the form, anything else is `undefined`.
- Session 3: `style/` — `StyleBook.add` is the only way in, mixins never
  reach CSSOM, `topic.ts` is in `src/ui/`. The Solid styles tab runs through
  `workbench/rows.tsx`, an adapter that mints its own row ids; delete it in
  Session 6.
- Session 4: `read/` (`DotReader`, `model`, `styles`, `graph`), `layout/`
  (`DagreLayout`), `paint/` (`DiagramPainter` + workers). The engine holds a
  `painter`.
- Session 5: `diagram/` — `Diagram` (topics `dot`, `notes`, `script`, plus
  `styleBook`; `draw()`, `place()`), `files.ts` as plain functions over a
  diagram, `notes.ts` for the marks. The diagram subscribes to its own
  `notes`, so a note edit is just `diagram.notes.pub(list)`. Open keeps the
  script and notes and makes a new `Diagram`. The Solid workbench mirrors the
  topics into signals (`adopt`); that goes with Solid in Session 6.

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

- **Decide the `@apply` cycle rule** (architecture §5, Open). Either names
  must be written *earlier* than the applying selector (no check, but a new
  user mixin cannot be applied to a theme selector like `.node`), or `admits`
  gets a small cycle check and §5 allows it.
