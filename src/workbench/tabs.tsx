// The five editors. Tab order: diagram.dot · theme.css · style.css · annotation.html · action.js

import { For } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import type { Slot, TabId, TabText } from "../types.ts";
import { BASE_THEME_NAME } from "./files.ts";
import { Editor, highlightCss, highlightDot, highlightHtml, highlightJs } from "./editor.tsx";

const TAB_LABEL = new Map<TabId, string>([
  ["dot", "diagram.dot"],
  ["theme", "theme.css"],
  ["style", "style.css"],
  ["annotation", "annotation.html"],
  ["action", "action.js"],
]);

export const TAB_IDS = [...TAB_LABEL.keys()];

type TabsProps = {
  text: TabText;
  setText: SetStoreFunction<TabText>;
  active: TabId;
  setActive: (id: TabId) => void;
  themes: string[];
  selectedTheme: string;
  onSelectTheme: (name: string) => void;
  suggest: (tab: TabId, line: string) => Slot;
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

      <div class="pane" classList={{ hidden: props.active !== "dot" }}>
        <Editor tab="dot" value={props.text.dot} onInput={(v) => props.setText("dot", v)} highlight={highlightDot} suggest={props.suggest} />
      </div>

      <div class="theme-container pane" classList={{ hidden: props.active !== "theme" }}>
        <div class="theme-bar">
          <label for="theme-picker">Theme:</label>
          <select
            id="theme-picker"
            class="theme-select"
            value={props.selectedTheme}
            onChange={(e) => props.onSelectTheme(e.currentTarget.value)}
          >
            <For each={props.themes}>{(name) => <option value={name}>{name}</option>}</For>
          </select>
        </div>
        <Editor
          tab="theme"
          value={props.text.theme}
          onInput={(v) => props.setText("theme", v)}
          highlight={highlightCss}
          suggest={props.suggest}
          readOnly={props.selectedTheme === BASE_THEME_NAME}
        />
      </div>

      <div class="pane" classList={{ hidden: props.active !== "style" }}>
        <Editor tab="style" value={props.text.style} onInput={(v) => props.setText("style", v)} highlight={highlightCss} suggest={props.suggest} />
      </div>

      <div class="pane" classList={{ hidden: props.active !== "annotation" }}>
        <Editor tab="annotation" value={props.text.annotation} onInput={(v) => props.setText("annotation", v)} highlight={highlightHtml} suggest={props.suggest} />
      </div>

      <div class="pane" classList={{ hidden: props.active !== "action" }}>
        <Editor tab="action" value={props.text.action} onInput={(v) => props.setText("action", v)} highlight={highlightJs} suggest={props.suggest} />
      </div>
    </div>
  );
}
