// SolidJS shell: canvas skeleton, the radio strip, and one CodeJar for the
// three text tabs. The styles tab is not text — it is a rows view onto the
// `Stylist`, and `rows.tsx` fills it in the next session.

import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { Stylist } from "../stylist/stylist.ts";
import type { StyleFile, TabId, TabText } from "../types.ts";
import { Engine } from "./engine.ts";
import { Editor, highlightDot, highlightHtml, highlightJs } from "./editor.tsx";
import { download, Files } from "./files.ts";
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
  dot: STARTER_DOT,
  action: "",
  annotation: STARTER_HTML,
};

const HIGHLIGHT: Record<keyof TabText, (code: string) => string> = {
  dot: highlightDot,
  annotation: highlightHtml,
  action: highlightJs,
};

function seeded(): { text: TabText; styles: StyleFile } {
  const seed = document.getElementById("shabnam-seed");
  if (seed === null) return { text: STARTER_TEXT, styles: {} };
  const parsed = JSON.parse(seed.textContent!);
  return {
    text: {
      dot: parsed.dot ?? STARTER_DOT,
      action: parsed.action ?? "",
      annotation: parsed.annotation ?? STARTER_HTML,
    },
    styles: parsed.styles ?? {},
  };
}

export function Workbench() {
  const seed = seeded();
  const [text, setText] = createStore<TabText>(seed.text);
  const [active, setActive] = createSignal<TabId>("dot");
  const stylist = new Stylist();
  const engine = new Engine(text, stylist);
  const files = new Files(text, (tab, value) => setText(tab, value), stylist);
  let dotPicker!: HTMLInputElement;

  const redraw = () => engine.redraw();

  const loadDot = async (input: HTMLInputElement) => {
    files.loadDot(await input.files![0]!.text());
    input.value = "";
    redraw();
  };

  const commands: Record<Command, () => void> = {
    redraw,
    "load-dot": () => dotPicker.click(),
    "save-dot": () => download("diagram.dot", files.saveDot(), "text/vnd.graphviz"),
    "save-png": async () => download("diagram.png", await files.exportPng(), "image/png"),
    "export-html": async () => download("shabnam.html", await files.exportHtml(), "text/html"),
    "tab-1": () => setActive(TAB_IDS[0]!),
    "tab-2": () => setActive(TAB_IDS[1]!),
    "tab-3": () => setActive(TAB_IDS[2]!),
    "tab-4": () => setActive(TAB_IDS[3]!),
  };

  onMount(() => {
    favicon();
    for (const [selector, properties] of Object.entries(seed.styles)) {
      for (const [property, value] of Object.entries(properties)) stylist.addRule(selector, property, value);
    }
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
        <button onClick={() => stylist.save()}>Save Styles</button>
        <button title="Cmd/Ctrl+P" onClick={commands["save-png"]}>
          Save PNG
        </button>
        <button title="Cmd/Ctrl+E" onClick={commands["export-html"]}>
          Export HTML
        </button>
        <input ref={dotPicker} class="hidden" type="file" accept=".dot,.gv" onChange={(e) => loadDot(e.currentTarget)} />
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
        <style id="shabnam-style-css" />
        <script id="shabnam-action-js" />
      </div>

      <div id="shabnam-editors">
        <Tabs active={active()} setActive={setActive} />
        <Show when={textTab(active())} keyed>
          {(tab) => (
            <Editor
              tab={tab}
              value={text[tab]}
              onInput={(v) => setText(tab, v)}
              highlight={HIGHLIGHT[tab]}
            />
          )}
        </Show>
      </div>
    </div>
  );
}

function textTab(tab: TabId): keyof TabText | undefined {
  return tab === "styles" ? undefined : tab;
}

function favicon(): void {
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = LOGO_URI;
  document.head.append(link);
}
