
Always read these files in each session:
- [describe the app](./user-story.md)
- [how to design and develop](./coding-rules.md)

# Implementation Plan

Each session starts fresh, ends green
(`bun test` and `bun run test:browser`), and ends with the closing ceremony
and a commit. The app works at the end of every session.

## Done

Sessions 2–7: the redesign is built and closed. `types.ts` holds the design
types only; `design-story.md` keeps only the reasons the other files state as
fact.

## Next

Nothing scheduled. Pick from For Later.

# For Later

- **Decide the `@apply` cycle rule** (architecture §5, Open). Either names
  must be written *earlier* than the applying selector (no check, but a new
  user mixin cannot be applied to a theme selector like `.node`), or `admits`
  gets a small cycle check and §5 allows it.
