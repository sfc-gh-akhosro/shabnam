// Minimal 5-element style row list for style.css:
// [ Remove (✕) ] | [ Target ] | [ Property ] | [ Value ] | [ Add (+) ]

import { createEffect, createSignal, For } from "solid-js";

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
  "padding",
  "margin",
];

const BASE_TARGETS = [":root", ".diagram", ".column", ".node", ".edge", ".cluster", ".cluster-box", ".cluster-label"];

let nextId = 1;
function genId(): string {
  return `r_${nextId++}`;
}

export function parseCssToRules(css: string): StyleRuleItem[] {
  const rules: StyleRuleItem[] = [];
  if (!css || !css.trim()) return [{ id: genId(), target: "", property: "", value: "" }];

  for (const match of css.matchAll(/([^{]+)\{([^}]+)\}/g)) {
    const rawTarget = match[1]!.trim();
    const body = match[2]!.trim();
    if (!rawTarget || !body) continue;

    for (const decl of body.split(";").map((d) => d.trim()).filter(Boolean)) {
      if (decl.startsWith("@apply")) {
        rules.push({ id: genId(), target: rawTarget, property: "@apply", value: decl.replace(/^@apply\s+/, "") });
      } else {
        const colon = decl.indexOf(":");
        if (colon > 0) {
          rules.push({ id: genId(), target: rawTarget, property: decl.slice(0, colon).trim(), value: decl.slice(colon + 1).trim() });
        }
      }
    }
  }

  return rules.length ? rules : [{ id: genId(), target: "", property: "", value: "" }];
}

export function serializeRulesToCss(rules: StyleRuleItem[]): string {
  const grouped = new Map<string, Array<{ property: string; value: string }>>();
  for (const r of rules) {
    if (!r.target.trim() || !r.property.trim() || !r.value.trim()) continue;
    const list = grouped.get(r.target.trim()) ?? [];
    list.push({ property: r.property.trim(), value: r.value.trim() });
    grouped.set(r.target.trim(), list);
  }

  return [...grouped]
    .map(([target, decls]) => `${target} {\n  ${decls.map((d) => (d.property === "@apply" ? `@apply ${d.value};` : `${d.property}: ${d.value};`)).join("\n  ")}\n}`)
    .join("\n\n");
}

export function CssHelper(props: CssHelperProps) {
  const [targets, setTargets] = createSignal<string[]>(BASE_TARGETS);
  const [rules, setRules] = createSignal<StyleRuleItem[]>([{ id: genId(), target: "", property: "", value: "" }]);

  createEffect(() => setRules(parseCssToRules(props.styleText)));

  const discover = () => {
    const discovered = new Set<string>(BASE_TARGETS);
    const canvas = document.getElementById("shabnam-canvas");
    if (canvas) {
      for (const el of canvas.querySelectorAll<HTMLElement | SVGElement>("*")) {
        if (el.id && !el.id.startsWith("shabnam-")) discovered.add(`#${el.id}`);
        for (const c of el.classList) {
          if (!c.startsWith("shabnam-")) discovered.add(`.${c}`);
        }
      }
    }
    setTargets([...discovered].sort((a, b) => a.localeCompare(b)));
  };

  createEffect(() => discover());

  const sync = (next: StyleRuleItem[]) => {
    setRules(next);
    props.onUpdateStyle(serializeRulesToCss(next));
  };

  const add = (i: number) => {
    const next = [...rules()];
    next.splice(i + 1, 0, { id: genId(), target: "", property: "", value: "" });
    sync(next);
  };

  const remove = (i: number) => {
    const next = rules().filter((_, idx) => idx !== i);
    sync(next.length ? next : [{ id: genId(), target: "", property: "", value: "" }]);
  };

  const update = (i: number, key: keyof StyleRuleItem, val: string) => {
    const next = rules().map((r, idx) => (idx === i ? { ...r, [key]: val } : r));
    sync(next);
  };

  return (
    <div class="style-list">
      <datalist id="shabnam-targets">
        <For each={targets()}>{(t) => <option value={t} />}</For>
      </datalist>
      <datalist id="shabnam-props">
        <For each={COMMON_PROPERTIES}>{(p) => <option value={p} />}</For>
      </datalist>

      <For each={rules()}>
        {(rule, i) => (
          <div class="style-row">
            <button type="button" class="btn-remove" onClick={() => remove(i())} title="Remove">✕</button>
            <input type="text" list="shabnam-targets" placeholder="Target..." value={rule.target} onFocus={discover} onInput={(e) => update(i(), "target", e.currentTarget.value)} />
            <input type="text" list="shabnam-props" placeholder="Property..." value={rule.property} onInput={(e) => update(i(), "property", e.currentTarget.value)} />
            <input
              type={rule.property.includes("color") || rule.property === "background" ? "color" : "text"}
              placeholder="Value..."
              value={rule.value}
              onInput={(e) => update(i(), "value", e.currentTarget.value)}
            />
            <button type="button" class="btn-add" onClick={() => add(i())} title="Add row below">+</button>
          </div>
        )}
      </For>
    </div>
  );
}
