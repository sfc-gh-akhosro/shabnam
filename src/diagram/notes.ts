// The notes → `#annotation-html`. The one direction there is: the mark is
// derived from the list, and the list is never derived from the mark.

import { renderAnnotation } from "../paint/markdown.ts";
import type * as T from "../types.ts";

/**
 * A row reaches the sink only when **selector and text both say something**.
 *
 * The same gate a style row gets, and for a sharper reason: `querySelectorAll("")`
 * throws `SyntaxError`, so a half-filled row would take the app down on the next
 * `place()`. A mark with no text is invisible anyway.
 */
export function placed(one: T.Annotation): boolean {
  return one.selector !== "" && one.text !== "";
}

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
