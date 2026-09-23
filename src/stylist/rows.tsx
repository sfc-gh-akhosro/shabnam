// The styles tab: a rows table, not an editor (§4). A row is
// selector · property · value, which is all a style rule has ever been.
//
// The list is a snapshot of `Stylist.rows()` — theme, then derived, then user.
// Theme and derived rows are value-editable only, and editing one writes a
// *user* row that shadows it, so after the next sync the same rule shows twice.
// That is honest: both layers really are still there.
//
// Selector and property commit on `change`; the value commits on every
// keystroke. The split is deliberate — a value is one `setProperty` and the
// picture follows the caret, while a half-typed selector must never reach
// `insertRule`.

import { createEffect, createSignal, Index, Show } from "solid-js";
import type * as T from "../types.ts";
import type { Stylist } from "./stylist.ts";

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

// `type=color` only speaks six-digit hex. A `var()` or a `color-mix()` gets the
// text box alone rather than a swatch that would show black and mean nothing.
const HEX = /^#[0-9a-f]{6}$/i;

const BLANK: T.StyleRow = { selector: "", property: "", value: "", origin: "user" };

type RowsProps = {
  stylist: Stylist;
  /** Bumped by every redraw, so a replaced derived layer shows up here. */
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
    const after = { ...before, [field]: value };
    setRows(rows().map((row, i) => (i === at ? after : row)));
    if (before.origin === "user" && keyed(before)) props.stylist.removeRule(before.selector, before.property);
    if (keyed(after)) props.stylist.addRule(after.selector, after.property, after.value);
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
    <div id="shabnam-styles">
      <header id="shabnam-styles-head">
        <button onClick={() => insert(rows().length - 1)}>+ Row</button>
        <button onClick={clean}>Cleanup</button>
        <button onClick={() => props.stylist.save()}>Save Styles</button>
      </header>

      <datalist id="shabnam-selector-list">
        <Index each={selectors(rows())}>{(name) => <option value={name()} />}</Index>
      </datalist>
      <datalist id="shabnam-property-list">
        <Index each={[...PROPERTY.keys()]}>{(name) => <option value={name()} />}</Index>
      </datalist>

      <div id="shabnam-styles-list">
        <Index each={rows()}>
          {(row, at) => (
            // Each box carries its own `title`: the pane is narrow, so a long
            // selector or value is read by hovering rather than by clicking in.
            <div class="style-row" data-origin={row().origin}>
              <input
                class="style-selector"
                list="shabnam-selector-list"
                placeholder="selector"
                title={`${row().selector} (${row().origin})`}
                readOnly={row().origin !== "user"}
                value={row().selector}
                onChange={(event) => write(at, "selector", event.currentTarget.value)}
              />
              <input
                class="style-property"
                list="shabnam-property-list"
                placeholder="property"
                title={row().property}
                readOnly={row().origin !== "user"}
                value={row().property}
                onChange={(event) => write(at, "property", event.currentTarget.value)}
              />
              <input
                class="style-value"
                placeholder="value"
                title={row().value}
                value={row().value}
                onInput={(event) => write(at, "value", event.currentTarget.value)}
              />
              <Show when={swatched(row())}>
                <input
                  class="style-swatch"
                  type="color"
                  value={row().value === "" ? "#000000" : row().value}
                  onInput={(event) => write(at, "value", event.currentTarget.value)}
                />
              </Show>
              <button class="style-insert" title="insert a row below" onClick={() => insert(at)}>
                +
              </button>
              <Show when={row().origin === "user"} fallback={<span class="style-remove" />}>
                <button class="style-remove" title="remove this row" onClick={() => drop(at)}>
                  ×
                </button>
              </Show>
            </div>
          )}
        </Index>
      </div>
    </div>
  );
}

// A row reaches the Stylist only when all three boxes say something. An empty
// value is not a rule: `@apply` with nothing after it throws at feed time, and
// for every other property `setProperty(…, "")` paints nothing anyway. It also
// gives clearing the value box its natural meaning — the rule is removed.
function keyed(row: T.StyleRow): boolean {
  return row.selector !== "" && row.property !== "" && row.value !== "";
}

function swatched(row: T.StyleRow): boolean {
  return PROPERTY.get(row.property) === "color" && (row.value === "" || HEX.test(row.value));
}

function selectors(rows: T.StyleRow[]): string[] {
  return [...new Set(rows.map((row) => row.selector))].filter((name) => name !== "");
}
