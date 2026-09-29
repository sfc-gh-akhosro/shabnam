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
import { placed } from "../diagram/notes.ts";
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

/** The list always ends with an untouched blank, so a mark is added by typing.
 *  Seeding goes through it too — the blank is how the tab invites the first row,
 *  and a list that only grew one after its first edit would not. */
function ready(list: T.Annotation[]): T.Annotation[] {
  const last = list[list.length - 1];
  if (last !== undefined && !placed(last)) return list;
  return [...list, annotation()];
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
  /** Publishes the list. The diagram re-places its marks on that, with no draw. */
  setList: (list: T.Annotation[]) => void;
};

export function Annotations(props: AnnotationsProps) {
  // `ready` on the way out of every edit: filling the waiting blank is what puts
  // the next one there, so the end of the list is never occupied for long.
  const commit = (list: T.Annotation[]) => props.setList(ready(list));

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
