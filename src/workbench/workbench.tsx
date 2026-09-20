// The SolidJS shell: the canvas skeleton (§1) plus the five editors (§4).
// This component is the one owner of tab text; every other worker reads and
// writes it through the accessor pair handed out here.

import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { createStore } from "solid-js/store";
import { Redrawer } from "../redrawer.ts";
import type { TabId, TabText } from "../types.ts";
import { type Command, commandOf } from "./keys.ts";
import { Sinker } from "./sinker.ts";
import { TAB_IDS, Tabs } from "./tabs.tsx";
import { download, Themer } from "./themer.ts";

import defaultTheme from "../../theme/theme.css" with { type: "text" };
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

// The anchor is the node's DOT name, because that is its id (§3.1).
const STARTER_HTML = `<div data-anchor="core" data-offset="0,52">
  the one place DOT cannot reach
</div>
`;

const STARTER_TEXT: TabText = {
  theme: defaultTheme,
  dot: STARTER_DOT,
  style: "",
  action: "",
  annotation: STARTER_HTML,
};

// An exported page carries its five texts as a seed, which is what makes the
// export open on the same picture it left with (§4).
function starterText(): TabText {
  const seed = document.getElementById("shabnam-seed");
  if (seed === null) return STARTER_TEXT;
  const parsed = JSON.parse(seed.textContent!);
  return {
    theme: parsed.theme ?? defaultTheme,
    dot: parsed.dot ?? STARTER_DOT,
    style: parsed.style ?? parsed.effects ?? "",
    action: parsed.action ?? "",
    annotation: parsed.annotation ?? STARTER_HTML,
  };
}

export function Workbench() {
  const [text, setText] = createStore<TabText>(starterText());
  const [active, setActive] = createSignal<TabId>("dot");
  const sinker = new Sinker();
  const redrawer = new Redrawer(sinker, text, (tab, value) => setText(tab, value));
  const themer = new Themer(text, (tab, value) => setText(tab, value), () =>
    redrawer.discardEdits(),
  );
  let dotPicker!: HTMLInputElement;
  let themePicker!: HTMLInputElement;

  // Sinks follow the store text. Both land on every change.
  createEffect(() => sinker.inject("theme-css", text.theme));
  createEffect(() => sinker.inject("style-css", text.style));

  const redraw = () => redrawer.redraw(text.dot);

  const loadDot = async (input: HTMLInputElement) => {
    themer.loadDot(await input.files![0]!.text());
    input.value = "";
    redraw();
  };

  const loadTheme = async (input: HTMLInputElement) => {
    themer.load(await input.files![0]!.text());
    input.value = "";
  };

  // Verb name → what it does (§0: a registry, not a switch). `keys.ts` decides
  // which chord asks for which verb; this decides what the verb is.
  const commands: Record<Command, () => void> = {
    redraw,
    "load-dot": () => dotPicker.click(),
    "save-dot": () => download("diagram.dot", themer.saveDot(), "text/vnd.graphviz"),
    "load-theme": () => themePicker.click(),
    "save-theme": () => download("style.css", themer.save(), "text/css"),
    "save-png": async () => download("diagram.png", await themer.exportPng(), "image/png"),
    "export-html": async () => download("shabnam.html", await themer.exportHtml(), "text/html"),
    "tab-1": () => setActive(TAB_IDS[0]!),
    "tab-2": () => setActive(TAB_IDS[1]!),
    "tab-3": () => setActive(TAB_IDS[2]!),
    "tab-4": () => setActive(TAB_IDS[3]!),
    "tab-5": () => setActive(TAB_IDS[4]!),
  };

  // A page that has to be clicked before it shows anything is not standalone.
  onMount(() => {
    favicon();
    redraw();

    // One listener for every shortcut. `Cmd+S` and `Cmd+P` are the browser's own
    // verbs, and ours mean the same thing one level in, so they are taken over.
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
        <input
          ref={dotPicker}
          class="hidden"
          type="file"
          accept=".dot,.gv"
          onChange={(event) => loadDot(event.currentTarget)}
        />
        <input
          ref={themePicker}
          class="hidden"
          type="file"
          accept=".css,text/css"
          onChange={(event) => loadTheme(event.currentTarget)}
        />
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

      <Tabs text={text} setText={setText} active={active()} setActive={setActive} />
    </div>
  );
}

// The same file as the toolbar mark, handed to the tab bar.
function favicon(): void {
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = LOGO_URI;
  document.head.append(link);
}
