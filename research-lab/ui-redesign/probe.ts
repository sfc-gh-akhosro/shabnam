// Prints every message as it crosses: each topic publish, and each event on
// body. Capture, because `close` and `cancel` do not bubble.

import type { Topic } from "./ui/types.ts";

export function probe(log: HTMLElement, topics: Record<string, Topic<unknown>>, events: string[]): void {
  const print = (line: string) => {
    log.append(line + "\n");
    log.scrollTop = log.scrollHeight;
  };
  for (const [name, topic] of Object.entries(topics)) topic.sub((v) => print(`topic  ${name} ← ${show(v)}`));
  for (const type of events) document.body.addEventListener(type, (event) => said(event, print), true);
}

function said(event: Event, print: (line: string) => void): void {
  const target = event.target as HTMLElement;
  if (event instanceof CustomEvent) return print(`event  ${event.type}  ${show(event.detail)}`);
  if (event.type === "click" && !target.closest("button")) return; // a label's click echoes on its input
  print(`event  ${event.type}  ${describe(target)}`);
}

function describe(el: HTMLElement): string {
  const button = el.closest("button");
  if (button) return `button[${button.dataset.command ?? button.value}]`;
  if (el instanceof HTMLInputElement) return `input[${el.type} ${el.name}=${el.type === "checkbox" ? el.checked : el.value}]`;
  if (el instanceof HTMLDialogElement) return `dialog returnValue=${JSON.stringify(el.returnValue)}`;
  return el.tagName.toLowerCase();
}

function show(v: unknown): string {
  const text = JSON.stringify(v instanceof Set ? [...v] : v);
  return text.length > 90 ? text.slice(0, 90) + "…" : text;
}
