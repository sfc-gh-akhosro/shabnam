# Coding rules

How we design and write code here. Required reading for every session. What the
app does is the story's job (`user-story.md`), what it therefore decides is the
architecture's (`app-architecture.md`); this file is the craft in between. When
code and those files disagree, change one or the other together — never a
silent third design.

---

## How we design: story → types → architecture → code

Each step is derived from the one above it. Skipping one is how you end up with
code nobody can explain.

1. **Tell the story.** Prose a peer could read aloud: what comes in, what goes
   out, who owns which step, and why. The test is the reader saying "oh, this
   app does *this*, in *this* way." A story nobody can argue with and nobody can
   picture has failed.
2. **The types fall out of the story.** Every player the story names becomes a
   type; every way two players talk becomes a method. Write only what the story
   implies.
3. **The architecture records the decisions** — briefly, pointing at the story
   rather than retelling it.
4. **The code implements the types**, in files named after the players.

### What "types" means here

Three kinds, and all three are the design:

| Kind | Holds | Written as |
|---|---|---|
| **interface** | behaviour: a set of methods, like a Rust trait | `interface StyleBook { add(style: Style): boolean }` |
| **type** | state: data, no methods | `type Style = { selector; property; value; source }` |
| **enum** | a lookup table: key → value, or key → function | `Map` or `Record`, nested when needed: `SHAPE_HTML: Map<Shape, (node) => Html>` |

**Interfaces are the core of the design**, and the easiest to overlook: they are
the conversations between players. Types hold what is known; enums are how a
closed set of cases becomes code, and they replace `switch` and inheritance —
polymorphism is a `Map` from case to function.

So "the types" of a story or a package almost always means: the **major
types**, the **major interfaces and their methods**, the **major class** named
with what it implements and from which types ("`Connectors` implements
`Connectors` over `Placement` and `ConnectorRules`"), and the **enums**. Not
every record; inner ones stay with their code.

Name the atomic types. `sameRank: NodeId[][]` reads on its own; `string[][]`
needs a reference open beside it.

### A `types.ts` is a story, not a registry

A `types.ts` retells its story with more precision. It is not the place every
type lives: helper, intermediate and inner-code types stay in the file that uses
them, so `types.ts` stays readable top to bottom.

Ideally — not necessarily — each package has its own `story.md` and
`types.ts`. The perspective changes with the package: the root story is the
user's; the story inside `paint/` is told from the painter's chair. A package
without one is fine until its story is worth telling.

### Names read

A name alone should say what it holds. `Book`, `Reader`, `Table` say nothing;
`StyleBook`, `DotReader` do. Then a method needs one word:
`styleBook.add(style)` reads as a sentence, and `addStyle` would repeat the
class. A class does one job through a few verbs — two `add`s means two classes,
or one verb.

### Wall each library off behind one named class

A third-party library is visible inside exactly one class, named after it —
`DotReader` over `@ts-graphviz/ast`, `DagreLayout` over dagre. The type list
alone then tells you where a dependency could leak from, and replacing one is
one file.

### Experiment in `research-lab/` before touching `src/`

A design is a claim, and a claim gets tested where it is cheap. Build it in
`research-lab/<topic>/` with a script or page that shows real output from real
fixtures, then read it. Print what you store, not a tidied view of it. Probe
rather than remember: "does this library do X?" is answered by running it.

---

## The happy path

- Write the happy path. Always.
- No `try` / `catch` unless the error has happened in a real run, we looked at
  it together, and we agreed the catch is the fix. The app has one, around the
  parse.
- No defensive code: no guards for states the types already forbid, no "just in
  case" defaults, no fallbacks that hide a bug.
- No dead code, no unused exports, no commented-out blocks.
- No clever wrappers, no second abstraction for one call, no `any` over a type we
  have not designed. At a library's boundary its shapes are its own; an `any`
  there is fine.
- When something is wrong, **let it throw**. A crash with a stack is the feature.

**Don't be pedantic.** An edge case nobody cares about gets the smallest thing
that stops it breaking. A node name with a space gets `.replace(/ /g, "_")` and
nothing more.

## No "what if"

A "what if" is code for a state nobody has observed. Each one is cheap and
defensible alone, which is exactly how a clean codebase becomes a large one.

A what-if belongs in the design, not the code. If a state cannot happen, say so
in the types and delete the check. If it can and we choose not to serve it, say
so in the architecture and delete the code. **"It could happen" is not a reason;
"it happened" is.**

Correct is not defensive. Encoding at a boundary — `encodeURIComponent`, CDATA,
escaping into HTML — is how the boundary works, not a guard.

## Trust the default

Doing nothing is often enough. Take the platform's default first, and go
further only when we see we need to. The DOM behaves civilized left alone;
micro-managing it behaves erratically.

## Soft 7

Soft ranges, written *(low, mid, high)*. They keep a page readable. They are
not a quota, and they are not the design. Story and architecture come first;
break a number when those need it, not to make the table look used. The
average across files should sit near the middle. One-liners are common and
fine.

A **player** is who talks to someone else: one public class, one conversation.
The steps inside that job are paragraphs, not players, and not files.

| | *(low, mid, high)* |
|---|---|
| method / function | *(9, 25, 49)* lines — `3×3`, `5×5`, `7×7`. One-liners are fine. |
| interface | *(3, 5, 7)* public methods; a new verb replaces one or goes into a map |
| class | *(27, 125, 350)* lines — `9×3`, `25×5`, then a hard-ish 350. Implements the interface, plus private methods and helper functions in the same class or file. |
| file | *(100, 500, 1000)* lines — the class and its core methods, plus the helpers and private methods |
| code files per package | about 7, not counting `types.ts` and `story.md`. Start at 1. A new file is a new player, not a chapter of the same class. |
| classes per file | one main class. Its helpers stay in that file. A helper is not a player. |
| map entries, packages | no limit — this is how the app grows |

A package is a subject expert on the team. One expert, one mouth: one public
class. Flat is better than nested.

If a working lab file already has the design, that file *is* the package. Type
it, strip what `src/` must not have, stop. Size is not a reason to split what
already reads.

## Dependencies

`app-architecture.md` §0 chose the stack. Install freely whatever that stack
needs to run, and any dev dependency. **Ask first** for a new runtime
dependency the stack does not imply — a UI framework, a state manager, a
parser. The test: would a reader of §0 be surprised to find it in
`package.json`? And do not hand-roll what a mature library does properly just to
skip the conversation.

## What not to do

- No code editor, highlighting or autocomplete. The text panes are bare
  textareas.
- No CSS text on the paint path, and no parsing a sheet back. Style is data; the
  only CSS text is the one printed for export.
- No class or id on a chrome element the CSS does not need. A hook exists for
  layout, for a sink the diagram writes, or for a state a test drives.
- No tests that chase float precision.
- No "while we're here" refactor.
- No change to the defining files or the root folders without review.
- Nothing is parked. A draft that is not being finished is deleted.

---

## Tests and the browser

`bun test` is the loop: the pure half, fast, run constantly. `bun run
test:browser` drives headless Chrome for the CSSOM and DOM half. They are two
commands on purpose — run the browser half when a change is DOM-shaped, not
after every edit.

When you reach for a browser, drive it yourself rather than through a subagent,
and ask in bulk — one `browser_evaluate` per question, one JSON blob back. The
agent sandbox reports a false `EADDRINUSE` on the dev and test ports; run those
servers with the sandbox disabled rather than hunting a phantom process.

## Plans

Whoever executes a plan has read the defining files; write for that reader.
State goals, decisions, and what done looks like — not keystrokes. Spell out
the decisions where a competent agent could reasonably choose differently, and
leave the how open. If a plan and the architecture disagree, stop and raise it.

---

## Opening ceremony

At the start of a session, on request: erase the agent's carried-over memory,
because **the repo is the memory** — the defining files, `current-task.md`, and
git. Agents over-attend to short-term notes at the expense of the longer vision.

```sh
cd ~/.snowflake/cortex
rm -f history cache/file_recency.jsonl
for d in memory conversations debug_conversations logs screenshots plans tgrep \
         .ctx cache/tool_outputs cache/sql_result_cache; do
  find "$d" -mindepth 1 -delete 2>/dev/null
done
```

`find -mindepth 1 -delete`, not `rm -rf dir/*`: a non-matching glob makes zsh
abort the line and silently skip the rest.

Never touch credentials, configuration or installed tooling: `agent/`,
`mcp_oauth/`, `settings.json`, `permissions.json`, `hooks.json`, `mcp.json`,
`cortex.json`, `cache/credential_cache`, `cache/snowflake_account_info.json`,
`.mcp-servers/`, `plugins/`, `skills/`.

Anything worth keeping should already be filed in the repo. A cross-project
preference belongs in the `user-preferences` skill, not here. Before deleting
something that looks like a duplicate, confirm the live copy exists — `rm` has
no trash.

## Closing ceremony

At the end of a session, on request — a stop-and-check, not a deep clean.

1. **File what was decided.** A decision the code now implements goes into
   `app-architecture.md` (or a package's `story.md`), because a behaviour
   described nowhere gets "fixed" by the next session. The why of finished work
   goes into the commit message. There is no archive and no debts ledger: an
   agent reads every file it can find, and history is noise to it.
2. **Update `current-task.md`.** Remove what is done; keep only what is next,
   and wanted-but-unscheduled work under **For Later**.
3. **Clean the desk.** Delete dead code, unused exports, one-off scripts, and
   tests that no longer test anything.
4. **Check the canary.** `git status`. Untracked local files and folders are
   normal and nobody's business: if we don't track it, we don't care. The
   canary is what gets *staged* — commit only files the ignore rules allow, and
   never weaken the rules to let junk in.
5. **Commit and push** with the repo's identity, then report what shipped, what
   is open, and what the next session picks up.

## Gitignore

The ignore file is a gate guard. Everything is ignored except files with an
allowed extension (`ts`, `js`, `html`, `css`, `json`, `lock`, `md`, `dot`, `sh`,
`svg`, `png`, …) inside an allowed root folder (`src`, `svg`, `icon`, `test`,
`build`, `theme`, `docs`, `research-lab`, `dist`), plus the root files by name:
`user-story.md`, `app-architecture.md`, `coding-rules.md`, `AGENTS.md`,
`CLAUDE.md`, `current-task.md`, `package.json`, `tsconfig.json`, `bunfig.toml`,
`.gitignore`. To track something new, move it or change the rule on purpose —
never weaken the rule to sneak a file in.

The guard protects what we commit, not what sits on disk. Local, untracked
files and folders — notes, drafts, scratch output — are expected and plentiful;
leave them alone, don't report them, and don't stage them.
