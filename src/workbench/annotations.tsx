// The annotation tab, and the list behind it. A row *is* an annotation (§4):
// selector · dx · dy · class · text, with a delete on the left and an add on the
// right. Nothing here writes HTML, and nothing reads it back.
//
// This file holds both the list and its view for the same reason `rows.tsx`
// does: the rows are the model, so splitting the view off would put a file in
// `workbench/`'s budget and buy nothing. The mark in the sink is derived from
// the list; the list is never derived from the mark.
//
// Two differences from the styles rows, both deliberate:
//
// The list reads **top-down**, so no `column-reverse` and the waiting blank sits
// at the bottom. Reversing a positional list is more confusing than reversing a
// map — a style row's neighbours mean nothing, an annotation's order is the
// order you wrote them in.
//
// ❌ removes the entry outright rather than hiding it. The styles tab hides,
// because there the book is the truth and the list is its reflection, so the
// element has to survive until the next re-read. Here the list *is* the truth:
// dropping the entry re-renders without the row in the same turn, and there is
// no second opinion for a `gone` flag to hold.
//
// Every box commits on `change`, never on `input`: a half-typed selector must
// never reach `querySelectorAll`, which throws on one it cannot parse.

import { Index } from "solid-js";
import { renderAnnotation } from "../diagram/markdown.ts";
import type * as T from "../types.ts";

/** Minted so a row can be pointed at. Live-DOM only, like a rule's id. */
let counter = 0;

/** The one constructor, so no annotation ever exists without an id. */
export function annotation(fields: Partial<T.Annotation> = {}): T.Annotation {
  return { selector: "", dx: "", dy: "", class: "", text: "", ...fields, id: ++counter };
}

/**
 * The two marks the starter ships, and they are the two cases worth seeing: a
 * node anchor offset downwards, and the drawing's own frame used as an origin —
 * its centre, less half of itself, in the offset that was already there (§4).
 */
export function starterAnnotations(): T.Annotation[] {
  return ready([
    annotation({ selector: "#core", dy: "4em", text: "the one place DOT cannot reach" }),
    annotation({
      selector: "#annotation-html",
      dx: "calc(-50% + 1em)",
      dy: "calc(-50% + 1em)",
      text: "from the origin",
    }),
  ]);
}

/** A saved list, re-minted: an id means nothing on the page that loads it. */
export function loadAnnotations(saved: unknown): T.Annotation[] {
  return ready((saved as Partial<T.Annotation>[]).map((one) => annotation(one)));
}

/**
 * A row reaches the sink only when **selector and text both say something**.
 *
 * The same gate a style row gets, and for a sharper reason: `querySelectorAll("")`
 * throws `SyntaxError`, so a half-filled row would take the app down on the next
 * `place()`. A mark with no text is invisible anyway.
 */
function placed(one: T.Annotation): boolean {
  return one.selector !== "" && one.text !== "";
}

/** The list always ends with an untouched blank, so a mark is added by typing.
 *  Seeding goes through it too — the blank is how the tab invites the first row,
 *  and a list that only grew one after its first edit would not. */
function ready(list: T.Annotation[]): T.Annotation[] {
  const last = list[list.length - 1];
  if (last !== undefined && !placed(last)) return list;
  return [...list, annotation()];
}

/** The list → `#annotation-html`. The one direction there is. */
export function annotationHtml(list: T.Annotation[]): string {
  return list.filter(placed).map(mark).join("\n");
}

// `--dx` / `--dy` are omitted when blank, so the theme's `var(--dx, 0px)` default
// applies rather than an empty declaration CSS would drop anyway. A `div`, not a
// `span`: `position: absolute` makes display moot and the theme already says div.
function mark(one: T.Annotation): string {
  const offset = [["--dx", one.dx], ["--dy", one.dy]]
    .filter(([, value]) => value !== "")
    .map(([name, value]) => `${name}: ${value}`)
    .join("; ");
  return (
    `<div data-selector="${attr(one.selector)}"` +
    (one.class === "" ? "" : ` class="${attr(one.class)}"`) +
    (offset === "" ? "" : ` style="${attr(offset)}"`) +
    `>${renderAnnotation(one.text)}</div>`
  );
}

// How text enters an attribute, not a guard: a selector holds quotes as a matter
// of course — `[data-kind="x"]` — and `&` is an entity opener wherever it lands.
function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

type Field = "selector" | "dx" | "dy" | "class" | "text";

/**
 * The boxes of the row's **first** line, in order. The text box is not here: it
 * is the second line, so it has to come after the ➕ in the markup for the wrap
 * to land between them. The hook is also the width (`app.css`).
 */
const FIELD: Array<[field: Field, hook: string, placeholder: string]> = [
  ["selector", "sel", "selector"],
  ["dx", "dx", "dx"],
  ["dy", "dy", "dy"],
  ["class", "cls", "class"],
];

type AnnotationsProps = {
  list: T.Annotation[];
  /** Replaces the list. The store is the model, so this is the only writer. */
  setList: (list: T.Annotation[]) => void;
  /** Re-derive the sink and re-anchor. The short path — no redraw (§5). */
  annotate: () => void;
};

export function Annotations(props: AnnotationsProps) {
  // `ready` on the way out of every edit: filling the waiting blank is what puts
  // the next one there, so the end of the list is never occupied for long.
  const commit = (list: T.Annotation[]) => {
    props.setList(ready(list));
    props.annotate();
  };

  const write = (at: number, field: Field, value: string) =>
    commit(props.list.map((one, i) => (i === at ? { ...one, [field]: value } : one)));

  const insert = (at: number) =>
    commit([...props.list.slice(0, at + 1), annotation(), ...props.list.slice(at + 1)]);

  const drop = (at: number) => commit(props.list.filter((_, i) => i !== at));

  const field = (one: T.Annotation, at: number, name: Field, hook: string, placeholder: string) => (
    // Each box carries its own `title`: the pane is narrow, so a long selector or
    // offset is read by hovering rather than by clicking in.
    <input
      class={hook}
      placeholder={placeholder}
      title={one[name]}
      value={one[name]}
      onChange={(event) => write(at, name, event.currentTarget.value)}
    />
  );

  return (
    <section>
      <div class="annotations">
        <Index each={props.list}>
          {(one, at) => (
            // Two lines, from one flex row that wraps: the text box is the whole
            // width, so everything before it is line one and it is line two.
            <div class="row" id={`annotation-${one().id}`}>
              <button title="remove this annotation" onClick={() => drop(at)}>❌</button>
              <Index each={FIELD}>
                {(box) => field(one(), at, box()[0], box()[1], box()[2])}
              </Index>
              <button title="insert an annotation below" onClick={() => insert(at)}>➕</button>
              {field(one(), at, "text", "text", "markdown — \\n breaks a line")}
            </div>
          )}
        </Index>
      </div>
    </section>
  );
}
