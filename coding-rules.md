# Coding rules

**Required.** Every coding session and every design discussion follows this file. It is the craft half of [`user-story.md`](user-story.md): what the app does and refuses is `app-architecture.md`'s job, the shapes are `src/types.ts`'s, and this is how we write the TypeScript in between. `AGENTS.md` and `CLAUDE.md` exist to point here.

Three things override everything below: `app-architecture.md` is the product contract — if code and that file disagree, change one or the other *together*, never a silent third design. **We never write a DOT parser** — a library reads DOT and we walk what it returns, which is why `@ts-graphviz/ast` is a dependency and `parseAst` is not a file. And the happy path is the only path we write.

---

## How we design: story → types → architecture → code

Design moves in one direction, and each step is derived from the one above it.
Skipping a step is how you end up with code nobody can explain.

**1. Tell the story first, in prose.** Not a spec, not bullet points — a narrative
a peer could read aloud. What comes in, what goes out, who owns which stage, and
*why it is arranged that way*. The test is the reader saying "oh, I get it — this
app does **this**, in **this** way." A story that is technically unarguable and
tells you nothing is a lawyer talking, and it has failed.

**2. Let the types fall out of the story.** If the story names a thing, it becomes
a type; if the story says a class walls off a library, that is an interface with
one implementation. Write only the types the story implies — no speculative fields,
no "we'll probably need". The types are where the story's refusals become
unrepresentable.

The types/interfaces that story writes does not mean to be precise, cm=omprehensive, or accurate. It needs to reflect that story well, and become a sketch for types.ts to follow and complete with all needed details.

**Name the atomic types.** `sameRank: NodeId[][]` reads on its own;
`sameRank: string[][]` needs a reference open beside it. A human or an LLM should
learn what a field is from its type, not from a comment. `NodeId`, `EdgeId`,
`SubgraphName`, `Selector`, `Property`, `Px` — each one a `string` or a `number`
underneath, and each one worth the line.

**3. Then the architecture records the decisions**, formally and briefly, pointing
at the story rather than retelling it.

**4. Then the code implements the types.** By this point most arguments are
already settled, which is the whole point.

### Experiment in `research-lab/` before touching `src/`

A design is a claim, and a claim gets tested where it is cheap. Build the thing in
`research-lab/<topic>/`, with a **CLI that prints real output from real fixtures** —
then read it. Two rules for that output:

- **Print what you store, not a view of it.** If it is a `Map`, print the `Map`.
  Reshaping for display hides exactly the awkwardness you are looking for.
- **Probe rather than assert.** "Does this library support X?" is answered by
  running it, not by remembering. Several confident claims in this repo's history
  were wrong, and the cheap probe found it every time — including a documented
  claim in `app-architecture.md` that turned out stale.

The lab's `readme.md` is the design document, and it outlives the lab's code.

### Wall each library off behind one named class

A third-party library is visible inside exactly one class, and the class is named
after it — `GraphvizAst`, `DagreLayout`. Everything else talks to our own shapes.
You can then tell from the type list alone where a dependency could leak from, and
replacing one is a single file.

### Don't be pedantic

Edge cases the user does not care about get the smallest thing that stops the code
breaking, and not one line more. A node name with a space gets
`.replace(/ /g, "_")` — no collision table, no throw, no validation. A user who
gives a node no sensible name was never going to select it later. Happy path means
the *interesting* path; the rest just must not crash.

---



- Always write the happy path. Always.
- No `try` / `catch` unless the error has already happened in a real run, we have looked at it, and we agreed the catch is the fix. There is exactly one in the app.
- No defensive coding: no null-guards for states the types already forbid, no "just in case" defaults, no fallbacks that hide a bug.
- No covering code. If it does not run on the path we ship, delete it.
- No dead code. No unused exports, no commented-out blocks left "for later."
- No stinky code: no clever wrappers, no second abstraction for one call, no `any` to paper over a type we have not designed.
- When something is wrong, **let it throw**. A crash with a stack is the feature. A swallowed error is the bug.

> With external libraries these rules loosen to meet reality. Their shapes are theirs, so an `any` at the boundary is fine. Do not fight their system. Peace.

---

## No "what if"

**The codebase is a temple and we are its monks.** Every line is a debt, every abstraction a larger one, and every branch, flag, guard and fallback is a debt someone else will service. A line that works, handles its case and shows green is still a debt if nobody asked for it.

A **"what if"** is code written for a state nobody has observed. It is the most common way a clean codebase silently becomes a large one, because each one is cheap, reasonable, and defensible on its own.

**A what-if does not belong in code. It belongs in the design** — `user-story.md` for who the user is, `app-architecture.md` for what the app therefore refuses, `types.ts` for the shapes that make the refusal unrepresentable. If a state cannot happen, say so in the types and **delete the check**. If it can happen and we choose not to serve it, say so in the architecture and **delete the code**.

**Three questions before a defensive line lives**, the same bar as the `try` / `catch` rule: has it actually happened in a real run, did we look at it together, and did we agree this line is the fix? Anything less and the honest answer is: don't write it. If the mistake ever arrives, it arrives with a stack trace and we fix the real thing.

**Correct is not the same as defensive.** Encoding a value properly at a boundary is not a what-if — `encodeURIComponent` on a URL, CDATA on text entering XML, escaping a label into HTML. Those are how the boundary works, they have no branches, and they are not predicated on anyone misbehaving. A *guard against an unobserved state* is the what-if. Know which one you are writing.

**The unwritten agreement is real, and it is allowed to be unwritten.** Our user writes `background: red`. A nerdier one writes `oklch(…)`, and we neither mind nor care, because CSS handles it. A user who reaches for a data-URI SVG inside a `background` has left the path this app was designed for — that is their business, not our code's. We do not add a line for them, and we do not pre-apologise for them in a comment. "Don't do that" is a complete answer, and so is "ask an AI to help you".

**"It could happen" is not a reason. "It happened" is.**

---

## Trust the default (do nothing)

I trust heavily that *doing nothing* — taking the default — will be good enough. We go further only when we need to and consciously decide to. This is not carelessness, especially at critical decision points; it is "let's do nothing first and see whether it was already fine".

We are strongly against over-controlling and micro-managing every element and arrangement, especially somewhere as interwoven as the DOM, where you never fully grasp what a small upstream tweak does downstream. The default arrangement behaves civilized; many custom changes behave erratically.

---

## Type-driven TypeScript (Go / Rust)

- `interface` — methods only, no data fields. A class implements an interface.
- `type` — data only, no methods.
- `Map` (or a `Record` used as a map) — enum simulation: value → function. First map: `shape → nodeHTML`.
- Inheritance only through composition. Polymorphism through a `Map` of case → function.
- Preferably one major class per file, plus a few helpers.

---

## Soft 7

Limits for staying neat and readable. Break them occasionally if the design forces it — not routinely.

| Rule | Soft 7 |
|---|---|
| Lines in a block (`{}` / `()` / `<>`) | ~7 — one unit of logical progress |
| Blocks in a function or method | ~7, so a method is under about 50 lines |
| Methods on an `interface` | 7. `Stylist` is at the budget: a new verb replaces one or goes to a registry. |
| Code files per package | 7, not counting `types.ts` or config. `diagram/` deliberately runs over: routing a connector and drawing one are separate jobs, and merging them to hit the number would be the bigger file this table exists to prevent. |
| Major class per file | preferably one, plus helper classes and functions. Idally most code files implement an interface (or few) for a type. Though some, code files, especially secondary or helpers, might exists that has no trace in types.ts directly, but they must be related to an "implementing or logic class" directly.|
| `Map` entries, folders, packages | no limit. this is the way a package grows beyond our limits. |

A package is a new subject expert on the team; nesting is allowed but flat is better.

These rules are just observations around human `5 +/- 2` rule of cognitive ability and should be taken with a grain of salt. 
It loosely also means a good codebase on average has a soft of 5, a soft of 7, and a soft of 3 (average number, upper soft range, and lower soft range).

---

## Dependencies

Installing is not the same as choosing. `app-architecture.md` §0 already chose the stack; do not come back for permission to make that choice work.

**Install freely:** whatever the stack needs in order to run — if SolidJS needs its JSX compiler, install it, because that requirement is implicit in having chosen SolidJS. Any **dev** dependency: types packages, bundler plugins, a formatter. Dev tools are not architecture; they ship with nobody. Transitive and peer dependencies of both.

**Ask first:** a new **runtime** dependency that §0 does not imply — a second UI library, a layout engine, a CSS framework, a state manager, a parser, an IDE kit. That is a design decision wearing an install command, and it goes into §0 first. Same conversation to remove or rescope anything already there.

The test: would a reader of §0 be surprised to find this in `package.json`? If no, install it and move on. If yes, stop and say so. And do not hand-roll something §0 already covers in order to skip the conversation.

---

## What not to do in this repo

- Do not write a code editor, formatter-on-type, autocomplete, or syntax highlighting. The tab window is a bare `<textarea>`.
- Do not confuse `SetTab` (text tabs) with `inject` (sinks), and remember the styles and annotations tabs are neither — they are rows views onto a model.
- Do not build a CSS string to paint with, parse a sheet back, or reintroduce `plus` / `minus`. Style is data; `serialize()` is for export only.
- Do not give a chrome element a `class` or an `id` the CSS does not need. `app.css` is small because the markup is reachable by element and position, and every hook is a line someone reads before they can restyle anything. A hook exists for the layout, for a sink, or for a state a test drives. Decoration is not one of them.
- Do not write tests that chase float precision or other noise as if it were the product.
- Do not implement every `shape=` in one pass, and do not "fix" a deliberately absent default (`app-architecture.md` §3.2).
- Do not take a "while we're here" refactor.
- Do not change the law files or the root folders without review and approval. `.gitignore` is the canary: a file that should not be tracked will not be. Do not weaken the ignore to sneak a file in — move the file, or change the rule on purpose.

Nothing is parked. A draft that is not being finished is deleted; `temp/` is scratch, not a shelf.

---

## Browser verification is deliberate, not routine

`bun test` is the loop — pure tests, under half a second, run constantly. `bun run test:browser` launches Chrome for the CSSOM half. They are **two commands on purpose**, and chaining them was rejected: the browser half slows the loop enough to change how you work, and an agent that starts driving Chrome tends to stay there instead of finishing the task. Run it when a change is actually DOM-shaped — CSSOM, the rows tab, the sinks, an export. Most changes go without it.

When you do reach for a browser:

- **Drive it directly, never through a subagent.** One iteration handed verification to a browser subagent as a click-by-click script: every interaction became a separate approval prompt — hundreds — while nothing that mattered got asked. Read values in bulk instead, one `browser_evaluate` per question, one JSON blob back. A full Done-when list is about a dozen calls.
- **The agent sandbox intercepts the `Bun.serve` bind and reports a false `EADDRINUSE`** — port 3000 for `build/dev.ts`, 3101 for the browser suite. `lsof` shows nothing listening and retrying never clears it, because there is no contention to clear. Both need the sandbox disabled. Do not hunt a phantom process.

---

## Plans and instructions

Whoever executes a plan here has already read the four defining files. Write for that reader.

- Plans state **goals, decision points, and what done looks like** — not keystrokes. Do not enumerate every file, signature, or line when the architecture already implies them, and do not restate the architecture inside a plan. Point at the section.
- **Spell out the decisions** — the ones where a competent agent could reasonably pick differently, and where picking differently across iterations would leave us inconsistent. Those are the whole point of writing a plan down.
- Leave the *how* open. Naming inside a file, helper decomposition, JSX shape and test layout are the executor's call.
- If the plan and the architecture conflict, the architecture wins — say so rather than following the plan. An executor who finds the plan wrong stops and raises it instead of improvising a third design.

Same spirit as Soft 7: enough structure to stay coherent, not so much that it stops being thinking.

---

## Opening ceremony

Asked for at the start of a session: a fresh start, erasing the LLM memory and knowledge carried over from other sessions. **We already have everything we need.**

**Why erase.** This repo *is* the memory: `AGENTS.md` routes to the four defining files, `current-task.md` holds what is next, `docs/archive.md` holds what was decided and why, and git holds the rest. LLMs over-attend to the short-term memory in automated files at the expense of the longer vision that lives in the repo.

| Erase | What it carries |
|---|---|
| `memory/` | the global index, its topic files, every project directory |
| `conversations/` · `debug_conversations/` | past sessions, which conversation recall searches |
| `logs/` · `screenshots/` | a running record of past sessions, and their captures |
| `history` | every prompt ever typed |
| `cache/tool_outputs/` · `cache/file_recency.jsonl` · `cache/sql_result_cache/` | offloaded outputs, which files were used when, past query results |
| `tgrep/` · `.ctx/` · `plans/` | a code-search snapshot, stale task lists, old plan cards |

```sh
cd ~/.snowflake/cortex
rm -f history cache/file_recency.jsonl
for d in memory conversations debug_conversations logs screenshots plans tgrep \
         .ctx cache/tool_outputs cache/sql_result_cache; do
  find "$d" -mindepth 1 -delete 2>/dev/null
done
```

`find -mindepth 1 -delete` rather than `rm -rf dir/*`, because a non-matching glob makes zsh abort the whole line — which silently skipped the memory wipe once while appearing to succeed. `conversations/` will not end up empty: the session doing the erasing is still recording into it.

**Never touch** credentials, configuration, or installed tooling. None of it is knowledge: `agent/config.toml`, `agent/connections.toml`, `cache/credential_cache`, `mcp_oauth/`, `settings.json`, `permissions.json`, `hooks.json`, `mcp.json`, `cortex.json`, `cache/snowflake_account_info.json`, `cache/update_state.json`, `cache/debug_logging.json`, `.mcp-servers/`, `plugins/`, `skills/`.

Two rules for doing it. **Anything worth keeping was already filed in the repo** — if you are tempted to preserve an entry, that is the filing step telling you it never was; file it, then erase. And **a cross-project preference is not this repo's to file**: it belongs in the `user-preferences` skill (`~/.snowflake/cortex/skills/user-preferences/reference/`), which is hand-authored and survives this step, with a copy at `~/Repos/etc/coco-preferences/`. Before deleting anything that looks like a duplicate, **confirm the live copy exists** — do not infer it. A memory file deleted on the assumption that a skill covered it is gone for good; `rm` does not use the trash. That has happened once, to a file whose contents are now unrecoverable.

---

## Closing ceremony

Asked for at the end of a session: house-cleaning so the next one opens on a clean desk. Not deep — a stop-and-check.

1. **Archive what is done.** Finished work moves out of `current-task.md` into `docs/archive.md`: what was built, what was decided, what turned out wrong. `current-task.md` ends the session empty or holding only what is genuinely next.
2. **File what this session decided.** There is no debts ledger — it was retired once every entry had a proper home, and recreating one is how it grows back. A decision the code already implements goes into `app-architecture.md`, because a behaviour described nowhere gets "fixed" by the next session. Finished work, and anything that will never be closed, goes into `docs/archive.md` with the reasoning that makes it worth re-reading. Wanted-but-unscheduled work goes into `current-task.md` under **For Later**.
3. **Clean the desk.** Delete dead code, unused exports, one-off scripts, and tests that no longer test anything. A test that has stopped earning its place is deleted, not kept out of politeness.
4. **Check the canary.** `git status`. Anything unexpected means the ignore rules caught something — fix the cause, never the canary.
5. **Commit and push** with the identity the repo expects, then report: what shipped, what is open, what the next session should pick up.

---

## Gitignore

Extreme vetting, so the ignore file is a gate guard. Ignore everything except files whose extension is on our list (`ts`, `tsx`, `js`, `html`, `css`, `json`, `lock`, `md`, `dot`, `sh`, `svg`, `png`, …) **and** which sit inside an allowed root directory (`src`, `svg`, `icon`, `test`, `build`, `theme`, `docs`, `research-lab`, `dist`), nested or not.

Plus the root files by name: `user-story.md`, `app-architecture.md`, `coding-rules.md`, `AGENTS.md`, `CLAUDE.md`, `current-task.md`, `package.json`, `tsconfig.json`, `bunfig.toml`, `.gitignore` — and any specific file we deliberately whitelist.
