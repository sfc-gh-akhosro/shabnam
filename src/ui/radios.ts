// One of a few. The chosen one sinks in; CSS reads `:has(:checked)`.

import type * as T from "../types.ts";
import { type Choices, fill } from "./choices.ts";

export class Radios<K extends string> implements T.Piece {
  constructor(readonly el: HTMLElement, name: string, choices: Choices<K>, topic: T.Topic<K>) {
    const inputs = fill(el, "radio", name, choices);
    const show = (key: K) => {
      for (const input of inputs) input.checked = input.value === key;
    };
    show(topic.value);
    topic.sub(show);
    el.addEventListener("change", (event) => topic.pub((event.target as HTMLInputElement).value as K));
  }
}
