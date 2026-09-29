// The export dialog: format, transparency, scale — then `await`ed by the verb.
// Transparent is on by default: these are architecture diagrams, and one that
// drops onto any slide is the useful one. Scale is disabled, not hidden, for
// SVG: a control you can see is inapplicable explains itself.

import { Checks } from "../ui/checks.ts";
import { DialogAsk } from "../ui/dialog-ask.ts";
import { Radios } from "../ui/radios.ts";
import { Topic } from "../ui/topic.ts";
import type * as T from "../types.ts";

const FORMATS = new Map<T.PictureFormat, string>([
  ["svg", "SVG"],
  ["png", "PNG"],
]);

export class ExportDialog extends DialogAsk<T.PictureOptions> {
  constructor(el: HTMLDialogElement) {
    const format = new Topic<T.PictureFormat>("svg");
    const transparent = new Topic(new Set(["transparent"]));
    const scale = el.querySelector<HTMLInputElement>("[name=scale]")!;
    super(el, () => ({ format: format.value, transparent: transparent.value.size > 0, scale: scale.valueAsNumber }));
    new Radios(el.querySelector(".radios")!, "format", FORMATS, format);
    new Checks(el.querySelector(".checks")!, "transparent", new Map([["transparent", "transparent"]]), transparent);
    const disable = (chosen: T.PictureFormat) => (scale.disabled = chosen === "svg");
    disable(format.value);
    format.sub(disable);
  }
}
