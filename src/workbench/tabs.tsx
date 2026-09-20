// The five editors: theme.css (with dropdown, read-only), diagram.dot, style.css, action.js, annotation.html

import { createEffect, createSignal, For, onCleanup, onMount } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import type { TabId, TabText } from "../types.ts";
import { type CodeJarInstance, createCodeJar } from "./codejar.ts";
import { CssHelper } from "./css-helper.tsx";
import { highlightCss, highlightDot, highlightHtml, highlightJs } from "./highlighter.ts";

import defaultTheme from "../../theme/theme.css" with { type: "text" };
import blueprintTheme from "../../theme/blueprint.css" with { type: "text" };

export const BUILTIN_THEMES: Record<string, string> = {
  "theme.css": defaultTheme,
  "blueprint.css": blueprintTheme,
};

const TAB_LABEL = new Map<TabId, string>([
  ["theme", "theme.css"],
  ["dot", "diagram.dot"],
  ["style", "style.css"],
  ["action", "action.js"],
  ["annotation", "annotation.html"],
]);

export const TAB_IDS = [...TAB_LABEL.keys()];

type TabsProps = {
  text: TabText;
  setText: SetStoreFunction<TabText>;
  active: TabId;
  setActive: (id: TabId) => void;
};

type CodeEditorProps = {
  tab: TabId;
  value: string;
  onInput?: (val: string) => void;
  readOnly?: boolean;
  highlight: (code: string) => string;
};

function CodeEditor(props: CodeEditorProps) {
  let editorRef!: HTMLDivElement;
  let jar: CodeJarInstance | null = null;

  onMount(() => {
    jar = createCodeJar(editorRef, props.highlight);
    jar.updateCode(props.value);
    if (!props.readOnly && props.onInput) {
      jar.onUpdate(props.onInput);
    }
  });

  createEffect(() => {
    if (jar && props.value !== jar.getCode()) {
      jar.updateCode(props.value);
    }
  });

  onCleanup(() => {
    if (jar) jar.destroy();
  });

  return (
    <div
      ref={editorRef}
      data-tab={props.tab}
      class="editor codejar-editor"
      contenteditable={!props.readOnly ? "plaintext-only" : "false"}
    />
  );
}

export function Tabs(props: TabsProps) {
  const [selectedTheme, setSelectedTheme] = createSignal<string>("theme.css");

  const onSelectTheme = (name: string) => {
    setSelectedTheme(name);
    if (BUILTIN_THEMES[name] !== undefined) {
      props.setText("theme", BUILTIN_THEMES[name]!);
    }
  };

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

      <div class="theme-container" classList={{ hidden: props.active !== "theme" }}>
        <div class="theme-bar">
          <label for="theme-picker">Theme:</label>
          <select
            id="theme-picker"
            class="theme-select"
            value={selectedTheme()}
            onChange={(e) => onSelectTheme(e.currentTarget.value)}
          >
            <For each={Object.keys(BUILTIN_THEMES)}>
              {(name) => <option value={name}>{name}</option>}
            </For>
          </select>
        </div>
        <CodeEditor
          tab="theme"
          value={props.text.theme}
          onInput={(val) => props.setText("theme", val)}
          highlight={highlightCss}
        />
      </div>

      <div classList={{ hidden: props.active !== "dot" }} style="height: 100%; display: flex; flex-direction: column;">
        <CodeEditor
          tab="dot"
          value={props.text.dot}
          onInput={(val) => props.setText("dot", val)}
          highlight={highlightDot}
        />
      </div>

      <div class="style-container" classList={{ hidden: props.active !== "style" }}>
        <CssHelper
          styleText={props.text.style}
          onUpdateStyle={(newStyle) => props.setText("style", newStyle)}
        />
      </div>

      <div classList={{ hidden: props.active !== "action" }} style="height: 100%; display: flex; flex-direction: column;">
        <CodeEditor
          tab="action"
          value={props.text.action}
          onInput={(val) => props.setText("action", val)}
          highlight={highlightJs}
        />
      </div>

      <div classList={{ hidden: props.active !== "annotation" }} style="height: 100%; display: flex; flex-direction: column;">
        <CodeEditor
          tab="annotation"
          value={props.text.annotation}
          onInput={(val) => props.setText("annotation", val)}
          highlight={highlightHtml}
        />
      </div>
    </div>
  );
}
