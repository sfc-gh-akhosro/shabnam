
Always read these files in each session:
- ./user-story.md
- ./coding-rules.md
- ./app-architecture.md


# Current task

**Annotation overhaul + markdown parser removal.** Four sessions, each a separate
commit, each ending green on `bun test` and `bun run test:browser`.

Sessions 1 and 2 are independent and may swap order. 3 depends on both. 4 depends
on 3. Every session below is written to be read cold — take one, read the law
(`AGENTS.md` → `app-architecture.md` → `coding-rules.md`), and go.

**Session 1 is done.** Next up: **Session 2** — its section is unchanged and still
reads cold. Session 1's section below is now a record of what was removed, and
carries two no-op findings plus a note for Session 3.

---

## Why

Two problems, discovered together.

**Annotations are authored as raw HTML in a textarea.** The anchoring engine
underneath is good — `data-selector` is a real CSS selector, `place()` publishes
`--anchor-x` / `--anchor-y`, and the theme spends them with `calc()` — but the
authoring surface is a free-text box where the only thing to do is get the markup
wrong. The Styles tab already proved the better shape: typed rows, columns that
*are* the contract.

**We ship a hand-rolled markdown parser.** `node-shaper.ts` carries an `MD` map of
six regexes plus image surgery plus manual escaping, and its own comment calls it
*"the second grammar we own"* — directly against §1's "there is never a second
grammar". It arrived inside commit `6393453` ("Visual cluster SVG boxes, smart
connectors, 1:1 workbench parity, and CodeJar editors"), undiscussed, and the law
names it once in §3.2 only as a wart. Nobody writes a markdown parser; they call
one. §0 says hand-rolling what a mature library does properly, to avoid a
conversation, is the worse outcome.

The two meet because annotation text is markdown too.

---

## Decisions already taken

Do not relitigate these in a session. If one is wrong, say so and stop.

| Question | Answer |
|---|---|
| Anchoring | **Kept.** `left: calc(var(--anchor-x) + var(--dx, 0px))`. The rows table is a typed front-end for the existing §4 contract, not a replacement. |
| Offset names | `--dx` / `--dy`. Not `--left` / `--top` — already in the theme, §4, `docs/archive.md` and the browser checks. |
| Where annotation positioning CSS lives | `theme/basic-theme.json`, **never `src/app.css`**. `app.css` is chrome and is excluded from the picture export (§4.1) — a rule there positions on screen and collapses every annotation to the layer's corner in every exported SVG and PNG. |
| Annotation text | Markdown, **block** (`render()`) — lists and paragraphs work. |
| Node / record labels | Markdown, **inline** (`renderInline()`) — no `<p>` wrapper. |
| Markdown engine | `markdown-it`, with `html: true`, `breaks: true`, `linkify: true`. |
| Line break | **`\n`** — literal backslash, letter n. See below. |
| Source of truth | The annotation **rows are the model**; the HTML is derived into the sink. Parsing HTML back into rows is the parser §3.5 refuses. |
| Annotation identity | An **ordered list** with a minted id, not a map — two annotations may share a selector. |
| Row hook | `[data-selector]`, which the theme already selects on. **No `.annotation` class** — a second way to say the same thing, and a user editing the class column could type it away. |
| List direction | Annotation rows read **top-down**, not inheriting the Styles tab's `column-reverse`. Reversing a positional list is more confusing than reversing a map. |

### The line-break contract

Users type labels and annotations into a single-line `<input>`, which makes **both**
CommonMark break mechanisms unreachable: Enter inserts no character, so a real `\n`
can never be produced, and neither can a two-trailing-spaces hard break. The break
must therefore be typeable as visible characters — and the app already has that
vocabulary, because `\n` is what a DOT author writes in a label today and what
`node-shaper.ts` already converts.

```
user types:   Batch\nColumnar\nVectors
pre-pass:     \n \l \r   →  real newline
markdown-it:  breaks: true   →  <br>
```

One convention for node labels, record labels and annotations. This promotes the
pre-pass from a Graphviz implementation detail to a **§7 decision** covering all
label and annotation text.

Accepted consequences, both fine for names and short labels:

- `\n\n` is a **paragraph** break in block mode, so a two-paragraph annotation is a
  taller box under the same `--dy`.
- A literal backslash-n needs `\\n` — markdown's own escape, costing us nothing.
- `html: true` also lets someone type `<br>`, but `\n` is the documented way.

---

## Session 1 — purge every trace of annotation logic ✅ DONE

**Goal (met).** The app runs with **three** tabs and an empty `#annotation-html`.
Nothing positions anything. Both suites green — `bun test` 84 pass / 0 fail,
`bun run test:browser` 63 pass / 0 fail, stage `done`.

What was deleted, against the nine items as written:

1. `workbench.tsx` — `STARTER_HTML` gone, `annotation` gone from `STARTER_TEXT`
   and `seeded()`. The header comment now says "two text tabs".
2. `engine.ts` — `place()`, `middle()`, the `inject("annotation-html", …)` call
   and the `annotation-html` entry in `SINK_WRITE` all gone. `T.Point` is no
   longer imported by name, so the `import * as T` line is untouched. The file
   header now reads "redraw, sinks, measure".
3. `types.ts` — `annotation` out of `TabText` (now two keys), `place()` out of
   `Workbench`, `"annotation"` out of `TabId` (now three). Both doc comments
   recount.
4. `tabs.tsx` — the `annotation.html` entry is gone, `TAB_IDS` is three, header
   says "Three equal buttons". `keys.ts` lost `"tab-4"` from `Command` and `4`
   from `KEY_COMMAND`; `workbench.tsx` lost the `"tab-4"` handler.
5. `theme/basic-theme.json` — the `#annotation-html > [data-selector]` block is
   gone. `#annotation-html, #diagram-svg` stays; that is the layer.
6. **No-op — nothing to delete.** `src/app.css` has no `#annotation-html div { …
   --x … --y … red }` block. The only `#annotation-html` mentions left in it are
   the kept layer rule at line 285 and a prose reference in the comment above
   `#diagram-svg` explaining why a replaced element needs explicit sizing. Both
   are correct and stay.
7. **No-op — no edit needed.** `files.ts` never named `annotation`: the seed is
   `JSON.stringify({ ...text, styles })`, so dropping the key from `TabText` in
   item 3 removed it from the export by construction.
8. `test/browser/checks.ts` — `marks()`, `centre()` (only `marks` used it), the
   three anchor assertions in `smoke()`, `manyMatches()` and its
   `publish("anchors")` are gone; the tab assertion now expects
   `"diagram.dot styles action.js"` and is named "three tabs". Browser check
   count 67 → 63.
9. `test/ui-integration.test.ts` — the `annotation: "<div>Note</div>"` seed and
   its assertion are gone; the test is renamed to "the **two** text tabs".

**Verified.** `bunx tsc --noEmit` clean. Tab strip reads
`diagram.dot styles action.js`. `Cmd+4` does nothing. `grep -rn data-selector
src/ theme/ test/` finds nothing, and so does `--anchor-x` / `--dx`.

**Not committed.** The tree also carries an unrelated uncommitted edit to
`coding-rules.md` that was there before this session started, so staging was left
to the user rather than swept into this commit.

**Reminder for Session 3.** `place()` and the theme's
`#annotation-html > [data-selector]` block are restored nearly verbatim. The
pre-session text of both is in `git show HEAD:src/workbench/engine.ts` and
`git show HEAD:theme/basic-theme.json` — copy from there rather than rewriting,
and bring the long `place()` comment with it.

---

## Session 2 — kill the hand-rolled markdown, adopt markdown-it

**Goal.** No regex-based markup translation anywhere in `src/`. One library call.

1. **Add the dependency.** `markdown-it` + `@types/markdown-it`.
2. **Amend the law first** — §0 requires the conversation to land in the document
   before the library lands in the tree.
   - §0's stack list gains `markdown-it`.
   - §7 gains two rows: **Markdown** (`markdown-it`; `renderInline()` for labels,
     `render()` for annotations; `html` / `breaks` / `linkify` on) and **Line
     break** (`\n`, one contract for labels and annotations).
   - `docs/archive.md` records that the `MD` map rode in inside `6393453`
     undiscussed, that its own comment called it "the second grammar we own"
     against §1, and that the fix is a library. Update §3.2's markdown wart
     reference.
3. **Delete** the `MD` map and the regex chain in `text()` in
   `src/diagram/node-shaper.ts`.
4. **Keep the pre-pass**, now as the line-break contract: `\n` / `\l` / `\r` to real
   newlines, and `\|` / `\{` / `\}` to the literal character. Substitution on one
   already-parsed field is not a grammar (§3.5, §7 "Label escapes").
5. **Drop the manual HTML escaping.** With `html: true` an author's `<` passes
   through. This is a deliberate widening, not an oversight: the app already injects
   trusted HTML into a sink and runs arbitrary `action.js`, so HTML in a label is no
   new capability. Say so in §7 rather than leaving it implicit.
6. **Icons keep working through the library's own extension point.**
   `![alt](bucket.svg)` must resolve to an inlined data URI from `icon/` — §4.1, a
   remote image would make Redraw fetch, taint the PNG canvas and break standalone
   export. Override markdown-it's `image` renderer rule to emit
   `<img class="icon" src="${iconSrc(src)}" alt="…">`. That is the documented hook;
   do not post-process the parser's output.
7. **Where it lives.** A `markdown.ts` in `diagram/`, holding the configured
   instance and the two entry points. It is a pure string-to-string worker, so
   `diagram/` is right (§3). It puts `diagram/` one file further over its soft 7,
   which §9 already tolerates for this package — note it, do not merge files to
   dodge the number.

**Verify.** The starter's `![star](star.svg) Platform Core` still renders an inlined
icon plus text. `**bold**`, backtick code, `~~del~~` and links still render. `A\nB`
breaks. A literal `<br>` breaks. Then **eyeball both `research-lab/` fixtures** —
see Risks.

---

## Session 3 — annotations as a rows table

**Goal.** Annotations are authored as typed rows. No HTML is written by hand.

### Model

```ts
type Annotation = {
  id: number;       // minted; an ordered list, not keyed by selector
  selector: string; // a CSS selector, handed to querySelectorAll
  dx: string;       // any CSS length
  dy: string;
  class: string;    // free, styled from the Styles tab
  text: string;     // markdown
};
```

An ordered `Annotation[]`, replacing `TabText.annotation`. Home: a small
`annotations.ts` in `workbench/`. The export seed carries `annotations` as an array.

### Emission

A row reaches the sink only when **selector and text both say something** — the same
gate `keyed()` gives a style row, and for a sharper reason: `querySelectorAll("")`
throws `SyntaxError`, so a half-filled row would take the app down.

```html
<div data-selector="#core" class="note" style="--dx: 1em; --dy: 4em">
  …markdown-it render() output…
</div>
```

Omit `--dx` / `--dy` when blank, so the theme's `var(--dx, 0px)` default applies.
Emit `div`, not `span`: `position: absolute` makes display moot, and the existing
selectors and starter already assume a div.

### The tab

Two lines per annotation, no styling beyond what the Styles rows already use:

```
line 1:  [x 2em] [selector 7em] [dx 5em] [dy 5em] [class 7em] [+ 2em]
line 2:  [ text — full width ]
```

Reuse the Styles-tab conventions wholesale: a waiting blank at the end, `title` on
every box because the pane clips, and the remove button hides the row while the next
sync rebuilds from the model.

### Engine

`place()` comes back **unchanged from the version Session 1 deleted** — selector →
`querySelectorAll` → union of rects → `--anchor-x` / `--anchor-y` measured off the
layer. It was correct; only its input changes. The theme's
`#annotation-html > [data-selector]` block is restored verbatim too.

### Law edits

§4's tab table loses the `annotation.html` row, and "four tabs, one of them is not
text" becomes "four tabs, **two** of them are not text". §4's annotation prose keeps
the anchoring contract and drops the "the user writes HTML" framing. `TabId` regains
`"annotation"`; `TabText` does not.

**Verify.** Port the three deleted anchor checks to drive the rows instead of the
textarea — node anchor, layer-as-origin, `%` offset — and add: the many-match union;
a blank-selector row emitting nothing rather than throwing; `**bold**` and `\n`
surviving into a mark.

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

Annotation rows inherit all three, being built on the same conventions in Session 3.

**Verify.** A check that types an invalid value and asserts the sheet still holds
the previous value while the row wears `.invalid`. A check that typing in the DOT
textarea changes nothing until Redraw. Remember the harness fails the run on any
console error, so the invalid-value check must assert its own error line and then
`errors.splice()` it back out.

---

## Risks

- **Session 2 can visibly change existing diagrams.** The old map applied `**`
  before `*` by insertion order and understood nothing about nesting or escapes.
  Real CommonMark will disagree with it somewhere. Eyeball the starter and both
  `research-lab/` fixtures, not just the assertions.
- **`html: true` widens what a label can do.** Argued and accepted, but it is a
  change in kind and belongs in §7 explicitly.
- **`bun run test:browser` needs `dangerously_disable_sandbox: true`.** The sandbox
  refuses the port 3101 bind and surfaces it as `EADDRINUSE`, which reads exactly
  like a stale run but is not — `lsof -nP -iTCP:3101 -sTCP:LISTEN` shows nothing.
- **The tree often holds uncommitted WIP.** Test counts move under it, and a suite
  that turns red mid-session may be the user's edit rather than yours. Say which.
