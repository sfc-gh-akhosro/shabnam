// The styles tab: a rows table, not an editor (§4). A row is
// selector · property · value, which is all a style rule has ever been, with a
// delete on the left and an add on the right.
//
// The markup is `research-lab/stylist/index.html` verbatim — `.rows`, `header`,
// `.row`, `.btn`, `.sel`, `.prop`, `.val`, and the two datalists `#sl` and
// `#pl`. That prototype is styled by ten lines of CSS, and it is the only
// reason this tab is cheap to restyle.
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

import { createEffect, createSignal, Index } from "solid-js";
import * as T from "../types.ts";
import { REFUSED, type Stylist } from "./stylist.ts";

type Field = "selector" | "property" | "value";

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
// that is how a row this tab has invented says it is not in the book yet.
const BLANK: T.StyleRow = { selector: "", property: "", value: "", id: REFUSED, source: T.SOURCE.user };

type RowsProps = {
  stylist: Stylist;
  /** Bumped by every redraw, so rules the DOT brought in show up here. */
  stamp: number;
};

export function Rows(props: RowsProps) {
  const [rows, setRows] = createSignal<T.StyleRow[]>([]);

  createEffect(() => {
    void props.stamp;
    setRows(props.stylist.rows());
  });

  const write = (at: number, field: Field, value: string) => {
    const before = rows()[at]!;
    const after = { ...before, [field]: value, source: T.SOURCE.user };
    setRows(rows().map((row, i) => (i === at ? after : row)));
    // Only a changed key removes the old entry. Rewriting the value in place is
    // what keeps the row's id, and the id is the whole reason it exists.
    const rekeyed = before.selector !== after.selector || before.property !== after.property;
    if (rekeyed && keyed(before)) props.stylist.removeRule(before.selector, before.property);
    if (keyed(after)) props.stylist.addRule(after.selector, after.property, after.value, T.SOURCE.user);
  };

  const insert = (at: number) => setRows([...rows().slice(0, at + 1), BLANK, ...rows().slice(at + 1)]);

  const drop = (at: number) => {
    const row = rows()[at]!;
    if (keyed(row)) props.stylist.removeRule(row.selector, row.property);
    setRows(rows().filter((_, i) => i !== at));
  };

  const clean = () => {
    props.stylist.cleanup();
    setRows(props.stylist.rows());
  };

  return (
    <div class="rows">
      <header>
        <b>Stylist</b>
        <div>
          <button onClick={() => insert(rows().length - 1)}>+ Row</button>
          <button onClick={clean}>Cleanup</button>
          <button onClick={() => props.stylist.save()}>Save</button>
        </div>
      </header>

      <datalist id="sl">
        <Index each={selectors(rows())}>{(name) => <option value={name()} />}</Index>
      </datalist>
      <datalist id="pl">
        <Index each={[...PROPERTY.keys()]}>{(name) => <option value={name()} />}</Index>
      </datalist>

      <Index each={rows()}>
        {(row, at) => (
          // Each box carries its own `title`: the pane is narrow, so a long
          // selector or value is read by hovering rather than by clicking in.
          <div
            class="row"
            id={row().id === REFUSED ? undefined : String(row().id)}
            data-source={row().source}
          >
            <button class="btn" title="remove this row" onClick={() => drop(at)}>❌</button>
            <input
              class="sel"
              list="sl"
              placeholder="selector"
              title={row().selector}
              value={row().selector}
              onChange={(event) => write(at, "selector", event.currentTarget.value)}
            />
            <input
              class="prop"
              list="pl"
              placeholder="property"
              title={row().property}
              value={row().property}
              onChange={(event) => write(at, "property", event.currentTarget.value)}
            />
            <input
              class="val"
              type={swatched(row()) ? "color" : "text"}
              placeholder="value"
              title={row().value}
              value={row().value === "" && swatched(row()) ? "#000000" : row().value}
              onInput={(event) => write(at, "value", event.currentTarget.value)}
            />
            <button class="btn" title="insert a row below" onClick={() => insert(at)}>➕</button>
          </div>
        )}
      </Index>
    </div>
  );
}

// A row reaches the book only when all three boxes say something. An empty value
// is not a rule: `@apply` with nothing after it throws at feed time, and for
// every other property `setProperty(…, "")` paints nothing anyway. It also gives
// clearing the value box its natural meaning — the rule is removed.
function keyed(row: T.StyleRow): boolean {
  return row.selector !== "" && row.property !== "" && row.value !== "";
}

function swatched(row: T.StyleRow): boolean {
  return PROPERTY.get(row.property) === "color" && (row.value === "" || HEX.test(row.value));
}

function selectors(rows: T.StyleRow[]): string[] {
  return [...new Set(rows.map((row) => row.selector))].filter((name) => name !== "");
}
