// One-shot: research-lab/stylist/basic.css -> theme/basic-theme.json, in the book's
// file shape: selector -> property -> { value, source }, every source 0.
//
// Deliberately NOT wired into `bun run build`. The runtime never parses CSS; this
// script exists so basic.css could be converted once, by hand, and the JSON it
// produced is what ships. The CSS it reads lives in `research-lab/`, because the
// runtime keeps no CSS file of its own.
//
// CSSOM does the parsing, and CSSOM only exists in a browser — so this serves a
// one-page harness, the browser reads its own stylesheet back, and posts the
// result here to be written. Two passes, in this order:
//   1. `@apply .a .b;` is not a declaration, so CSSOM would drop it. A text pass
//      rewrites it to a custom property, which CSSOM keeps verbatim and in place.
//   2. The browser walks document.styleSheets and reports each rule's selector
//      and its own `style.cssText` — CSSOM's serialization of the block. The
//      custom property is renamed back to `@apply` here.
//
// It reports cssText rather than enumerating rule.style, because enumeration
// yields longhands and a shorthand holding a var() or color-mix() leaves every
// longhand empty (`background: color-mix(...)` -> `background-color: ""`). The
// split below is over browser-normalized output, not over author CSS: one `;`
// per declaration, property before the first `:`.

import { ROOT } from "./bundle.ts";

const MARKER = "--shabnam-apply";
const PORT = 3100;

const css = await Bun.file(`${ROOT}research-lab/stylist/basic.css`).text();
const marked = css.replace(/@apply\s+([^;}]+);/g, `${MARKER}: $1;`);

const harness = `<!doctype html>
<meta charset="utf-8">
<title>decompose-theme</title>
<style id="source">${marked}</style>
<script type="module">
  const sheet = document.getElementById("source").sheet;
  const out = [];
  for (const rule of sheet.cssRules) {
    if (!(rule instanceof CSSStyleRule)) continue;
    out.push([rule.selectorText, rule.style.cssText]);
  }
  await fetch("/result", { method: "POST", body: JSON.stringify(out) });
  document.body.textContent = "done — " + out.length + " selectors";
</script>
`;

type Reported = [selector: string, cssText: string][];
type Entry = { value: string; source: 0 };

function nest(reported: Reported): Record<string, Record<string, Entry>> {
  const theme: Record<string, Record<string, Entry>> = {};
  for (const [selector, cssText] of reported) {
    const rule: Record<string, Entry> = (theme[selector] ??= {});
    for (const declaration of cssText.split(";")) {
      if (!declaration.trim()) continue;
      const colon = declaration.indexOf(":");
      const property = declaration.slice(0, colon).trim();
      rule[property === MARKER ? "@apply" : property] = {
        value: declaration.slice(colon + 1).trim(),
        source: 0,
      };
    }
  }
  return theme;
}

const server = Bun.serve({
  port: PORT,
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname !== "/result") {
      return new Response(harness, { headers: { "content-type": "text/html" } });
    }
    const theme = nest((await request.json()) as Reported);
    const path = `${ROOT}theme/basic-theme.json`;
    await Bun.write(path, `${JSON.stringify(theme, null, 2)}\n`);
    console.log(`wrote ${path} — ${Object.keys(theme).length} selectors`);
    setTimeout(() => server.stop(true), 100);
    return new Response("ok");
  },
});

console.log(`open http://localhost:${PORT}/ once`);
