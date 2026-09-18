# Coding rules

**Required.** Every coding session and every design discussion must follow this file and `app-architecture.md`. `AGENTS.md` and `CLAUDE.md` exist to point here.

---

## Law

1. `app-architecture.md` is the product contract. If code and that file disagree, change the code or change the file together — do not silently invent a third design.
2. This file is how we write TypeScript. Happy path. Fail fast and loud.
3. No DOT parser, tokenizer, or AST. Graphviz `renderJSON` is the only DOT consumer.

---

## Happy path. Fail fast. Fail loud.

- Always write the happy path. Always.
- No `try` / `catch` unless the error has already happened in a real run, we have looked at it, and we agreed the catch is the fix.
- No defensive coding: no null-guards for states the types already forbid, no “just in case” defaults, no fallbacks that hide a bug.
- No covering code. If it does not run on the path we ship, delete it.
- No dead code. No unused exports, no commented-out blocks left “for later.”
- No stinky code: no clever wrappers, no second abstraction for one call, no `any` to paper over a type we have not designed.
- When something is wrong, **throw or let it throw**. A crash with a stack is the feature. A swallowed error is the bug.

> When we are using external libraries, here vizjs, some typing rules and above rules might become losen to accomodate with convenience and reality. Do not fight their system, peace!

---

## Type-driven TypeScript (Go / Rust)

- `interface` — methods only. No data fields. A class implements an interface.
- `type` — data only. No methods.
- `Map` (or `Record` used as a map) — enum simulation: attribute value → function. First map: `shape → nodeHTML`.
- Prefer one major class per file, plus a few helpers.
- For typescript, inheritance only through composition.
- Polymorphism through enums: Records: case => function

---

## Soft 7

These are for staying neat and organize and readable. These are soft limits, you can break them occasionally if needed, but not routinely.

- ~7 lines inside a block (`{}` / `()` / `<>`) which shows a simple and complete set of atomic operations, basically one unit of logical progress.
- ~7 blocks in a function
- ~7 methods on an interface
- ~7 code files per package (not `types.ts`, not `.json` / lockfiles)
- One major class per file
- No limit on enums / `Map` entries
- No limit on folders / packages

Therefore, ideally a mehod is under 50 lines (7 blocks * 7 lines + signiture)
Class, implementing an interface, will have max 7 public methods, and many helper functions (one liner, few liners, bigger ones).
a file will have soft limit of 7*7*7*7 about 2400 lines.

7 "code files" (not including json md types.ts config.ts etc) in a folder/package
so each package focuses on getting a manageable scope done that can be flxible, spcific, but battery-included to use.

How to extend then?
- enums:
    Many extension are "different" implementation of similar functionality: (case => function).
- packages:
    - as many logical folder that is needed to get the job done. each package/folder conceptually adds a new subject expert or agent to our app.
    - packages/folders can be nested, but flat is better than nested.





---

## Tree

```
src/           all TS, TSX, CSS, HTML
test/          if you need it
svg/           shells
icon/          borrowed logos
theme/         themes
build/         build scripts
research-lab/  discover, experiments, development testing, prototypes
dist/          build output
docs/           documentations, project management files, some reports.
```

Root files: `.gitignore`, `app-architecture.md`, `coding-rules.md`, `AGENTS.md`, `CLAUDE.md`, `package.json`, lockfile.

Not source: `input/`, `output/`, `local/`, `temp/`, `etc/`, leftover `dot-parser.ts`. Experiments go in `research-lab/`, not in `src/`.

`.gitignore` is the canary. A file that should not be tracked will not be. Do not weaken the ignore to sneak a file in — move the file or change the rule on purpose.

---

## What not to do in this repo

- Do not add a **new major library** — a new runtime dependency that changes the design — without writing it into `app-architecture.md` §0 first. See Dependencies below for what does not need asking.
- Do not add a config tab, a second Graphviz grammar, or “while we’re here” refactors.
- Do not write tests that chase float precision or other noise as if they were the product.
- Do not implement every `shape=` in the first pass. `box` is enough until we say otherwise.
- Do not change root files (espcially `.gitignore`, `app-architecture.md`, `coding-rules.md`) or root folders without review and user discussion and approval.


## Dependencies

Installing is not the same as choosing. §0 of `app-architecture.md` already chose the stack; do not come back and ask permission to make that choice work.

**Install freely, no approval needed:**

- Whatever the stack in §0 needs in order to run. If SolidJS needs its JSX compiler to turn a `.tsx` file into DOM, install it. That requirement is implicit in having chosen SolidJS. Same for viz.js, for Bun, for TypeScript.
- Any **dev dependency** — types packages, the bundler's plugins, a test helper, a formatter. Dev tools are not architecture. They ship with nobody.
- Transitive and peer dependencies of the above.

**Ask first:**

- A new **runtime** dependency that is not implied by §0 — a second UI library, a layout engine, a CSS framework, a state manager, a parser of any kind. That is a design decision wearing an install command, and it goes into §0 first.

When in doubt, the test is: would a reader of §0 be surprised to find this in `package.json`? If no, install it and move on. If yes, stop and say so.

---

## Plans and instructions

Whoever executes a plan here is an intelligent agent that has already read `AGENTS.md`, `app-architecture.md`, and this file. Write for that reader.

- Plans state **goals, decision points, and what done looks like** — not keystrokes. Do not enumerate every file, function signature, or line to write when the architecture already implies them.
- Do not restate the architecture inside a plan. Point at the section.
- **Spell out the decisions** — the ones where a competent agent could reasonably pick differently, and where picking differently across iterations would leave us inconsistent. Those are the whole point of writing a plan down.
- Leave the *how* open. Naming inside a file, helper decomposition, JSX shape, and test layout are the executor's call.
- If the plan and the architecture conflict, the architecture wins; say so rather than following the plan.
- An executor that finds the plan wrong should stop and raise it, not silently improvise a third design.

Same spirit as Soft 7: enough structure to stay coherent, not so much that it stops being thinking.

---

## Closing ceremony

Before we close the workshop for a session. Not deep — a stop-and-check, so the next session opens on a clean desk.

1. **Sync the root files with the code.** `app-architecture.md`, `coding-rules.md`, `current-task.md`, `.gitignore`. Does the tree in §8 still match `src/`? Did a decision land in the code but not in §7? Is an ignore rule pointing at a file that no longer exists? Fix, or say why not.
2. **Archive what is done.** Finished work moves out of `current-task.md` into `docs/archive.md` — what was built, what was decided, what turned out wrong. `current-task.md` ends the session empty or holding only what is genuinely next.
3. **Record the debts.** New ones into `docs/technical-debts.md`; mark the ones this session closed. That file holds *open* debts — a record of completed work belongs in the archive.
4. **Clean the desk.** Delete dead code, unused exports, one-off scripts, and tests that no longer test anything. A test that has stopped earning its place is deleted, not kept out of politeness.
5. **Check the canary.** `git status`. Anything unexpected means the ignore rules caught something — fix the cause, never the canary.
6. **Commit and push,** with the identity the repo expects, then report: what shipped, what is open, what the next session should pick up.

---

## Gitignore

To have a canary and gate guard, we use extreme vetting by .gitignored.
ignore all files except:
- their extension is in our list: ts, tsx, js, html, css, json, lock, md, dot, sh, svg, png, ...
AND
- they are inside (cen be nested too) our allowed root directories: src, svg, icon, test, build, theme, docs, research-lab, dist

Also allow some exceptions:
- root files: AGENTS.md, Claude.md, package.json, app-architecture.md, coding-rules.md, .gitignore, current-task.md
- some specific files that we might whitelist like demo files and etc.
