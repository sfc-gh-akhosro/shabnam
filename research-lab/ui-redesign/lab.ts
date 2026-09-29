// Every piece on one page, fake data, no Diagram yet. The wiring here is a
// sketch of workbench/: topics for the facts, COMMANDS for the verbs.

import { probe } from "./probe.ts";
import type { Command, Note, Source, Style, TabId } from "./types.ts";
import { Checks } from "./ui/checks.ts";
import { DialogAsk } from "./ui/dialog-ask.ts";
import { Radios } from "./ui/radios.ts";
import { RowList } from "./ui/row-list.ts";
import { Topic } from "../../src/ui/topic.ts";
import type * as UI from "./ui/types.ts";
import type { RowAt, RowEdit, RowKind } from "./ui/types.ts";

const $ = <E extends HTMLElement>(selector: string) => document.querySelector<E>(selector)!;

// --- the facts -------------------------------------------------------------

type SourceName = "theme" | "dot" | "user";
type Format = "svg" | "png";
const SOURCE = new Map<SourceName, Source>([["theme", 0], ["dot", 1], ["user", 2]]);

const diagram = {
  dot: new Topic("digraph {\n  bq -> catalog\n  catalog -> lake\n}\n"),
  notes: new Topic<Note[]>([
    { selector: "#bq", dx: "2em", dy: "-1em", class: "", text: "the **source**" },
    { selector: ".cluster_x", dx: "0", dy: "0", class: "warn", text: "" },
  ]),
  script: new Topic("// runs last\n"),
  changed: new Topic(0),
};
const view = {
  tab: new Topic<TabId>("dot"),
  pinned: new Topic(new Set(["pinned"])),
  shown: new Topic(true),
};
const styleTab = { sources: new Topic(new Set<SourceName>(SOURCE.keys())) };
const exportForm = { format: new Topic<Format>("svg"), transparent: new Topic(new Set(["transparent"])) };

let styles: Style[] = [
  { selector: ".paper", property: "background-color", value: "var(--paper-background)", source: 0 },
  { selector: ".node", property: "@apply", value: ".paper", source: 0 },
  { selector: "#bq", property: "background-color", value: "coral", source: 1 },
  { selector: ".node", property: "font-size", value: "14px", source: 2 },
  { selector: ".node", property: "border-radius", value: "wobbly", source: 2 },
];

// --- the pieces ------------------------------------------------------------

const TABS = new Map<TabId, string>([["dot", "DOT"], ["styles", "styles"], ["notes", "notes"], ["script", "JS"]]);
new Radios($("aside > .radios"), "tab", TABS, view.tab);
new Checks($(".checks.pin"), "pin", new Map([["pinned", ""]]), view.pinned);
new Checks($("[data-tab=styles] > .checks"), "source", new Map([...SOURCE.keys()].map((k) => [k, k])), styleTab.sources);

const STYLE_ROW: RowKind<Style> = {
  columns: [
    { field: "selector", attrs: { placeholder: "selector" } },
    { field: "property", attrs: { placeholder: "property" } },
    { field: "value", attrs: { placeholder: "value" } },
  ],
  attrs: (s) => ({ "data-source": String(s.source), "data-selector": s.selector, "data-property": s.property }),
};
const NOTE_ROW: RowKind<Note> = {
  columns: [
    { field: "selector", attrs: { placeholder: "selector" } },
    { field: "class", attrs: { placeholder: "class" } },
    { field: "dx", attrs: { placeholder: "dx" } },
    { field: "dy", attrs: { placeholder: "dy" } },
    { field: "text", attrs: { placeholder: "markdown" } },
  ],
  attrs: () => ({}),
};
const styleList = new RowList($("[data-tab=styles] > .rows"), STYLE_ROW);
const noteList = new RowList($(".rows.notes"), NOTE_ROW);

const exportDialog = new DialogAsk($<HTMLDialogElement>("dialog"), (form) => ({
  format: exportForm.format.value,
  transparent: exportForm.transparent.value.has("transparent"),
  scale: (form.elements.namedItem("scale") as HTMLInputElement).valueAsNumber,
}));
new Radios($("dialog .radios"), "format", new Map<Format, string>([["svg", "SVG"], ["png", "PNG"]]), exportForm.format);
new Checks($("dialog .checks"), "transparent", new Map([["transparent", "transparent"]]), exportForm.transparent);

// --- the bindings ----------------------------------------------------------

view.tab.sub((tab) => {
  for (const section of document.querySelectorAll<HTMLElement>("aside > section")) section.hidden = section.dataset.tab !== tab;
});
view.shown.sub((shown) => ($("aside").hidden = !shown));
$("#diagram-canvas").addEventListener("click", () => view.pinned.value.size || view.shown.pub(false));
$("#hover-zone").addEventListener("mouseenter", () => view.shown.pub(true));

bindText($("[data-tab=dot] > textarea"), diagram.dot);
bindText($("[data-tab=script] > textarea"), diagram.script);

function bindText(area: HTMLTextAreaElement, topic: Topic<string>): void {
  area.value = topic.value;
  area.addEventListener("input", () => topic.pub(area.value));
}

exportForm.format.sub((format) => (($("dialog [name=scale]") as HTMLInputElement).disabled = format === "svg"));
($("dialog [name=scale]") as HTMLInputElement).disabled = true;

// The style tab: filtered view of the book, blank row on top (column-reverse,
// so last). `add` stands in for styleBook.add until Session 3.
const BLANK: Style = { selector: "", property: "", value: "", source: 2 };
const add = (s: Style) => s.property === "@apply" || CSS.supports(s.property, s.value);
let shownStyles: Style[] = [];

function renderStyles(): void {
  shownStyles = [...styles.filter((s) => styleTab.sources.value.has(nameOf(s.source))), BLANK];
  styleList.render(shownStyles);
  shownStyles.forEach((s, i) => s !== BLANK && styleList.mark(i, !add(s)));
}
const nameOf = (source: Source) => [...SOURCE].find(([, s]) => s === source)![0];

styleTab.sources.sub(renderStyles);
diagram.changed.sub(renderStyles);
styleList.el.addEventListener("row-edit", (event) => {
  const { index, row } = (event as CustomEvent<RowEdit<Style>>).detail;
  const was = shownStyles[index]!;
  const now = { ...row, source: 2 as Source };
  styles = was === BLANK ? [...styles, now] : styles.map((s) => (s === was ? now : s));
  diagram.changed.pub(diagram.changed.value + 1);
});
styleList.el.addEventListener("row-drop", (event) => {
  const was = shownStyles[(event as CustomEvent<RowAt>).detail.index]!;
  styles = styles.filter((s) => s !== was);
  diagram.changed.pub(diagram.changed.value + 1);
});

// The note tab: edits publish diagram.notes; the tab re-renders from it.
diagram.notes.sub((notes) => noteList.render(notes));
noteList.el.addEventListener("row-edit", (event) => {
  const { index, row } = (event as CustomEvent<RowEdit<Note>>).detail;
  diagram.notes.pub(diagram.notes.value.map((n, i) => (i === index ? row : n)));
});
noteList.el.addEventListener("row-add", (event) => {
  const notes = [...diagram.notes.value];
  notes.splice((event as CustomEvent<RowAt>).detail.index + 1, 0, { selector: "", dx: "0", dy: "0", class: "", text: "" });
  diagram.notes.pub(notes);
});
noteList.el.addEventListener("row-drop", (event) => {
  const index = (event as CustomEvent<RowAt>).detail.index;
  diagram.notes.pub(diagram.notes.value.filter((_, i) => i !== index));
});

// --- the verbs -------------------------------------------------------------

const log = $("#probe-log");
const say = (line: string) => log.append(`verb   ${line}\n`);
const COMMANDS = new Map<Command, () => void>([
  ["draw", () => say(`draw reads dot (${diagram.dot.value.length} chars)`)],
  ["open", () => say("open")],
  ["save", () => say("save")],
  ["export-picture", async () => say(`export answered ${JSON.stringify(await exportDialog.ask())}`)],
  ["export-html", () => say("export-html")],
  ["save-styles", () => say("save-styles")],
]);
const CHORDS = new Map<string, () => void>([
  ["Enter", COMMANDS.get("draw")!], ["o", COMMANDS.get("open")!], ["s", COMMANDS.get("save")!],
  ["p", COMMANDS.get("export-picture")!], ["e", COMMANDS.get("export-html")!],
  ...[...TABS.keys()].map((tab, i): [string, () => void] => [String(i + 1), () => view.tab.pub(tab)]),
]);

$("main > nav").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-command]");
  if (button) COMMANDS.get(button.dataset.command as Command)!();
});
document.addEventListener("keydown", (event) => {
  const chord = (event.metaKey || event.ctrlKey) && CHORDS.get(event.key);
  if (!chord) return;
  event.preventDefault();
  chord();
});

// --- go --------------------------------------------------------------------

probe(log, { ...prefix("diagram", diagram), ...prefix("view", view), ...prefix("styleTab", styleTab), ...prefix("export", exportForm) },
  ["change", "click", "close", "row-edit", "row-add", "row-drop"]);

function prefix(name: string, topics: Record<string, UI.Topic<unknown>>): Record<string, UI.Topic<unknown>> {
  return Object.fromEntries(Object.entries(topics).map(([key, topic]) => [`${name}.${key}`, topic]));
}

renderStyles();
noteList.render(diagram.notes.value);
