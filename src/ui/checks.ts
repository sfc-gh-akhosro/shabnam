// Any of a few. A checked one rises and glows; CSS reads `:has(:checked)`.
// The topic holds the set that is on, so a lone check is a one-key set.

import type * as T from "../types.ts";
import { type Choices, fill } from "./choices.ts";

export class Checks<K extends string> implements T.Piece {
  constructor(readonly el: HTMLElement, name: string, choices: Choices<K>, topic: T.Topic<Set<K>>) {
    const inputs = fill(el, "checkbox", name, choices);
    const show = (on: Set<K>) => {
      for (const input of inputs) input.checked = on.has(input.value as K);
    };
    show(topic.value);
    topic.sub(show);
    el.addEventListener("change", () =>
      topic.pub(new Set(inputs.filter((input) => input.checked).map((input) => input.value as K))),
    );
  }
}
