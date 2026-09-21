// SolidJS shell: canvas skeleton plus the five editors.

import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import type { TabId, TabText } from "../types.ts";
import { Engine } from "./engine.ts";
import { Editor, highlightCss, highlightDot, highlightHtml, highlightJs } from "./editor.tsx";
import { BASE_THEME, BASE_THEME_NAME, download, Files, themeSheet } from "./files.ts";
import { type Command, commandOf } from "./keys.ts";
import { TAB_IDS, Tabs } from "./tabs.tsx";

import logo from "../../icon/shabnam-logo.svg";

const LOGO_URI = `data:image/svg+xml,${encodeURIComponent(logo)}`;

const STARTER_DOT = `digraph starter {
  rankdir=LR

  subgraph cluster_source {
    label = "Source"
    blobs [label="![bucket](bucket.svg) Blobs" caption="Object Store"]
  }

  core [label="![star](star.svg) Platform Core"]
  app  [label="App"]

  blobs -> core
  core -> app
}
`;

const STARTER_HTML = `<div data-anchor="core" data-offset="0,52">
  the one place DOT cannot reach
</div>
`;

const STARTER_TEXT: TabText = {
  theme: BASE_THEME,
  dot: STARTER_DOT,
  style: "",
  action: "",
  annotation: STARTER_HTML,
};

function starterText(): TabText {
  const seed = document.getElementById("shabnam-seed");
  if (seed === null) return STARTER_TEXT;
  const parsed = JSON.parse(seed.textContent!);
  return {
    theme: parsed.theme ?? BASE_THEME,
    dot: parsed.dot ?? STARTER_DOT,
    style: parsed.style ?? parsed.effects ?? "",
    action: parsed.action ?? "",
    annotation: parsed.annotation ?? STARTER_HTML,
  };
}

export function Workbench() {
  const [text, setText] = createStore<TabText>(starterText());
  const [active, setActive] = createSignal<TabId>("dot");
  const [selectedTheme, setSelectedTheme] = createSignal(BASE_THEME_NAME);
  const [themes, setThemes] = createSignal<string[]>([]);
  const engine = new Engine(text, (tab, value) => setText(tab, value));
  const files = new Files(text, (tab, value) => setText(tab, value), () => engine.discardDerived());
  let dotPicker!: HTMLInputElement;
  let themePicker!: HTMLInputElement;

  const sheet = () => themeSheet(selectedTheme(), text.theme);
  const redraw = () => engine.redraw(sheet());

  const onSelectTheme = (name: string) => {
    setSelectedTheme(name);
    setText("theme", files.loadTheme(name));
  };

  const loadDot = async (input: HTMLInputElement) => {
    files.loadDot(await input.files![0]!.text());
    input.value = "";
    redraw();
  };

  const loadTheme = async (input: HTMLInputElement) => {
    const file = input.files![0]!;
    const css = await file.text();
    const name = file.name === BASE_THEME_NAME ? "overlay.css" : file.name;
    files.saveTheme(name, css);
    setThemes(files.listThemes());
    setSelectedTheme(name);
    setText("theme", css);
    input.value = "";
  };

  const saveTheme = () => {
    if (selectedTheme() === BASE_THEME_NAME) {
      engine.inject("status", "theme/theme.css is locked — save as a new overlay");
      return;
    }
    files.saveTheme(selectedTheme(), text.theme);
  };

  const commands: Record<Command, () => void> = {
    redraw,
    "load-dot": () => dotPicker.click(),
    "save-dot": () => download("diagram.dot", files.saveDot(), "text/vnd.graphviz"),
    "load-theme": () => themePicker.click(),
    "save-theme": saveTheme,
    "save-png": async () => download("diagram.png", await files.exportPng(), "image/png"),
    "export-html": async () => download("shabnam.html", await files.exportHtml(), "text/html"),
    "tab-1": () => setActive(TAB_IDS[0]!),
    "tab-2": () => setActive(TAB_IDS[1]!),
    "tab-3": () => setActive(TAB_IDS[2]!),
    "tab-4": () => setActive(TAB_IDS[3]!),
    "tab-5": () => setActive(TAB_IDS[4]!),
  };

  onMount(() => {
    setThemes(files.listThemes());
    favicon();
    redraw();
    const onKey = (event: KeyboardEvent) => {
      const command = commandOf(event);
      if (command === undefined) return;
      event.preventDefault();
      commands[command]();
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  return (
    <div id="shabnam-workbench">
      <header id="shabnam-toolbar">
        <h1 id="shabnam-brand">
          <img id="shabnam-brand-logo" src={LOGO_URI} alt="" />
          Shabnam
        </h1>
        <button id="shabnam-redraw" title="Cmd/Ctrl+Enter" onClick={redraw}>
          Redraw
        </button>
        <button title="Cmd/Ctrl+O" onClick={commands["load-dot"]}>
          Load DOT
        </button>
        <button title="Cmd/Ctrl+S" onClick={commands["save-dot"]}>
          Save DOT
        </button>
        <button title="Shift+Cmd/Ctrl+O" onClick={commands["load-theme"]}>
          Load Theme
        </button>
        <button title="Shift+Cmd/Ctrl+S" onClick={commands["save-theme"]}>
          Save Theme
        </button>
        <button title="Cmd/Ctrl+P" onClick={commands["save-png"]}>
          Save PNG
        </button>
        <button title="Cmd/Ctrl+E" onClick={commands["export-html"]}>
          Export HTML
        </button>
        <input ref={dotPicker} class="hidden" type="file" accept=".dot,.gv" onChange={(e) => loadDot(e.currentTarget)} />
        <input ref={themePicker} class="hidden" type="file" accept=".css,text/css" onChange={(e) => loadTheme(e.currentTarget)} />
        <span id="shabnam-status" />
      </header>

      <div id="shabnam-canvas">
        <div id="shabnam-main-html" />
        <svg id="shabnam-main-svg">
          <g id="shabnam-clusters" />
          <g id="shabnam-node-shells" />
          <g id="shabnam-connectors" />
        </svg>
        <div id="shabnam-annotation-html" />
        <style id="shabnam-theme-css" />
        <style id="shabnam-style-css" />
        <script id="shabnam-action-js" />
      </div>

      <div id="shabnam-editors">
        <Tabs active={active()} setActive={setActive} />
        <div class="theme-bar" classList={{ hidden: active() !== "theme" }}>
          <label for="theme-picker">Theme:</label>
          <select
            id="theme-picker"
            class="theme-select"
            value={selectedTheme()}
            onChange={(e) => onSelectTheme(e.currentTarget.value)}
          >
            <For each={themes()}>{(name) => <option value={name}>{name}</option>}</For>
          </select>
        </div>
        <Show when={active()} keyed>
          {(tab) => (
            <Editor
              tab={tab}
              value={text[tab]}
              onInput={(v) => setText(tab, v)}
              highlight={highlightOf(tab)}
              readOnly={tab === "theme" && selectedTheme() === BASE_THEME_NAME}
            />
          )}
        </Show>
      </div>
    </div>
  );
}

function highlightOf(tab: TabId) {
  if (tab === "dot") return highlightDot;
  if (tab === "annotation") return highlightHtml;
  if (tab === "action") return highlightJs;
  return highlightCss;
}

function favicon(): void {
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = LOGO_URI;
  document.head.append(link);
}
