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

## No "what if"

**The codebase is a temple and we are its monks.** Every line is a debt. Every
abstraction is a larger debt. Every branch, flag, guard and fallback is a debt
someone else will service. A line that works, handles its case, and shows green is
still a debt if nobody asked for it.

A **"what if"** is code written for a state nobody has observed. It is the most
common way a clean codebase silently becomes a large one, because each individual
one is cheap, reasonable, and defensible on its own.

**A what-if does not belong in code. It belongs in the design.** That is what the
design files are for, in this order:

1. `user-story.md` — who the user is and what they do
2. `app-architecture.md` — what the app therefore does, and refuses
3. `types.ts` — the shapes that make the refusals unrepresentable

If a state cannot happen, say so in the types and **delete the check**. If it can
happen and we choose not to serve it, say so in the architecture and **delete the
code**. Either way what survives in `src/` is the happy path.

**Three questions before a defensive line lives.** Same bar as the `try` / `catch`
rule above, and for the same reason:

1. Has it actually happened, in a real run?
2. Did we look at it together?
3. Did we agree this line is the fix?

Anything less and the honest answer is: don't write it. If the mistake ever
arrives, it arrives with a stack trace and we fix the real thing.

**Correct is not the same as defensive.** Encoding a value properly at a boundary
is not a what-if — `encodeURIComponent` on a URL, CDATA on text entering XML,
escaping a label into HTML. Those are how the boundary works, they have no
branches, and they are not predicated on anyone misbehaving. A *guard against an
unobserved state* is the what-if. Know which one you are writing.

**The unwritten agreement is real, and it is allowed to be unwritten.** Our user
writes `background: red`. A nerdier one writes `oklch(…)`, and we neither mind nor
care, because CSS handles it. A user who reaches for a data-URI SVG inside a
`background` has left the path this app was designed for — that is their business,
not our code's. We do not add a line for them. We do not pre-apologise for them in
a comment. "Don't do that" is a complete answer, and so is "ask an AI to help
you".

**"It could happen" is not a reason. "It happened" is.**

---

## Trust in default (Do Nothing)

I trust a lot that "doing nothing (trusting default)" will do the job "good enough". We go further only when we need and consciously decide about it. This rule (trust in default) does not mean we are careless (especially for critical decision points), it just means "hey, let's do nothing to see what happens, maybe it is good enough".

We are extremely against over-control and micro-management of every element and arrangement, especially when it comes to something as complicated and crazy as DOM (where technically you never fully grasp its interwoven effects on other components when a little upstream tweak changes; the default arrangement behaves "civilized" and many custom changes might behave erratic, unpredictable, or unexpected).

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
research-lab/  DOT fixtures the tests load
dist/          build output
docs/           documentations, project management files, some reports.
```

Root files: `.gitignore`, `app-architecture.md`, `coding-rules.md`, `AGENTS.md`, `CLAUDE.md`, `package.json`, `tsconfig.json`, `bunfig.toml`, lockfile.

Not source: `input/`, `output/`, `local/`, `temp/`, `etc/`, leftover `dot-parser.ts`. Experiments are not kept in the tree at all — `research-lab/` holds only the DOT fixtures the tests load. Nothing is parked: a draft that is not being finished is deleted, and `temp/` is scratch rather than a shelf.

`.gitignore` is the canary. A file that should not be tracked will not be. Do not weaken the ignore to sneak a file in — move the file or change the rule on purpose.

---

## What not to do in this repo

- Do not add a **new major library** — a new runtime dependency that changes the design — without writing it into `app-architecture.md` §0 first. A library means we accept its whole tree. See Dependencies below.
- Do not hand-roll a library that is already on §0 (or should be) to avoid that conversation.
- Do not write a code editor, a formatter-on-type, autocomplete, or syntax highlighting on `Workbench`. The tab window is a bare `<textarea>`. A loose completer may come later; it is not parked anywhere, so it starts from scratch if it ever starts.
- Do not confuse `SetTab` (text tabs) with `inject` (sinks). The textarea holds the three text tabs and does nothing to them. The styles tab is not text: it is a rows view onto the `Stylist`.
- Do not add a config tab, a second Graphviz grammar, a second theme mechanism, or “while we’re here” refactors.
- Do not give a chrome element a `class` or an `id` that the CSS does not need. `app.css` is small because the markup is reachable by element and position; every hook you add is a line someone has to read before they can restyle anything. A hook exists for one of three reasons: the layout, a sink the engine writes, or a state a test drives. Decoration is not one of them.
- Style is data. A rule is `selector → property → value`, the `Stylist` feeds it to CSSOM, and `@apply` resolves at feed time. Do not build a CSS string to paint with, do not parse a sheet back, do not reintroduce `plus` / `minus`. `Stylist.serialize()` is for export only.
- Do not write tests that chase float precision or other noise as if they were the product.
- Do not implement every `shape=` in the first pass. `box` is enough until we say otherwise.
- Do not change root files (especially `.gitignore`, `app-architecture.md`, `coding-rules.md`) or root folders without review and user discussion and approval.

## Browser verification is deliberate, not routine

`bun test` is the loop — 84 pure tests, under half a second, run constantly.
`bun run test:browser` launches Chrome for the CSSOM half. They are **two commands
on purpose**, and chaining them was considered and rejected: the browser half slows
the loop enough to change how you work, and an agent that starts driving Chrome
tends to stay there instead of finishing the task. Run it when a change is actually
DOM-shaped — CSSOM, the rows tab, the sinks, an export — not by habit. Most changes
go without it.

When you do reach for a browser:

- **Drive it directly. Never through a subagent.** One iteration's verification was
  handed to a browser subagent as a click-by-click script: every interaction became
  a separate approval prompt — hundreds of them — while nothing that actually
  mattered got asked. Read values in bulk instead, one `browser_evaluate` per
  question, one JSON blob back. A full Done-when list is about a dozen calls.
- **The agent sandbox intercepts the `Bun.serve` bind and reports a false
  `EADDRINUSE`** — port 3000 for `build/dev.ts`, 3101 for the browser suite. `lsof`
  shows nothing listening and retrying never clears it, because there is no
  contention to clear. Both need the sandbox disabled. Do not go hunting a phantom
  process.


## Dependencies

Installing is not the same as choosing. §0 of `app-architecture.md` already chose the stack; do not come back and ask permission to make that choice work.

**Install freely, no approval needed:**

- Whatever the stack in §0 needs in order to run. If SolidJS needs its JSX compiler to turn a `.tsx` file into DOM, install it. That requirement is implicit in having chosen SolidJS. Same for viz.js, for Bun, for TypeScript.
- Any **dev dependency** — types packages, the bundler's plugins, a test helper, a formatter. Dev tools are not architecture. They ship with nobody.
- Transitive and peer dependencies of the above.

**Ask first:**

- A new **runtime** dependency that is not implied by §0 — a second UI library, a layout engine, a CSS framework, a state manager, a parser, an IDE kit. That is a design decision wearing an install command, and it goes into §0 first. Same conversation to **remove or rescope** anything already on §0.

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

## Opening Ceremony
The developer might ask for the `opening ceremony` (often in the begining of a session) which basically means I want a fresh start and erase many of LLM memory and carried over knowledge from other sessions. 

we already have everything we need.


**Erase the carried knowledge.** Wipe every agent-side store that would let the next session inherit something the repo does not say. The list is exact, in both directions.

**Why to erase.** This repo *is* the memory: `AGENTS.md` routes to `app-architecture.md`, `coding-rules.md` and `user-story.md`; `current-task.md` holds what is next; `docs/archive.md` holds what was decided and why; `git` holds the rest. 
LLM's have tendency to over "attend" to the short-term memory (that lives in automated files) than the longer vision that lives in our repo.


| Erase | What it carries |
|---|---|
| `memory/` | the global index, its topic files, every project directory |
| `conversations/` | past sessions, which conversation recall searches |
| `debug_conversations/` | the same, verbose |
| `logs/` | `coco.log` / `snova.log` — a running record of past sessions |
| `screenshots/` | browser captures from past sessions |
| `history` | every prompt ever typed |
| `cache/tool_outputs/` | large tool outputs offloaded from past sessions |
| `cache/file_recency.jsonl` | which files were used, and when |
| `cache/sql_result_cache/` | past query results |
| `tgrep/` | a code-search index snapshot; re-indexes on demand |
| `.ctx/` | stale cross-session task lists |
| `plans/` | old plan cards |

```sh
cd ~/.snowflake/cortex
rm -f history cache/file_recency.jsonl
for d in memory conversations debug_conversations logs screenshots plans tgrep \
         .ctx cache/tool_outputs cache/sql_result_cache; do
  find "$d" -mindepth 1 -delete 2>/dev/null
done
```

`find -mindepth 1 -delete` rather than `rm -rf dir/*`, because a non-matching glob makes zsh abort the whole line — which silently skipped the memory wipe once while appearing to succeed. `conversations/` will not end up empty: the session doing the erasing is still recording into it. Expected; the next run clears it.

**Never touch these.** Credentials, configuration, or installed tooling. None of it is knowledge:

```
agent/config.toml  agent/connections.toml  cache/credential_cache  mcp_oauth/
settings.json  permissions.json  hooks.json  mcp.json  cortex.json
cache/snowflake_account_info.json  cache/update_state.json  cache/debug_logging.json
.mcp-servers/  plugins/  skills/
```

Two rules for doing it:

- **Anything worth keeping was already filed by steps 1-3.** If you are tempted to preserve an entry, that is step 1 or 3 telling you it was never filed. Put it in the repo, then erase.
- **A cross-project preference is not this repo's to file, and not memory's to hold either.** It belongs in the `user-preferences` skill (`~/.snowflake/cortex/skills/user-preferences/reference/`), which is hand-authored, reviewable, and survives this step; there is a copy at `~/Repos/etc/coco-preferences/`. Before deleting anything that looks like a duplicate, **confirm the live copy exists** — do not infer it. A memory file deleted on the assumption that a skill already covered it is gone for good: `rm` does not use the trash, and there was no backup. That has happened once, to a file whose contents are now unrecoverable.

---

## Closing Ceremony
The developer might ask for `closing ceremony` which is a trigger for these "house cleaning" procedure and making our repo ready for the next session.

Before we close the workshop for a session. Not deep — a stop-and-check, so the next session opens on a clean desk.

1. **Archive what is done.** Finished work moves out of `current-task.md` into `docs/archive.md` — what was built, what was decided, what turned out wrong. `current-task.md` ends the session empty or holding only what is genuinely next.
2. **File what this session decided.** There is no debts ledger; it was retired once every entry in it had a proper home, and recreating one is how it grows back. A decision the code already implements goes into `app-architecture.md` — that is the contract, and a behaviour described nowhere gets "fixed" by the next session. Finished work, and anything that cannot be closed and never will be, goes into `docs/archive.md` with the reasoning that makes it worth re-reading. Wanted-but-unscheduled work goes into `current-task.md` under **For Later**. A ledger comes back only if we deliberately defer something real, and that is a conversation.
3. **Clean the desk.** Delete dead code, unused exports, one-off scripts, and tests that no longer test anything. A test that has stopped earning its place is deleted, not kept out of politeness.
4. **Check the canary.** `git status`. Anything unexpected means the ignore rules caught something — fix the cause, never the canary.
5. **Commit and push,** with the identity the repo expects, then report: what shipped, what is open, what the next session should pick up.

---

## Gitignore

To have a canary and gate guard, we use extreme vetting by .gitignored.
ignore all files except:
- their extension is in our list: ts, tsx, js, html, css, json, lock, md, dot, sh, svg, png, ...
AND
- they are inside (cen be nested too) our allowed root directories: src, svg, icon, test, build, theme, docs, research-lab, dist

Also allow some exceptions:
- root files: AGENTS.md, CLAUDE.md, package.json, tsconfig.json, bunfig.toml, app-architecture.md, coding-rules.md, .gitignore, current-task.md
- some specific files that we might whitelist like demo files and etc.
