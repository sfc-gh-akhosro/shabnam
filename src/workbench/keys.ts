// The shortcut registry (§4). A `Map` from a normalized chord to a verb name,
// in the enum-simulation style of §0 — adding a shortcut is adding an entry, and
// nobody has to touch a switch.
//
// The chord is `⇧?` + the key, lowercased. `Cmd` on macOS and `Ctrl` elsewhere
// are the same intent, so both read as one modifier and neither appears in the
// key: a chord without it is not a shortcut at all, it is typing.

/** Every verb a shortcut can ask for. The workbench owns what each one does. */
export type Command =
  | "redraw"
  | "load-dot"
  | "save-dot"
  | "save-png"
  | "export-html"
  | "tab-1"
  | "tab-2"
  | "tab-3"
  | "tab-4";

const KEY_COMMAND = new Map<string, Command>([
  ["enter", "redraw"],
  ["o", "load-dot"],
  ["s", "save-dot"],
  ["p", "save-png"],
  ["e", "export-html"],
  ["1", "tab-1"],
  ["2", "tab-2"],
  ["3", "tab-3"],
  ["4", "tab-4"],
]);

/** The verb this event asks for, or undefined if it asks for nothing. */
export function commandOf(event: KeyboardEvent): Command | undefined {
  if (!(event.metaKey || event.ctrlKey)) return undefined;
  return KEY_COMMAND.get(`${event.shiftKey ? "⇧" : ""}${event.key.toLowerCase()}`);
}
