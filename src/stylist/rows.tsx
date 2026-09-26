// The styles tab: a rows table, not an editor (§4). A row is
// selector · property · value, which is all a style rule has ever been, with a
// delete on the left and an add on the right.
//
// The markup came from a ten-line prototype, less its toolbar — `.rows`,
// `.row`, `.sel`, `.prop`, `.val`, and the two datalists, named in full here so
// no DOT node can collide with them (§3.1). That prototype is styled by ten lines
// of CSS, and it is the only reason this tab is cheap to restyle. The three box
// classes stay because the browser checks drive the rows through them; the
// buttons carry nothing, since `.row button` already reaches them.
//
// There is no toolbar: a row is added by the ➕ on the row above it, and the list
// is the book re-read on every sync, so there is nothing for a Cleanup button to
// tidy that entering the tab does not.
//
// The list is a snapshot of `Stylist.rows()`, which is the book traversed in
// order. One row per entry: a repeated `(selector, property)` is an overwrite in
// the book, so it cannot be two rows here. Every row is editable and none is
// read-only — there is no layer beneath a row for it to shadow. Editing one
// writes at source 2, in place, keeping the entry's id.
//
// A row this tab has just invented is not in the book yet, so it has no id and
// its element carries none; there is nothing to point at until all three boxes
// say something. It picks one up on the next sync.
//
// Selector and property commit on `change`; the value commits on every
// keystroke. The split is deliberate — a value is one `setProperty` and the
// picture follows the caret, while a half-typed selector must never reach
// `insertRule`.
//
// A row whose value CSSOM will not take wears `.invalid`, which nothing styles:
// it is a hook for the browser checks and for a reader of the DOM, and the
// console carries the message. The rule stays in the book either way — the user
// typed it, so it is theirs to fix or to ❌.

import { createEffect, createSignal, Index } from "solid-js";
import * as T from "../types.ts";
import { priority } from "./sheet.ts";
import { REFUSED, type Stylist } from "./stylist.ts";

type Field = "selector" | "property" | "value";

// Ours, not CSS. `CSS.supports` has never heard of it.
const APPLY = "@apply";

/** The property box's catalog, and whether a swatch makes sense for it. */
const PROPERTY = new Map<string, "color" | "text">([
  ["@apply", "text"],
  ["color", "color"],
  ["background", "color"],
  ["background-color", "color"],
  ["border-color", "color"],
  ["fill", "color"],
  ["stroke", "color"],
  ["border-width", "text"],
  ["border-radius", "text"],
  ["stroke-width", "text"],
  ["font-family", "text"],
  ["font-size", "text"],
  ["font-weight", "text"],
  ["padding", "text"],
  ["gap", "text"],
  ["opacity", "text"],
  ["box-shadow", "text"],
]);

// `type=color` only speaks six-digit hex. A `var()` or a `color-mix()` keeps the
// text box rather than a swatch that would show black and mean nothing.
const HEX = /^#[0-9a-f]{6}$/i;

// A book entry's id is never `REFUSED` — the Stylist's counter starts at 1 — so
// that is how a row this tab has invented says it is not in the book yet. A fresh
// object each time: two blanks are two rows, and sharing one would make them one.
function blank(): Listed {
  return { selector: "", property: "", value: "", id: REFUSED, source: T.SOURCE.user, gone: false };
}

/**
 * A row as the list holds it: the book's row, plus whether the user has dropped
 * it. `gone` is the UI's own business and never reaches the book.
 *
 * ❌ removes the rule from the book and from CSSOM, and then only *hides* the
 * element — the book is the source of truth, and the list is rebuilt from it on
 * the next sync, where the row simply will not be. Splicing the element out as
 * well would be the UI keeping its own second opinion about what exists.
 */
type Listed = T.StyleRow & { gone: boolean };

/**
 * The list always ends with an untouched blank row, and `.rows` is
 * `column-reverse`, so that blank sits at the **top** of the screen: the next
 * thing you type is always the first thing you see. Filling it in appends the
 * next one.
 */
function ready(list: Listed[]): Listed[] {
  const last = list[list.length - 1];
  if (last !== undefined && !keyed(last) && !last.gone) return list;
  return [...list, blank()];
}

type RowsProps = {
  stylist: Stylist;
  /** Bumped by every redraw, so rules the DOT brought in show up here. */
  stamp: number;
};

/**
 * A row of the list, and its index **in the list** — not in what is on screen.
 * The three source checkboxes hide rows, and every edit verb addresses a row by
 * position, so the position has to survive the filter or hiding the theme would
 * silently re-aim the ❌ on the row above.
 */
type Shown = [row: Listed, at: number];

/**
 * The three boxes of the filter header, in the order they are shown. The name is
 * the box's own label — a bare checkbox says nothing about which source it hides,
 * and the id is a hook for the tests, not text for a reader.
 */
const FILTERS: Array<[id: string, source: T.Source, name: string]> = [
  ["theme-styles-selected", T.SOURCE.theme, "theme"],
  ["dot-styles-selected", T.SOURCE.dot, "dot"],
  ["user-styles-selected", T.SOURCE.user, "user"],
];

export function Rows(props: RowsProps) {
  const [rows, setRows] = createSignal<Listed[]>([]);
  // All three on, so the tab opens on the whole book. This is view state only:
  // nothing here writes to the book, and nothing is fed, so hiding a source
  // cannot change the picture.
  const [shownSources, setShownSources] = createSignal<T.Source[]>(FILTERS.map(([, source]) => source));

  const shown = (): Shown[] =>
    rows()
      .map((row, at): Shown => [row, at])
      .filter(([row]) => shownSources().includes(row.source));

  const toggle = (source: T.Source, on: boolean) =>
    setShownSources(on ? [...shownSources(), source] : shownSources().filter((shown) => shown !== source));

  // The book, re-read, with a blank waiting at the end. A row the user dropped or
  // a blank they never filled in is simply not in the book, so it is not here.
  createEffect(() => {
    void props.stamp;
    setRows(ready(props.stylist.rows().map((row) => ({ ...row, gone: false }))));
  });

  const write = (at: number, field: Field, value: string) => {
    const before = rows()[at]!;
    const after = { ...before, [field]: value, source: T.SOURCE.user };
    // Only a changed key removes the old entry. Rewriting the value in place is
    // what keeps the row's id, and the id is the whole reason it exists.
    const rekeyed = before.selector !== after.selector || before.property !== after.property;
    if (rekeyed && keyed(before)) props.stylist.removeRule(before.selector, before.property);
    // The book mints the id, and the row wears it from the moment the rule exists
    // — waiting for the next sync would leave a live rule with no way to point at
    // its element. A user write is source 2 and cannot be refused, but if it ever
    // were, the row keeps whatever id it had.
    const minted = keyed(after) ? props.stylist.addRule(after.selector, after.property, after.value, T.SOURCE.user) : REFUSED;
    const id = minted === REFUSED ? after.id : minted;
    // Said once, here, rather than in the render: a rejected row keeps its class
    // for as long as it is wrong, and saying so again on every re-render would
    // bury the one line that matters.
    if (!supported(after)) {
      console.error(`[styles] ${after.selector} { ${after.property}: ${after.value} } rejected by CSSOM`);
    }
    // `ready` runs on the way out: filling in the waiting blank is what puts the
    // next one there, so the top of the list is never occupied for long.
    setRows(ready(rows().map((row, i) => (i === at ? { ...after, id } : row))));
  };

  const insert = (at: number) => setRows([...rows().slice(0, at + 1), blank(), ...rows().slice(at + 1)]);

  // Out of the book, out of CSSOM, and hidden here. Not spliced out: the list is
  // the book's reflection, and the next sync is what removes the element.
  const drop = (at: number) => {
    const row = rows()[at]!;
    if (keyed(row)) props.stylist.removeRule(row.selector, row.property);
    setRows(ready(rows().map((one, i) => (i === at ? { ...one, gone: true } : one))));
  };

  return (
    <section>
      <datalist id="selector-list">
        <Index each={selectors(rows())}>{(name) => <option value={name()} />}</Index>
      </datalist>
      <datalist id="property-list">
        <Index each={[...PROPERTY.keys()]}>{(name) => <option value={name()} />}</Index>
      </datalist>

      <nav class="checkbox">
        <Index each={FILTERS}>
          {(filter) => (
            <label for={filter()[0]}>
              <input
                type="checkbox"
                id={filter()[0]}
                checked={shownSources().includes(filter()[1])}
                onChange={(event) => toggle(filter()[1], event.currentTarget.checked)}
              />
              {filter()[2]}
            </label>
          )}
        </Index>
      </nav>

      <div class="rows">
      <Index each={shown()}>
        {(entry) => {
          const row = () => entry()[0];
          // Read through `entry()` too: `Index` keys by position, so when the
          // filter changes this slot is handed a different row of the book, and a
          // once-captured index would aim the next edit at the old one.
          const at = () => entry()[1];
          return (
          // Each box carries its own `title`: the pane is narrow, so a long
          // selector or value is read by hovering rather than by clicking in.
          <div
            class="row"
            classList={{ invalid: !supported(row()) }}
            id={row().id === REFUSED ? undefined : String(row().id)}
            data-source={row().source}
            hidden={row().gone}
          >
            <button title="remove this row" onClick={() => drop(at())}>❌</button>
            <input
              class="sel"
              list="selector-list"
              placeholder="selector"
              title={row().selector}
              value={row().selector}
              onChange={(event) => write(at(), "selector", event.currentTarget.value)}
            />
            <input
              class="prop"
              list="property-list"
              placeholder="property"
              title={row().property}
              value={row().property}
              onChange={(event) => write(at(), "property", event.currentTarget.value)}
            />
            <input
              class="val"
              type={swatched(row()) ? "color" : "text"}
              placeholder="value"
              title={row().value}
              value={row().value === "" && swatched(row()) ? "#000000" : row().value}
              onInput={(event) => write(at(), "value", event.currentTarget.value)}
            />
            <button title="insert a row below" onClick={() => insert(at())}>➕</button>
          </div>
          );
        }}
      </Index>
      </div>
    </section>
  );
}

// A row reaches the book only when all three boxes say something. An empty value
// is not a rule: `@apply` with nothing after it throws at feed time, and for
// every other property `setProperty(…, "")` paints nothing anyway. It also gives
// clearing the value box its natural meaning — the rule is removed.
function keyed(row: T.StyleRow): boolean {
  return row.selector !== "" && row.property !== "" && row.value !== "";
}

/**
 * Whether CSSOM will actually take this declaration.
 *
 * A value CSSOM cannot parse is dropped in silence — `0px0`, `margn`, and an
 * `!important` left inside the value all vanish the same way, leaving a row that
 * looks committed and paints nothing. `CSS.supports` is the same parse, asked out
 * loud, so the row can wear the answer.
 *
 * Derived, never stored: a rule the theme or the DOT brought in can be wrong too,
 * and it never passes through `write`.
 */
function supported(row: T.StyleRow): boolean {
  if (!keyed(row) || row.property === APPLY) return true;
  return CSS.supports(row.property, priority(row.value)[0]);
}

function swatched(row: T.StyleRow): boolean {
  return PROPERTY.get(row.property) === "color" && (row.value === "" || HEX.test(row.value));
}

function selectors(rows: T.StyleRow[]): string[] {
  return [...new Set(rows.map((row) => row.selector))].filter((name) => name !== "");
}
