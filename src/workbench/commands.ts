// The verbs, and the chords that ask for them. One `Map` from command to
// action, shared by the toolbar and the keyboard, so a verb is an entry and
// nobody touches a switch.
//
// A chord is `Cmd` on macOS and `Ctrl` elsewhere — the same intent, so both
// read as one modifier and neither appears in the key. A key without it is
// typing, not a chord.

import { download, exportHtml, exportPicture } from "../diagram/files.ts";
import { asProject } from "../style/book.ts";
import type * as T from "../types.ts";
import type { Workbench } from "./workbench.ts";

export function commands(bench: Workbench): Map<T.Command, () => void> {
  return new Map<T.Command, () => void>([
    ["draw", () => bench.draw()],
    ["open", () => bench.projectPicker.click()],
    ["save", () => {
      const project = asProject(bench.diagram.dot.value, bench.diagram.styleBook.styles());
      download("diagram.shabnam.json", JSON.stringify(project, null, 2), "application/json");
    }],
    ["load-dot", () => bench.dotPicker.click()],
    ["export-picture", async () => {
      const options = await bench.exportDialog.ask();
      if (options === undefined) return;
      const picture = await exportPicture(options);
      download(`diagram.${options.format}`, picture, picture.type);
    }],
    ["export-html", async () => download("diagram.html", await exportHtml(bench.diagram, bench.skeleton), "text/html")],
  ]);
}

/** Key → action. The browser-claimed ones (`p`, `s`, `o`, `l`) are `preventDefault`ed
 *  by the listener, which is why `Cmd+P` exports rather than prints. */
export function chords(verbs: Map<T.Command, () => void>, tabs: T.TabId[], tab: T.Topic<T.TabId>): Map<string, () => void> {
  return new Map<string, () => void>([
    ["enter", verbs.get("draw")!],
    ["o", verbs.get("open")!],
    ["s", verbs.get("save")!],
    ["l", verbs.get("load-dot")!],
    ["p", verbs.get("export-picture")!],
    ["e", verbs.get("export-html")!],
    ...tabs.map((id, i): [string, () => void] => [String(i + 1), () => tab.pub(id)]),
  ]);
}
