
Always read these files in each session:
- [describe the app](./user-story.md)
- [how to design and develop](./coding-rules.md)

# Implementation Plan

The design is [`research-lab/ui-redesign/design-story.md`](research-lab/ui-redesign/design-story.md).
Every session reads it first. Each session starts fresh, ends green
(`bun test` and `bun run test:browser`), and ends with the closing ceremony
and a commit. The app works at the end of every session.

## Done

Sessions 2–6: the lab, `style/`, `read/` `layout/` `paint/`, `diagram/`, and
the vanilla workbench. SolidJS is gone; the lab's code moved into `src/ui/`
and was deleted, so only `design-story.md` is left in `research-lab/ui-redesign/`.

## Session 7 — Close the loop

- Final `types.ts` pass: the design types only, readable top to bottom. Known
  leftovers: `Layout` is still the name of the `DagreLayout` interface, the
  painter interface lists four methods where the story names two, and
  `SOURCE` is a const object where a `Map` would be the house enum.
- Check that the story, the architecture and the code agree, then trim
  `design-story.md` to what the code did not already say. §7 (the lab) now
  describes files that no longer exist.
- `design-story.md` §4 names `diagram.styleBook.changed` as a topic; nothing
  subscribes to it (the styles tab re-reads on show, draw and Open). Either the
  tab uses it or the topic and the story line go.

# For Later

- **Decide the `@apply` cycle rule** (architecture §5, Open). Either names
  must be written *earlier* than the applying selector (no check, but a new
  user mixin cannot be applied to a theme selector like `.node`), or `admits`
  gets a small cycle check and §5 allows it.
