
Always read these files in each session:
- [describe the app](./user-story.md)
- [how to design and develop](./coding-rules.md)

We just performed a refactoring, which I am very happy with the result. Now we are focusing on polishing that redesign and refactor project.

# Implementation Plan

## Connectors: make relationships easy to follow

Layout is now Graphviz (see `app-architecture.md` §0, §2), and example-2 ranks
and orders like `dot`. Re-judge the snake on example-2 before changing it; the
old tangle was mostly the ordering.

If it still reads poorly, the decided direction:

- **Keep:** the snake through the gutters (between `.rank`s) and the row gaps
  (inside a `.rank`), fewest turns before shortest, rounded bends, and the
  little jump where edges cross.
- **One lane per edge in a shared gutter.** Today every route runs down the
  exact middle of a gap, so edges sharing it overlap and look like one pipe
  that forks. Split each gap into as many lanes as edges using it, ordered by
  where each edge goes next, so they do not cross inside the gutter.
- **Ports spread along a side.** Today every edge attaches at the centre of a
  side, so fan-in is unreadable. Spread the edges on one side evenly, ordered
  by where the other end sits.
- **Same-rank pairs that are not neighbours** attach on the side facing the
  nearer gutter, not top/bottom. Only if a real diagram still shows the bad
  case.


# later

consultancy:
so we have 2202 lines and 34 files. It looks the length of a method and a signiture and type definitions, means we treated files in the order of a method.
I was expecting much less file numbers (like one third or less). 
I am looking into your files, I see the "players" as the main interfaces or classes.
and each should be in one files (can extend more and even a folder/package). 
So i would have expected to see something like this:
- backend
  - story.md
  - types.md
  - workbench.ts (can manage chrome and action buttons etc)
  - parser.ts
  - framer.ts (can have .dagreLayout(model) .)
  - stylist.ts
  - paint
    - story.md (if needed)
    - types.md (if needed)
    - painter.ts
    - some other helper files
- ui
  - story.md
  - types.md (or it can be something equivalent for ui component definitions)
  - ...
root files: - types, index.html, app.css, index.ts

I am ok with folder but as needed and it should read natuirally. organizing does not mean compacting and does not mean taking apart.

what do you think?
