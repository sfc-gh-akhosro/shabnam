// One of a few. The chosen one sinks in; CSS reads `:has(:checked)`.

import { fill } from "./choices.ts";
import type { Choices, Piece, Topic } from "./types.ts";

export class Radios<K extends string> implements Piece {
  constructor(readonly el: HTMLElement, name: string, choices: Choices<K>, topic: Topic<K>) {
    const inputs = fill(el, "radio", name, choices);
    const show = (key: K) => {
      for (const input of inputs) input.checked = input.value === key;
    };
    show(topic.value);
    topic.sub(show);
    el.addEventListener("change", (event) => topic.pub((event.target as HTMLInputElement).value as K));
  }
}
