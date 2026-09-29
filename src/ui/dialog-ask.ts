// A native `<dialog>` you await. Its `<form method="dialog">` closes it with
// the pressed button's value; "ok" answers with what `read` makes of the form,
// anything else (Cancel, Escape) is undefined. The browser owns focus,
// backdrop and Escape.

import type * as T from "../types.ts";

export class DialogAsk<A> implements T.DialogAsk<A> {
  constructor(readonly el: HTMLDialogElement, private readonly read: (form: HTMLFormElement) => A) {}

  ask(): Promise<A | undefined> {
    this.el.returnValue = "";
    this.el.showModal();
    return new Promise((answer) =>
      this.el.addEventListener(
        "close",
        () => answer(this.el.returnValue === "ok" ? this.read(this.el.querySelector("form")!) : undefined),
        { once: true },
      ),
    );
  }
}
