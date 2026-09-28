// The one markdown engine (§0, §7). A pure string-to-string worker, so it sits
// in `diagram/` beside the other workers and touches no DOM.
//
// We hand-rolled this once — an `MD` map of six regexes whose own comment called
// it "the second grammar we own", against §1. Nobody writes a markdown parser.

import MarkdownIt from "markdown-it";

import bucket from "../../icon/bucket.svg";
import burst from "../../icon/burst.svg";
import chart from "../../icon/chart.svg";
import cloud from "../../icon/cloud.svg";
import database from "../../icon/database.svg";
import python from "../../icon/python.svg";
import star from "../../icon/star.svg";

const ICONS = new Map<string, string>([
  ["bucket.svg", bucket],
  ["burst.svg", burst],
  ["chart.svg", chart],
  ["cloud.svg", cloud],
  ["database.svg", database],
  ["python.svg", python],
  ["star.svg", star],
]);

// An icon travels as a data URI, so Redraw never fetches, the PNG canvas is
// never tainted, and Export HTML stays standalone (§4.1). A name we do not
// carry is passed through — the author gets a broken image and can see why.
function iconSrc(src: string): string {
  const svg = ICONS.get(src.replace(/^(\.\/)?icon\//, ""));
  if (svg === undefined) return src;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// `xhtmlOut` because a picture export is parsed as XML (§4.1), so a void element
// closes itself everywhere we send markup.
const md = new MarkdownIt({ html: true, breaks: true, linkify: true, xhtmlOut: true });

// The library's own extension point, so the parser's output is never
// post-processed (§7). `.icon` is the class the theme and the export already know.
md.renderer.rules.image = (tokens, idx) => {
  const token = tokens[idx]!;
  const src = iconSrc(String(token.attrGet("src") ?? ""));
  const alt = md.utils.escapeHtml(token.content);

  return `<img class="icon" src="${src}" alt="${alt}" />`;
};

// markdown-it pretty-prints a newline after the break. In an inline label that
// newline is rendered whitespace, so the next line starts with a stray space.
md.renderer.rules.softbreak = () => "<br />";

// The line-break contract (§7): `\n` is a literal backslash and the letter n,
// because a single-line `<input>` can produce neither a real newline nor a
// two-space hard break. `\l` / `\r` are Graphviz's, and `\|` / `\{` / `\}` are
// the characters the record split (`node-shaper.ts`) reserved.
//
// A left-to-right walk rather than a chain of `replace`, so `\\n` stays the
// escape markdown already documents: the pair passes through, markdown-it turns
// it into one backslash, and the `n` is text.
const BREAKS = "nlr";
const LITERALS = "|{}";

function unescape(label: string): string {
  let out = "";
  for (let i = 0; i < label.length; i++) {
    const char = label[i]!;
    if (char !== "\\") {
      out += char;
      continue;
    }
    const next = label[i + 1] ?? "";
    if (BREAKS.includes(next)) out += "\n";
    else if (LITERALS.includes(next)) out += next;
    else out += char + next;
    i++;
  }
  return out;
}

// A label is a name, not a document, so there is no `<p>` around it.
export function renderLabel(label: string): string {
  return md.renderInline(unescape(label));
}
