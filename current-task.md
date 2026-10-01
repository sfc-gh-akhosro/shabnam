Always read these files in each session:
- [describe the app](./user-story.md)
- [how to design and develop](./coding-rules.md)

# Current Task

None scheduled. The connectors port is done: `src/connectors/connectors.ts` is
one class, and its story is `src/connectors/connectors-story.md`.

## For Later

- **Shared bend vs drawn bends.** With "a shared bend is free", `geap → agents`
  in example-2 draws 3 bends where `s → s` would draw 2: a free corner ties the
  two, and fewer open ports wins. Either break ties on bends actually drawn,
  before the directional rule, or count a corner as shared only when the run
  beyond it is shared too.
- **Rename `src/style/book.ts`.** It is the pure half of the style book
  (`expand`, `mixins`, `asFile`, `asProject`); `style-book.ts` is the CSSOM
  half. The name does not say which.
