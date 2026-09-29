// SolidJS shell: canvas skeleton, the radio strip, and one textarea for the
// two text tabs. The styles and annotation tabs are not text — each is a rows
// view onto its own model, so they render `Rows` and `Annotations` instead.
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
//
// The aside gives way to the diagram: clicking the canvas takes it out of the
// DOM and a strip at main's right edge brings it back, unless Freeze is checked.

import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { createStore } from "solid-js/store";
import { asDocument, documentStyles } from "../style/book.ts";
import { StyleBook } from "../style/style-book.ts";
import type { Annotation, StyleDocument, StyleFile, TabId, TabText } from "../types.ts";
import { Annotations, loadAnnotations, starterAnnotations } from "./annotations.tsx";
import { Engine } from "./engine.ts";
import { Rows } from "./rows.tsx";
import { download, Files } from "./files.ts";
import { ExportDialog, showExportDialog } from "./export-dialog.tsx";
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

const STARTER_TEXT: TabText = {
  dot: STARTER_DOT,
  action: "",
};

function seeded(): { text: TabText; styles: StyleFile | StyleDocument; annotations: Annotation[] } {
  const seed = document.getElementById("app-seed");
  if (seed === null) return { text: STARTER_TEXT, styles: {}, annotations: starterAnnotations() };
  const parsed = JSON.parse(seed.textContent!);
  return {
    text: {
      dot: parsed.dot ?? STARTER_DOT,
      action: parsed.action ?? "",
    },
    styles: parsed.styles ?? {},
    annotations: parsed.annotations === undefined ? starterAnnotations() : loadAnnotations(parsed.annotations),
  };
}

export function Workbench() {
  const seed = seeded();
  const [text, setText] = createStore<TabText>(seed.text);
  // The list is the model (§4), and a store so the engine can read it at the
  // moment it derives the sink — the same arrangement `text` has.
  const [annotations, setAnnotations] = createStore<Annotation[]>(seed.annotations);
  const [active, setActive] = createSignal<TabId>("dot");
  const [stamp, setStamp] = createSignal(0);
  const [frozen, setFrozen] = createSignal(true);
  const [isAsideHidden, setAsideHidden] = createSignal(false);
  // Made on mount, when `#style-css` exists, and made again by Load DOT: a new
  // book seeded from the theme is the reset.
  const [styleBook, setStyleBook] = createSignal<StyleBook>();
  const engine = new Engine(text, () => styleBook()!, annotations);
  const files = new Files(text, (tab, value) => setText(tab, value), () => styleBook()!, annotations);
  let dotPicker!: HTMLInputElement;

  // The stamp tells the styles tab that the book has taken the DOT's rules.
  const redraw = async () => {
    await engine.redraw();
    setStamp(stamp() + 1);
  };

  const loadDot = async (input: HTMLInputElement) => {
    files.loadDot(await input.files![0]!.text());
    setStyleBook(new StyleBook());
    input.value = "";
    redraw();
  };

  const saveStyles = () =>
    download("style-rules.json", JSON.stringify(asDocument(styleBook()!.styles()), null, 2), "application/json");

  // The Freeze checkbox pins the aside: while it is checked, neither the click
  // on the canvas nor the hover on the strip may change it.
  const hideAside = () => frozen() || setAsideHidden(true);
  const showAside = () => frozen() || setAsideHidden(false);

  const commands: Record<Command, () => void> = {
    redraw,
    "load-dot": () => dotPicker.click(),
    "save-dot": () => download("diagram.dot", files.saveDot(), "text/vnd.graphviz"),
    "export-picture": () => showExportDialog(),
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
    const book = new StyleBook();
    for (const style of documentStyles(seed.styles)) book.add(style);
    setStyleBook(book);
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
          <ExportDialog
            onExport={async (options, type, name) =>
              download(name, await files.exportPicture(options), type)
            }
          />
          <button title="Cmd/Ctrl+E" onClick={commands["export-html"]}>Export HTML</button>
          <button onClick={saveStyles}>Save Styles</button>
          {/* `hidden` rather than a class: the picker is opened by `.click()`,
              never seen, and needs no CSS of its own. */}
          <input ref={dotPicker} hidden type="file" accept=".dot,.gv" onChange={(e) => loadDot(e.currentTarget)} />
        </nav>

        <article id="diagram-canvas" tabindex="0" onClick={hideAside}>
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

        <input
          id="freeze"
          type="checkbox"
          title="Freeze the aside"
          checked={frozen()}
          onChange={(event) => setFrozen(event.currentTarget.checked)}
        />

        {/* The strip that brings the aside back. It and the aside are the two
            arms of one boolean, so exactly one of them is ever in the DOM. */}
        <Show when={isAsideHidden()}>
          <div id="hover-zone" onMouseEnter={showAside}></div>
        </Show>
      </main>

      <Show when={!isAsideHidden()}>
        <aside>
          <Tabs active={active()} setActive={setActive} />
          <Show when={active() === "styles"}>
            <Rows styleBook={styleBook()!} stamp={stamp()} />
          </Show>
          <Show when={active() === "annotation"}>
            <Annotations
              list={annotations}
              setList={(list) => setAnnotations(list)}
              annotate={() => engine.annotate()}
            />
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
      </Show>
    </>
  );
}

function textTab(tab: TabId): keyof TabText | undefined {
  return tab === "dot" || tab === "action" ? tab : undefined;
}

function favicon(): void {
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = LOGO_URI;
  document.head.append(link);
}
