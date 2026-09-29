// Any of a few. A checked one rises and glows; CSS reads `:has(:checked)`.
// The topic holds the set that is on.

import { fill } from "./choices.ts";
import type { Choices, Piece, Topic } from "./types.ts";

export class Checks<K extends string> implements Piece {
  constructor(readonly el: HTMLElement, name: string, choices: Choices<K>, topic: Topic<Set<K>>) {
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
