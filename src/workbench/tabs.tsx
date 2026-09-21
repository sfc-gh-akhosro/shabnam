// Radio strip. Five equal buttons. No editor. Workbench owns the window.

import { For } from "solid-js";
import type { TabId } from "../types.ts";

const TAB_LABEL = new Map<TabId, string>([
  ["dot", "diagram.dot"],
  ["theme", "theme.css"],
  ["style", "style.css"],
  ["annotation", "annotation.html"],
  ["action", "action.js"],
]);

export const TAB_IDS = [...TAB_LABEL.keys()];

type TabsProps = {
  active: TabId;
  setActive: (id: TabId) => void;
};

export function Tabs(props: TabsProps) {
  return (
    <nav id="shabnam-tab-strip">
      <For each={TAB_IDS}>
        {(id) => (
          <button
            class="tab"
            classList={{ active: props.active === id }}
            onClick={() => props.setActive(id)}
          >
            {TAB_LABEL.get(id)}
          </button>
        )}
      </For>
    </nav>
  );
}
