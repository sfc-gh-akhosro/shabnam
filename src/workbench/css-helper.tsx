// Visual Rule Grid editor for style.css.
// Compact 5-element row: [ Remove (✕) ] | [ Target ] | [ Property ] | [ Value (Native Pickers) ] | [ Add (+) ]
// Zero-jump mode switching with CodeJar syntax-highlighted Raw CSS editor.

import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { type CodeJarInstance, createCodeJar } from "./codejar.ts";
import { highlightCss } from "./highlighter.ts";

type CssHelperProps = {
  styleText: string;
  onUpdateStyle: (newStyle: string) => void;
};

export type StyleRuleItem = {
  id: string;
  target: string;
  property: string;
  value: string;
};

const COMMON_PROPERTIES = [
  "@apply",
  "--connector-style",
  "--connector-type",
  "--horizontal-gap",
  "--vertical-gap",
  "--primary-color",
  "--secondary-color",
  "--accent-color",
  "background",
  "color",
  "border-color",
  "border-width",
  "border-radius",
  "box-shadow",
  "opacity",
  "transform",
  "animation",
  "font-family",
  "font-size",
  "padding",
  "margin",
];

const CONNECTOR_PRESETS = ["spline", "ortho", "line", "curved", "step"];
const GAP_PRESETS = ["2em", "1.5em", "2.5em", "3em", "1em", "0.5em"];

const APPLY_MIXINS = [
  ".glass",
  ".paper",
  ".warning",
  ".tag",
  ".annotation",
  ".button",
  ".raised",
  ".outlined",
  ".flat",
  ".pulse",
  ".float",
  ".glow",
  ".flow",
  ".lift",
];

const COLOR_PROPERTIES = new Set([
  "color",
  "background",
  "background-color",
  "border-color",
  "--primary-color",
  "--secondary-color",
  "--accent-color",
]);

const ROOT_SELECTORS = [":root"];
const STRUCTURAL_SELECTORS = [".diagram", ".column", ".col", ".row"];
const ELEMENT_SELECTORS = [
  ".node",
  ".edge",
  ".cell",
  ".record",
  ".shell",
  ".caption",
  ".badge",
  ".arrow",
  ".icon",
];
const CLUSTER_BASE_SELECTORS = [".cluster", ".cluster-box", ".cluster-label"];

let nextId = 1;
function genId(): string {
  return `rule_${nextId++}`;
}

export function parseCssToRules(css: string): StyleRuleItem[] {
  const rules: StyleRuleItem[] = [];
  if (!css || !css.trim()) {
    return [{ id: genId(), target: "", property: "", value: "" }];
  }

  const blockRegex = /([^{]+)\{([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(css)) !== null) {
    const rawTarget = match[1]!.trim();
    const body = match[2]!.trim();
    if (!rawTarget || !body) continue;

    const declarations = body.split(";").map((d) => d.trim()).filter(Boolean);
    for (const decl of declarations) {
      if (decl.startsWith("@apply")) {
        const mixins = decl.replace(/^@apply\s+/, "").trim();
        rules.push({
          id: genId(),
          target: rawTarget,
          property: "@apply",
          value: mixins,
        });
      } else {
        const colonIdx = decl.indexOf(":");
        if (colonIdx > 0) {
          const prop = decl.slice(0, colonIdx).trim();
          const val = decl.slice(colonIdx + 1).trim();
          rules.push({
            id: genId(),
            target: rawTarget,
            property: prop,
            value: val,
          });
        }
      }
    }
  }

  return rules.length > 0 ? rules : [{ id: genId(), target: "", property: "", value: "" }];
}

export function serializeRulesToCss(rules: StyleRuleItem[]): string {
  const grouped = new Map<string, Array<{ property: string; value: string }>>();

  for (const rule of rules) {
    const t = rule.target.trim();
    const p = rule.property.trim();
    const v = rule.value.trim();
    if (!t || !p || !v) continue;

    const list = grouped.get(t) ?? [];
    list.push({ property: p, value: v });
    grouped.set(t, list);
  }

  const blocks: string[] = [];
  for (const [target, decls] of grouped) {
    const lines = decls.map((d) =>
      d.property === "@apply" ? `  @apply ${d.value};` : `  ${d.property}: ${d.value};`,
    );
    blocks.push(`${target} {\n${lines.join("\n")}\n}`);
  }

  return blocks.join("\n\n");
}

function toColorHex(val: string): string {
  if (/^#[0-9a-f]{6}$/i.test(val)) return val;
  if (/^#[0-9a-f]{3}$/i.test(val)) {
    const r = val[1];
    const g = val[2];
    const b = val[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return "#1565c0";
}

function RawEditor(props: { value: string; onInput: (val: string) => void }) {
  let editorRef!: HTMLDivElement;
  let jar: CodeJarInstance | null = null;

  onMount(() => {
    jar = createCodeJar(editorRef, highlightCss);
    jar.updateCode(props.value);
    jar.onUpdate(props.onInput);
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
      class="editor codejar-editor"
      style="flex: 1; height: 100%; min-height: 0; box-sizing: border-box;"
      contenteditable="plaintext-only"
    />
  );
}

export function CssHelper(props: CssHelperProps) {
  const [discoveredSelectors, setDiscoveredSelectors] = createSignal<string[]>([
    ...ROOT_SELECTORS,
    ...STRUCTURAL_SELECTORS,
    ...ELEMENT_SELECTORS,
    ...CLUSTER_BASE_SELECTORS,
  ]);

  const [rules, setRules] = createSignal<StyleRuleItem[]>([
    { id: genId(), target: "", property: "", value: "" },
  ]);
  const [isRawMode, setIsRawMode] = createSignal<boolean>(false);

  // Sync incoming styleText into parsed rules
  createEffect(() => {
    const parsed = parseCssToRules(props.styleText);
    setRules(parsed);
  });

  // Inspect the canvas to discover all classes and node IDs in the current diagram
  const discoverSelectors = () => {
    const discovered = new Set<string>([
      ...ROOT_SELECTORS,
      ...STRUCTURAL_SELECTORS,
      ...ELEMENT_SELECTORS,
      ...CLUSTER_BASE_SELECTORS,
    ]);

    const canvas = document.getElementById("shabnam-canvas");
    if (canvas) {
      const elements = canvas.querySelectorAll<HTMLElement | SVGElement>("*");
      for (const el of elements) {
        if (el.id && !el.id.startsWith("shabnam-")) {
          discovered.add(`#${el.id}`);
        }
        for (const cls of el.classList) {
          if (!cls.startsWith("shabnam-")) {
            discovered.add(`.${cls}`);
          }
        }
      }
    }

    const sorted = [...discovered].sort((a, b) => a.localeCompare(b));
    setDiscoveredSelectors(sorted);
  };

  createEffect(() => {
    discoverSelectors();
  });

  const updateAndSync = (newRules: StyleRuleItem[]) => {
    setRules(newRules);
    const css = serializeRulesToCss(newRules);
    props.onUpdateStyle(css);
  };

  const addRow = (afterIndex: number) => {
    const newRow: StyleRuleItem = {
      id: genId(),
      target: "",
      property: "",
      value: "",
    };
    const current = [...rules()];
    if (afterIndex >= 0 && afterIndex < current.length) {
      current.splice(afterIndex + 1, 0, newRow);
    } else {
      current.push(newRow);
    }
    updateAndSync(current);
  };

  const removeRow = (id: string) => {
    let updated = rules().filter((r) => r.id !== id);
    if (updated.length === 0) {
      updated = [{ id: genId(), target: "", property: "", value: "" }];
    }
    updateAndSync(updated);
  };

  const updateRow = (id: string, patch: Partial<StyleRuleItem>) => {
    const updated = rules().map((r) => {
      if (r.id !== id) return r;
      const patched = { ...r, ...patch };
      if (patch.target === ":root" && !r.property.startsWith("--")) {
        patched.property = "--connector-style";
        patched.value = "spline";
      }
      if (patch.property === "@apply" && !patched.value.startsWith(".")) {
        patched.value = ".glass";
      }
      if (patch.property && patch.property.includes("connector") && !CONNECTOR_PRESETS.includes(patched.value)) {
        patched.value = "spline";
      }
      return patched;
    });
    updateAndSync(updated);
  };

  return (
    <div class="rule-grid-container">
      {/* Native datalist for targets */}
      <datalist id="shabnam-target-options">
        <For each={discoveredSelectors()}>{(sel) => <option value={sel} />}</For>
      </datalist>

      <div class="rule-grid-header">
        <span class="rule-grid-title">Style Rules ({rules().filter((r) => r.target && r.property && r.value).length})</span>
        <div class="rule-grid-actions">
          <button
            class="helper-btn"
            style="background: #64748b; border-color: #64748b; padding: 0.15rem 0.45rem; font-size: 10px;"
            onClick={() => setIsRawMode(!isRawMode())}
            title="Toggle raw CSS editor"
          >
            {isRawMode() ? "Grid Mode" : "Raw CSS"}
          </button>
        </div>
      </div>

      <Show
        when={!isRawMode()}
        fallback={<RawEditor value={props.styleText} onInput={props.onUpdateStyle} />}
      >
        <div class="rule-grid-list">
          <For each={rules()}>
            {(rule, index) => (
              <div class="rule-row">
                {/* 1. Remove Icon */}
                <button
                  class="rule-btn-remove"
                  onClick={() => removeRow(rule.id)}
                  title="Remove this rule"
                >
                  ✕
                </button>

                {/* 2. Target (Native Input + Datalist) */}
                <input
                  type="text"
                  list="shabnam-target-options"
                  class="helper-input rule-input-target"
                  placeholder="Target..."
                  title="CSS Selector Target (:root, .node, #id)"
                  value={rule.target}
                  onFocus={discoverSelectors}
                  onInput={(e) => updateRow(rule.id, { target: e.currentTarget.value })}
                />

                {/* 3. Property */}
                <Show
                  when={COMMON_PROPERTIES.includes(rule.property) || rule.property === ""}
                  fallback={
                    <input
                      type="text"
                      class="helper-input rule-input-prop"
                      placeholder="Property..."
                      title="CSS Property"
                      value={rule.property}
                      onInput={(e) => updateRow(rule.id, { property: e.currentTarget.value })}
                    />
                  }
                >
                  <select
                    class="helper-select rule-select-prop"
                    title="CSS Property"
                    value={rule.property}
                    onChange={(e) => updateRow(rule.id, { property: e.currentTarget.value })}
                  >
                    <option value="">Property...</option>
                    <For each={COMMON_PROPERTIES}>{(prop) => <option value={prop}>{prop}</option>}</For>
                  </select>
                </Show>

                {/* 4. Value (Smart Native Pickers) */}
                <div class="rule-value-container">
                  <Show
                    when={rule.property === "@apply"}
                    fallback={
                      <Show
                        when={rule.property.includes("connector")}
                        fallback={
                          <Show
                            when={rule.property.includes("gap")}
                            fallback={
                              <Show
                                when={COLOR_PROPERTIES.has(rule.property) || rule.property.includes("color")}
                                fallback={
                                  <input
                                    type="text"
                                    class="helper-input rule-input-val"
                                    placeholder="Value..."
                                    title="Property Value"
                                    value={rule.value}
                                    onInput={(e) => updateRow(rule.id, { value: e.currentTarget.value })}
                                  />
                                }
                              >
                                <div class="rule-color-group">
                                  <input
                                    type="color"
                                    class="rule-color-swatch"
                                    value={toColorHex(rule.value)}
                                    onInput={(e) => updateRow(rule.id, { value: e.currentTarget.value })}
                                    title="Pick Color"
                                  />
                                  <input
                                    type="text"
                                    class="helper-input rule-color-text"
                                    placeholder="Color..."
                                    title="Color value"
                                    value={rule.value}
                                    onInput={(e) => updateRow(rule.id, { value: e.currentTarget.value })}
                                  />
                                </div>
                              </Show>
                            }
                          >
                            <select
                              class="helper-select rule-select-val"
                              title="Gap Value"
                              value={rule.value}
                              onChange={(e) => updateRow(rule.id, { value: e.currentTarget.value })}
                            >
                              <option value="">Gap...</option>
                              <For each={GAP_PRESETS}>{(preset) => <option value={preset}>{preset}</option>}</For>
                            </select>
                          </Show>
                        }
                      >
                        <select
                          class="helper-select rule-select-val"
                          title="Connector Style"
                          value={rule.value}
                          onChange={(e) => updateRow(rule.id, { value: e.currentTarget.value })}
                        >
                          <option value="">Style...</option>
                          <For each={CONNECTOR_PRESETS}>{(preset) => <option value={preset}>{preset}</option>}</For>
                        </select>
                      </Show>
                    }
                  >
                    <select
                      class="helper-select rule-select-val"
                      title="@apply Mixin"
                      value={rule.value}
                      onChange={(e) => updateRow(rule.id, { value: e.currentTarget.value })}
                    >
                      <option value="">Mixin...</option>
                      <For each={APPLY_MIXINS}>{(mixin) => <option value={mixin}>{mixin}</option>}</For>
                    </select>
                  </Show>
                </div>

                {/* 5. Add Icon (+) */}
                <button
                  class="rule-btn-add"
                  onClick={() => addRow(index())}
                  title="Insert blank rule below"
                >
                  +
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
