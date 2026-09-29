// A fact two parts share without naming each other. A subscriber that throws,
// throws; nothing unmounts, so there is no unsub.

import type * as UI from "./types.ts";

export class Topic<T> implements UI.Topic<T> {
  #value: T;
  #subs: ((v: T) => void)[] = [];

  constructor(value: T) {
    this.#value = value;
  }

  get value(): T {
    return this.#value;
  }

  pub(v: T): void {
    this.#value = v;
    for (const fn of this.#subs) fn(v);
  }

  sub(fn: (v: T) => void): void {
    this.#subs.push(fn);
  }
}
