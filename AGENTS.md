# AGENTS.md

Required reading for every agent, every session, every coding or architecture discussion in this repo.

## Absolute necessity

Before writing or changing code, and before proposing a design, read and follow:

1. [`app-architecture.md`](app-architecture.md) — the product contract. Graphviz is the only DOT consumer. No parser, tokenizer, or AST.
2. [`coding-rules.md`](coding-rules.md) — how we write TypeScript. Happy path. Fail fast and loud. Soft 7. Type-driven (`interface` = methods, `type` = data, `Map` = enum).
3. [`user-story.md](user-story.md) - tells the story from the perspective of user-designer-architect persona. It is an interwoven story tells what user wants to do, how uses the ui, might tell about ui components, even major types and interfaces included, libraries or major built-in algo that we implement, etc.
This should be the most revealing for someone like "me" that oh this app is this. LLM's

If a conversation or a patch disagrees with those two files, stop. Update the file with the user, or change the work to match. Do not invent a third design.

`CLAUDE.md` exists so Claude-family tools load the same law. It points here.

## Also

- Stack and file tree are in `app-architecture.md`. Do not add a major library without writing it there first.
- Experiments live in `research-lab/`, not in `src/`.
- `.gitignore` is a canary. Do not weaken it to commit junk.

- All actions are allowed in this repo and its sub folders. 
- All browser and ui testing actions are allowed.
- Please do not ask too much for operation permissions but limit your "write" actions to default library locations (/temp/ ...) and this repository.

