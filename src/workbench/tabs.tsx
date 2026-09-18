// The five editors. One <textarea> per tab, one active tab at a time.
// Base CSS is editable like the rest (§4): a Redraw rewrites it, but it moves
// whatever you typed into My Style on the way, so the field never eats an edit.

import { For } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import type { TabId, TabText } from "../types.ts";

const TAB_LABEL = new Map<TabId, string>([
  ["dot", "DOT"],
  ["base-css", "Base CSS"],
  ["my-style", "My Style"],
  ["html", "HTML"],
  ["js", "JS"],
]);

export const TAB_IDS = [...TAB_LABEL.keys()];

type TabsProps = {
  text: TabText;
  setText: SetStoreFunction<TabText>;
  active: TabId;
  setActive: (id: TabId) => void;
};

export function Tabs(props: TabsProps) {
  return (
    <div id="shabnam-editors">
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

      <For each={TAB_IDS}>
        {(id) => (
          <textarea
            class="editor"
            classList={{ hidden: props.active !== id }}
            spellcheck={false}
            value={props.text[id]}
            onInput={(event) => props.setText(id, event.currentTarget.value)}
          />
        )}
      </For>
    </div>
  );
}
