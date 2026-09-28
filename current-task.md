
Always read these files in each session:
- [describe the app](./user-story.md)
- [how to design and develop](./coding-rules.md)
- [what have been decided](./app-architecture.md)


# Current task

**Nothing open.** The annotation overhaul and the markdown parser removal are
finished — sessions 1, 2, 3 and 4 are all done and archived, with the reasoning in
`docs/archive.md`. Session 4's law about when a change reaches the picture is in
`app-architecture.md` §5.

The next session picks from **For Later** below.

---

## For Later

### A refactor and cleanup pass over the whole of `src/`

Raised at the end of Session 3 and **deliberately deferred**: the annotations
feature cost **191 code lines** in `src/`, which prompted measuring the whole tree
for the first time in a while.

```
src/            3,661 lines total       2,358 excluding blanks and comments
  before Session 3                      2,167
  Session 3                               191
```

The number worth keeping in view is that one feature was 8% of the codebase, and
that `stylist/rows.tsx` — the tab it mirrors — is 159 code lines on its own. A
rows tab is simply an expensive shape. If that price is wrong, the thing to
reopen is the decision to give annotations a tab, not the implementation of it.

**Known fat, already identified, roughly 30 code lines plus comments:**

- **`src/app.css`'s `.annotations` block is 23 lines and should be 8.** Session 3's
  own plan said "no styling beyond what the Styles rows already use", and §4 says
  nothing is named for decoration — then the tab arrived with per-column widths.
  `flex: 1` on the line-one inputs replaces all of them; only `.text`'s
  `flex: 1 0 100%` earns its keep, because it is the wrap point.
- **Three of five class hooks die with those widths.** `.sel` `.dx` `.dy` `.cls`
  exist only to carry a width. The browser checks address rows through them
  (`markBox`), so they would move to addressing inputs by position, which is what a
  person does anyway.
- **`FIELD` and `field()` lose their `hook` and `placeholder` columns** at the same
  time — the array becomes one line of field names.
- **`mark()`'s offset chain is five lines doing two lines' work.**
- **Comment density.** `annotations.tsx` is 80 comment/blank lines of 177. That is
  in line with the house voice (`rows.tsx` carries 131), so it is a question about
  the voice rather than about this file, and it should be answered once for the
  whole tree rather than file by file.

Nothing here is urgent and nothing here is broken: both suites are green and the
law describes what the code does. This is a tidy, and it wants one pass with a
whole-tree view rather than a patch inside the next feature.

---

## Risks

- **`bun run test:browser` needs `dangerously_disable_sandbox: true`.** The sandbox
  refuses the port 3101 bind and surfaces it as `EADDRINUSE`, which reads exactly
  like a stale run but is not — `lsof -nP -iTCP:3101 -sTCP:LISTEN` shows nothing.
- **That note has a real-process sibling, so check `lsof` before assuming phantom.**
  A dev server left running from an earlier session holds port 3000 for real, and
  because `build/dev.ts` bundles per request from a process that predates your
  `bun add`, it serves a **500 whose body is a resolution error** for the new
  dependency while `bun run build` succeeds from the same tree. The symptom points
  at the dependency; the cause is the process. Kill and restart it.
- **A throw inside a browser check stage is silent.** The run stops, the report
  keeps the last published stage, and nothing is printed — `publish("crashed")`
  does not fire for a rejection out of the checks module's own top-level `await`.
  Reach straight for a temporary `.catch((e) => check("DEBUG", false, e.stack))` at
  the call site rather than re-reading the stage.
- **`git push` needs `dangerously_disable_sandbox: true` too.** The sandbox proxy
  answers `CONNECT tunnel failed, response 403`, which looks like a credentials
  problem and is not.
- **The tree often holds uncommitted WIP.** Test counts move under it, and a suite
  that turns red mid-session may be the user's edit rather than yours. Say which.
