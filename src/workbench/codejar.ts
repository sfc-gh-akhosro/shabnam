// Micro code editor engine based on CodeJar concepts.
// Lightweight, zero-dependency contenteditable editor with cursor restoration and syntax highlighting.

type HighlightFn = (code: string) => string;

type CodeJarOptions = {
  tab?: string;
  indentOn?: RegExp;
  spellcheck?: boolean;
};

export type CodeJarInstance = {
  updateCode(code: string): void;
  getCode(): string;
  onUpdate(callback: (code: string) => void): void;
  destroy(): void;
};

export function createCodeJar(
  editor: HTMLElement,
  highlight: HighlightFn,
  options: CodeJarOptions = {},
): CodeJarInstance {
  const tab = options.tab ?? "  ";
  let listeners: Array<(code: string) => void> = [];

  editor.setAttribute("contenteditable", "plaintext-only");
  editor.setAttribute("spellcheck", options.spellcheck ? "true" : "false");
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
    if (event.key === "Tab") {
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

type CursorPos = {
  start: number;
  end: number;
};

function saveCursor(editor: HTMLElement): CursorPos {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return { start: 0, end: 0 };

  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(editor);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;

  preRange.setEnd(range.endContainer, range.endOffset);
  const end = preRange.toString().length;

  return { start, end };
}

function restoreCursor(editor: HTMLElement, pos: CursorPos): void {
  const sel = window.getSelection();
  if (!sel) return;

  const range = document.createRange();
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
      for (let i = 0; i < node.childNodes.length; i++) {
        walk(node.childNodes[i]!);
      }
    }
  }

  walk(editor);

  if (startNode && endNode) {
    try {
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {
      // Graceful fallback
    }
  }
}
