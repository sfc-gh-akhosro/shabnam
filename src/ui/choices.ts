// Radios and Checks are one strip of `label > input`, cloned from
// `#choice-template`; only the input type and what `change` publishes differ.

/** A closed set of choices, key → label, in the order shown. */
export type Choices<K extends string> = Map<K, string>;

const CHOICE = document.querySelector<HTMLTemplateElement>("#choice-template")!;

export function fill<K extends string>(
  el: HTMLElement,
  type: "radio" | "checkbox",
  name: string,
  choices: Choices<K>,
): HTMLInputElement[] {
  return [...choices].map(([key, label]) => {
    const choice = CHOICE.content.firstElementChild!.cloneNode(true) as HTMLLabelElement;
    const input = choice.querySelector("input")!;
    Object.assign(input, { type, name, value: key });
    choice.querySelector("span")!.textContent = label;
    el.append(choice);
    return input;
  });
}
