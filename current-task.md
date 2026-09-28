
Always read these files in each session:
- [describe the app](./user-story.md)
- [how to design and develop](./coding-rules.md)
- [what have been decided](./app-architecture.md)


# Current task

**Annotation overhaul + markdown parser removal — sessions 1, 2 and 3 are done
and archived.** Their full records, including the reasoning and the findings, are
in `docs/archive.md`. What is left of that plan is Session 4 below.

---

## Session 4 — repaint discipline

**Goal.** Nothing updates while you are typing, and nothing invalid ever reaches
CSSOM.

1. **Commit on `change`, never on `input`.** `src/stylist/rows.tsx` binds the value
   box to `onInput`, so every keystroke is a `setProperty` and a repaint. That is a
   bug, not a feature. Move it to `onChange`, matching the selector and property
   boxes.
2. **An invalid value is not written at all.** Today `write()` calls `addRule`
   unconditionally and *then* checks `supported()`, so a bad value reaches the book
   and CSSOM before being marked. Invert it: when `supported()` is false, mark the
   row `.invalid` and **do not touch the book**. The row keeps the user's text and
   the picture keeps the last good value. `removeRule` on rekey still runs, so a row
   cannot leave a stale entry behind.
3. **Text tabs never live-update.** Already true — the `<textarea>`'s `onInput` only
   writes the store, and the store is read at `redraw()`. This session's job is to
   **record it as law** in §5 ("one conductor means one trigger") so nobody wires a
   reactive redraw later. No code change expected here; if one is needed, that is a
   finding worth reporting.

**What Session 3 already settled.** Item 1 is **done for annotation rows** — they
never had an `onInput`, so only the styles tab's value box is left. Item 2 does
**not** extend to annotation rows and should not be made to: an offset is never
parsed by us (§4), and a bad one is dropped by CSS at computed-value time, so there
is no `supported()` equivalent and no `.invalid` for them. Items 2 and 3 are
otherwise untouched.

**Verify.** A check that types an invalid value and asserts the sheet still holds
the previous value while the row wears `.invalid`. A check that typing in the DOT
textarea changes nothing until Redraw. Remember the harness fails the run on any
console error, so the invalid-value check must assert its own error line and then
`errors.splice()` it back out.

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
