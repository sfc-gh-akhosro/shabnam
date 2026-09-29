// A fact two parts share without naming each other. A subscriber that throws,
// throws; nothing unmounts, so there is no unsub.

import type * as T from "../types.ts";

export class Topic<V> implements T.Topic<V> {
  #value: V;
  #subs: ((v: V) => void)[] = [];

  constructor(value: V) {
    this.#value = value;
  }

  get value(): V {
    return this.#value;
  }

  pub(v: V): void {
    this.#value = v;
    for (const fn of this.#subs) fn(v);
  }

  sub(fn: (v: V) => void): void {
    this.#subs.push(fn);
  }
}
