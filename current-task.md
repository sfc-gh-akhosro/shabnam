Always read these files in each session:
- [describe the app](./user-story.md)
- [how to design and develop](./coding-rules.md)

# Current Task

None scheduled. v0.3.0 shipped the players restructure: seven players, each an
interface in `src/types.ts`, one class, one file — `engine/{parser, layout,
router, stylist, painter}.ts`, `ui/{workbench, chrome}.ts`, plus `shapes.ts` and
`pieces.ts`. The shape is `app-architecture.md` §1 and §8.

## For Later

- **Router: the densest file left.** 216 lines and 14 inner types, ported from
  the lab as-is. Reuse `Ranks` / `NodeBox` where its `Node` / `Rank` / `Grid`
  overlap them, and see what that saves.
- **Shared bend vs drawn bends** (router). With "a shared bend is free",
  `geap → agents` in example-2 draws 3 bends where `s → s` would draw 2: a free
  corner ties the two, and fewer open ports wins. Either break ties on bends
  actually drawn, before the directional rule, or count a corner as shared only
  when the run beyond it is shared too.
- **Small pieces as functions.** `Radios`, `Checks` and `DialogAsk` are one
  constructor each; as functions, `pieces.ts` loses three classes.
