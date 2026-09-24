// SolidJS shell: canvas skeleton, the radio strip, and one textarea for the
// three text tabs. The styles tab is not text — it is a rows view onto the
// `Stylist`, so it renders `Rows` instead of the textarea.
//
// The textarea is the whole coding window: no highlighting, no completion, no
// caret of ours. Only the ids the engine's sinks and the export need survive
// here; everything the CSS wants, it reaches by element and position.
//
// The shell is `main` (toolbar + diagram) beside `aside` (the tabs), both direct
// children of `body`, so neither needs a hook of its own. The ids that remain are
// the sinks the engine writes and the one positioned ancestor the coordinate
// contract names (§3.4) — and every one of them is two hyphenated words, because
// a bare word is a name a DOT node can also have (§3.1).
//
// Every action lives in that one toolbar, including Save Styles — the styles tab
// is a list of rows and carries no toolbar of its own.

import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { Rows } from "../stylist/rows.tsx";
import { documentEntries, Stylist } from "../stylist/stylist.ts";
import type { StyleDocument, StyleFile, TabId, TabText } from "../types.ts";
import { Engine } from "./engine.ts";
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

function seeded(): { text: TabText; styles: StyleFile | StyleDocument } {
  const seed = document.getElementById("app-seed");
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
  const [stamp, setStamp] = createSignal(0);
  const stylist = new Stylist();
  const engine = new Engine(text, stylist);
  const files = new Files(text, (tab, value) => setText(tab, value), stylist);
  let dotPicker!: HTMLInputElement;

  // The stamp tells the styles tab that the book has taken the DOT's rules.
  const redraw = async () => {
    await engine.redraw();
    setStamp(stamp() + 1);
  };

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
    "export-html": async () => download("diagram.html", await files.exportHtml(), "text/html"),
    "tab-1": () => setActive(TAB_IDS[0]!),
    "tab-2": () => setActive(TAB_IDS[1]!),
    "tab-3": () => setActive(TAB_IDS[2]!),
    "tab-4": () => setActive(TAB_IDS[3]!),
  };

  onMount(() => {
    favicon();
    // The theme is the floor of the book; a saved document or an export seed
    // then lays its own entries over it, each at the source it was saved with.
    stylist.reset();
    stylist.absorb(documentEntries(seed.styles));
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
    <>
      <main>
        <nav>
          <img src={LOGO_URI} alt="" />
          <b>Shabnam</b>
          <button title="Cmd/Ctrl+Enter" onClick={redraw}> Redraw Diagram </button>
          <button title="Cmd/Ctrl+O" onClick={commands["load-dot"]}>Load DOT</button>
          <button title="Cmd/Ctrl+S" onClick={commands["save-dot"]}>Save DOT</button>
          <button title="Cmd/Ctrl+P" onClick={commands["save-png"]}>Save PNG</button>
          <button title="Cmd/Ctrl+E" onClick={commands["export-html"]}>Export HTML</button>
          <button onClick={() => stylist.save()}>Save Styles</button>
          {/* `hidden` rather than a class: the picker is opened by `.click()`,
              never seen, and needs no CSS of its own. */}
          <input ref={dotPicker} hidden type="file" accept=".dot,.gv" onChange={(e) => loadDot(e.currentTarget)} />
        </nav>

        <article id="diagram-canvas">
          <div id="diagram-html" />
          <svg id="diagram-svg">
            <g id="cluster-shells" />
            <g id="node-shells" />
            <g id="connector-paths" />
          </svg>
          <div id="annotation-html" />
          <style id="style-css" />
          <script id="action-js" />
        </article>
      </main>

      <aside>
        <Tabs active={active()} setActive={setActive} />
        <Show when={active() === "styles"}>
          <Rows stylist={stylist} stamp={stamp()} />
        </Show>
        <Show when={textTab(active())} keyed>
          {(tab) => (
            <textarea
              value={text[tab]}
              onInput={(event) => setText(tab, event.currentTarget.value)}
            />
          )}
        </Show>
      </aside>
    </>
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
