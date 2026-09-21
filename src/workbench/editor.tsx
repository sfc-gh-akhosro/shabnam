// One CodeJar editor for every tab. Completer is current-line, four slots.

import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { Slot, TabId } from "../types.ts";

type EditorProps = {
  tab: TabId;
  value: string;
  highlight: (code: string) => string;
  onInput: (val: string) => void;
  suggest: (tab: TabId, line: string) => Slot;
  readOnly?: boolean;
};

export function Editor(props: EditorProps) {
  let editorRef!: HTMLDivElement;
  let jar: CodeJarInstance | null = null;
  const [slot, setSlot] = createSignal<Slot | null>(null);
  const [picked, setPicked] = createSignal(0);

  const hide = () => {
    setSlot(null);
    setPicked(0);
  };

  const lineBeforeCaret = (): string => {
    const code = jar?.getCode() ?? "";
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return code.split("\n").at(-1) ?? "";
    const pre = sel.getRangeAt(0).cloneRange();
    pre.selectNodeContents(editorRef);
    pre.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
    const before = pre.toString();
    return before.split("\n").at(-1) ?? "";
  };

  const accept = (item: string) => {
    const current = slot();
    if (!current || !jar) return;
    const code = jar.getCode();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const pre = sel.getRangeAt(0).cloneRange();
    pre.selectNodeContents(editorRef);
    pre.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
    const offset = pre.toString().length;
    const prefix = current.prefix;
    const start = offset - prefix.length;
    const next = code.slice(0, start) + item + code.slice(offset);
    props.onInput(next);
    jar.updateCode(next);
    hide();
  };

  onMount(() => {
    jar = createCodeJar(editorRef, props.highlight, () => slot() !== null && (slot()!.items.length > 0));
    jar.updateCode(props.value);
    if (!props.readOnly) {
      jar.onUpdate(props.onInput);
    }

    const onKey = (event: KeyboardEvent) => {
      const open = slot();
      if (open && open.items.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setPicked((i) => Math.min(i + 1, open.items.length - 1));
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setPicked((i) => Math.max(i - 1, 0));
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const item = open.items[picked()];
          if (item) {
            event.preventDefault();
            accept(item);
            return;
          }
        }
        if (event.key === "Escape") {
          event.preventDefault();
          hide();
          return;
        }
      }
      queueMicrotask(() => {
        const line = lineBeforeCaret();
        const next = props.suggest(props.tab, line);
        setSlot(next.items.length || next.input === "color" ? next : null);
        setPicked(0);
      });
    };

    editorRef.addEventListener("keyup", onKey);
    onCleanup(() => editorRef.removeEventListener("keyup", onKey));
  });

  createEffect(() => {
    if (jar && props.value !== jar.getCode()) jar.updateCode(props.value);
  });

  onCleanup(() => {
    if (jar) jar.destroy();
  });

  return (
    <div class="editor-wrap">
      <div
        ref={editorRef}
        data-tab={props.tab}
        class="editor codejar-editor"
        contenteditable={!props.readOnly ? "plaintext-only" : "false"}
      />
      <Show when={slot()}>
        {(open) => (
          <div class="complete">
            <Show when={open().input === "color"}>
              <input
                type="color"
                onInput={(e) => accept(e.currentTarget.value)}
              />
            </Show>
            <For each={open().items}>
              {(item, i) => (
                <button
                  type="button"
                  classList={{ picked: i() === picked() }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    accept(item);
                  }}
                >
                  {item}
                </button>
              )}
            </For>
          </div>
        )}
      </Show>
    </div>
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlightJs(code: string): string {
  const JS_PATTERN =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(".*?"|'.*?'|`[\s\S]*?`)|(\b(?:const|let|var|function|return|if|else|for|while|import|export|from|async|await|new|try|catch|class|typeof)\b)|(\b(?:document|window|console|Math|JSON|Array|Object|String|Number)\b)|(\b\d+(?:\.\d+)?\b)/g;
  return paint(code, JS_PATTERN, ([, comment, str, keyword, builtin, num]) =>
    comment ? hl("hl-comment", comment)
    : str ? hl("hl-string", str)
    : keyword ? hl("hl-keyword", keyword)
    : builtin ? hl("hl-builtin", builtin)
    : num ? hl("hl-number", num)
    : "",
  );
}

export function highlightHtml(code: string): string {
  const HTML_PATTERN =
    /(<!--[\s\S]*?-->)|(<\/?[a-zA-Z0-9_-]+)|(\/?>)|([a-zA-Z0-9_-]+)(?==)|(".*?"|'.*?')/g;
  return paint(code, HTML_PATTERN, ([, comment, tag, close, attr, str]) =>
    comment ? hl("hl-comment", comment)
    : tag ? hl("hl-tag", tag)
    : close ? hl("hl-tag", close)
    : attr ? hl("hl-attr", attr)
    : str ? hl("hl-string", str)
    : "",
  );
}

export function highlightCss(code: string): string {
  const CSS_PATTERN =
    /(\/\*[\s\S]*?\*\/)|(@(?:apply|mixin|include|keyframes|media|layer|import)\b)|([^{};\n]+(?=\{))|([a-zA-Z0-9_-]+)(?=\s*:)|(".*?"|'.*?')/g;
  return paint(code, CSS_PATTERN, ([, comment, atrule, selector, property, str]) =>
    comment ? hl("hl-comment", comment)
    : atrule ? hl("hl-atrule", atrule)
    : selector ? hl("hl-selector", selector)
    : property ? hl("hl-property", property)
    : str ? hl("hl-string", str)
    : "",
  );
}

export function highlightDot(code: string): string {
  const DOT_PATTERN =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)|(".*?")|(\b(?:digraph|graph|subgraph|node|edge|strict)\b)|(\b(?:rankdir|label|shape|style|color|fillcolor|fontname|fontsize|penwidth|splines)\b)|(->|--)/gi;
  return paint(code, DOT_PATTERN, ([, comment, str, keyword, property, operator]) =>
    comment ? hl("hl-comment", comment)
    : str ? hl("hl-string", str)
    : keyword ? hl("hl-keyword", keyword)
    : property ? hl("hl-property", property)
    : operator ? hl("hl-operator", operator)
    : "",
  );
}

function hl(cls: string, text: string): string {
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

function paint(code: string, pattern: RegExp, take: (m: RegExpExecArray) => string): string {
  let last = 0;
  let out = "";
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code)) !== null) {
    out += escapeHtml(code.slice(last, match.index));
    out += take(match);
    last = pattern.lastIndex;
  }
  return out + escapeHtml(code.slice(last));
}

type HighlightFn = (code: string) => string;

type CodeJarInstance = {
  updateCode(code: string): void;
  getCode(): string;
  onUpdate(callback: (code: string) => void): void;
  destroy(): void;
};

function createCodeJar(
  editor: HTMLElement,
  highlight: HighlightFn,
  completing: () => boolean,
): CodeJarInstance {
  const tab = "  ";
  let listeners: Array<(code: string) => void> = [];
  editor.setAttribute("contenteditable", "plaintext-only");
  editor.setAttribute("spellcheck", "false");
  editor.classList.add("codejar-editor");

  const highlightEditor = () => {
    const code = editor.textContent ?? "";
    const pos = saveCursor(editor);
    editor.innerHTML = highlight(code);
    restoreCursor(editor, pos);
  };

  const onInput = () => {
    highlightEditor();
    const code = editor.textContent ?? "";
    for (const cb of listeners) cb(code);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Tab" && !completing()) {
      event.preventDefault();
      insertText(tab);
      onInput();
    }
  };

  editor.addEventListener("input", onInput);
  editor.addEventListener("keydown", onKeyDown);

  function insertText(text: string) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.setEndAfter(node);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  return {
    updateCode(code: string) {
      if (editor.textContent !== code) {
        editor.textContent = code;
        highlightEditor();
      }
    },
    getCode() {
      return editor.textContent ?? "";
    },
    onUpdate(callback: (code: string) => void) {
      listeners.push(callback);
    },
    destroy() {
      editor.removeEventListener("input", onInput);
      editor.removeEventListener("keydown", onKeyDown);
      listeners = [];
    },
  };
}

function saveCursor(editor: HTMLElement): { start: number; end: number } {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return { start: 0, end: 0 };
  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(editor);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;
  preRange.setEnd(range.endContainer, range.endOffset);
  return { start, end: preRange.toString().length };
}

function restoreCursor(editor: HTMLElement, pos: { start: number; end: number }): void {
  const sel = window.getSelection();
  if (!sel) return;
  let currentOffset = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;
  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.nodeValue?.length ?? 0;
      if (!startNode && currentOffset + len >= pos.start) {
        startNode = node;
        startOffset = pos.start - currentOffset;
      }
      if (!endNode && currentOffset + len >= pos.end) {
        endNode = node;
        endOffset = pos.end - currentOffset;
      }
      currentOffset += len;
    } else {
      for (const child of node.childNodes) walk(child);
    }
  }
  walk(editor);
  if (!startNode || !endNode) return;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  sel.removeAllRanges();
  sel.addRange(range);
}
