// Real CodeJar. We do not own the caret.

import { CodeJar } from "codejar";
import { createEffect, onCleanup, onMount } from "solid-js";
import type { TabId } from "../types.ts";

export { highlightDot, highlightHtml, highlightJs } from "./highlight.ts";

type EditorProps = {
  tab: TabId;
  value: string;
  highlight: (code: string) => string;
  onInput: (val: string) => void;
  readOnly?: boolean;
};

export function Editor(props: EditorProps) {
  let editorRef!: HTMLDivElement;
  let jar: ReturnType<typeof CodeJar> | null = null;

  onMount(() => {
    const paint = (el: HTMLElement) => {
      el.innerHTML = props.highlight(el.textContent ?? "");
    };
    jar = CodeJar(editorRef, paint, { tab: "  " });
    jar.updateCode(props.value);
    if (!props.readOnly) jar.onUpdate(props.onInput);
    if (props.readOnly) editorRef.contentEditable = "false";
  });

  createEffect(() => {
    if (jar && props.value !== jar.toString()) jar.updateCode(props.value);
  });

  onCleanup(() => jar?.destroy());

  return (
    <div class="editor-wrap">
      <div ref={editorRef} data-tab={props.tab} class="editor codejar-editor" />
    </div>
  );
}
