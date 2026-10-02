// Shapes — what a node is made of: its HTML (`SHAPES`), the SVG drawn around it
// (`SHELLS`), its glyphs (`ICONS`), and the one markdown engine its label and
// every note go through. Pure strings, no DOM; the Painter writes them.
//
// A shape, a shell or an icon is a file plus a registry entry and nothing else.

import MarkdownIt from "markdown-it";
import type * as T from "../types.ts";

import boxShell from "../../svg/box.svg";

import bucket from "../../icon/bucket.svg";
import burst from "../../icon/burst.svg";
import chart from "../../icon/chart.svg";
import cloud from "../../icon/cloud.svg";
import database from "../../icon/database.svg";
import python from "../../icon/python.svg";
import star from "../../icon/star.svg";

/** shell → the fragment drawn around a box, `{{x}}`-style holes. Unknown falls back to "box". */
export const SHELLS = new Map<string, string>([["box", boxShell]]);

/** icon file name → its markup. Keyed by file name, as `icon=` and `![](x.svg)` say it. */
export const ICONS = new Map<string, string>([
  ["bucket.svg", bucket],
  ["burst.svg", burst],
  ["chart.svg", chart],
  ["cloud.svg", cloud],
  ["database.svg", database],
  ["python.svg", python],
  ["star.svg", star],
]);

/** SVG markup as a data URI: Redraw never fetches, the PNG canvas is never
 *  tainted, and Export HTML stays standalone (§7). */
export const svgUri = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`;

// ---------------------------------------------------------------- the HTML layer
//
// shape → the node's HTML. The HTML layer exists to be measured, so it stays in
// flow and carries the identity: the DOT's names, plus at most one kind and one
// membership class (§3).

const SHAPES = new Map<string, (node: T.DiagramNode) => string>([
  ["box", box],
  ["record", record],
]);

export function shapeHtml(node: T.DiagramNode): string {
  const render = SHAPES.get(node.shape) ?? SHAPES.get("box")!;
  return render(node);
}

// shape → the node's type class. A `Map`, so the rule reads as the one line it is:
// `record` is the only shape with a renderer and a class of its own, and every
// other shape is a `.node` that says which shape it is in `data-shape`.
//
// `none`, `box3d`, `cylinder` and the rest carry no meaning for us — they are
// values the author wrote, passed through so the styles tab can reach them.
// Giving each one a class would put a bare DOT word in the class space, where a
// subgraph of the same name already lives (§3.1).
const KIND = new Map<string, string>([["record", "record"]]);

function box(node: T.DiagramNode): string {
  return `<div ${identity(node)}><span class="label">${renderLabel(node.label)}</span></div>`;
}

// ------------------------------------------------------------------ shape=record
//
// The record label is the one grammar we own. A split, not a parser: `|`
// separates cells, `{}` flips the flex axis. Depth rises at `{` and falls at
// `}`, so flipping at both reproduces depth parity without counting it.
//
// A cell carries no class: the markup is the selector. `.record > span` is a
// top-level field, `.record div` a flipped group, `:nth-child()` a position.
//
// A leading `{` is the node's own axis, not a container inside it. Records are
// written `{Head | {A | B}}`, and honouring that brace as a level would wrap the
// whole record in one div that says nothing.

type Cell = {
  span: number; // indices this cell swallowed — `{me || you}` gives `me` two
  text: string;
};

type Cursor = {
  dir: string; // the axis the next `{` will flip away from
  depth: number; // open braces, so an unbalanced label throws
  outer: boolean; // the leading `{` is the node element, and emits no div
  prev: string; // the separator we last passed — `{`, `}`, `|`, or "" at the ends
  pending: Cell | null; // one cell of lookbehind, so an empty slot can grow it
};

function record(node: T.DiagramNode): string {
  const label = node.label.trim();
  const outer = label.startsWith("{");
  const dir = outer ? "col" : "row";
  const cursor: Cursor = { dir, depth: 0, outer, prev: "", pending: null };

  const fields = walk(label, cursor);
  if (cursor.depth !== 0) throw new Error(`unbalanced {} in record label of ${node.id}`);

  return `<div ${identity(node)}>${fields}</div>`;
}

// Cells come from the text *between* separators, so a separator only ever opens
// or closes a container — which is what keeps the markup balanced by
// construction. Tail recursion over the remainder.
function walk(rest: string, cursor: Cursor): string {
  const at = separator(rest);
  if (at < 0) return cell(rest, cursor, "") + flush(cursor);

  const sep = rest[at]!;
  return cell(rest.slice(0, at), cursor, sep) + brace(sep, cursor) + walk(rest.slice(at + 1), cursor);
}

// Blank between two `|` is an empty slot and counts: `{me || you}` is three
// fields, not two, and `me` is the one that grows. Blank beside a brace is
// notation — the space in `1st | {2nd` — and counts for nothing.
function cell(raw: string, cursor: Cursor, next: string): string {
  const [, label] = splitPort(raw.trim());
  const prev = cursor.prev;
  cursor.prev = next;

  if (label === "") {
    if (isSlot(prev, next)) grow(cursor);
    return "";
  }
  const out = flush(cursor);
  cursor.pending = { span: 1, text: label };
  return out;
}

// `|` is a boundary and nothing else — flushing there would spend the lookbehind
// an empty slot still needs. A brace changes the tree, so the pending cell has
// to land before the container opens or closes.
function brace(sep: string, cursor: Cursor): string {
  if (sep === "|") return "";
  return flush(cursor) + container(sep, cursor);
}

function container(sep: string, cursor: Cursor): string {
  const open = sep === "{";
  const isOuter = cursor.outer && cursor.depth === (open ? 0 : 1);
  cursor.depth += open ? 1 : -1;
  if (isOuter) return "";

  cursor.dir = cursor.dir === "row" ? "col" : "row";
  return open ? "<div>" : "</div>";
}

function isSlot(prev: string, next: string): boolean {
  return prev !== "{" && prev !== "}" && next !== "{" && next !== "}";
}

// An empty slot hands its width to the cell before it: that is what "the
// previous field is twice the size" means.
function grow(cursor: Cursor): void {
  if (cursor.pending === null) return;
  cursor.pending.span += 1;
}

function flush(cursor: Cursor): string {
  const cell = cursor.pending;
  if (cell === null) return "";
  cursor.pending = null;

  // `--span` is data; Base CSS turns it into growth, so a theme can still say no.
  const span = cell.span > 1 ? ` style="--span:${cell.span}"` : "";
  return `<span${span}>${renderLabel(cell.text)}</span>`;
}

// The first *unescaped* separator: `\|` and `\{` are literal text, so a bare
// indexOf would split the label in the one place the author said not to.
function separator(text: string): number {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === "{" || text[i] === "}" || text[i] === "|") return i;
  }
  return -1;
}

// `<p6> 6th` — a port. We cannot honour it as an edge attachment point, since
// connectors are drawn from measured boxes (§4), so it is dropped: the field
// keeps its text and the port gives nothing.
function splitPort(text: string): [string, string] {
  if (!text.startsWith("<")) return ["", text];

  const end = text.indexOf(">");
  return [text.slice(1, end).trim(), text.slice(end + 1).trim()];
}

// --------------------------------------------------------------------- shared

function identity(node: T.DiagramNode): string {
  const kind = KIND.get(node.shape) ?? "node";
  const classes = [kind, ...styleWords(node.style), ...node.classes, ...membership(node.classes)].join(" ");
  const shape = kind === "node" ? ` data-shape="${node.shape}"` : "";
  return `id="${node.id}" class="${classes}"${shape}`;
}

// One membership class, or none: in any cluster is `.cluster`, and a cluster is
// already a subgraph, so it never also wears `.subgraph` (§3).
function membership(classes: T.SubgraphName[]): string[] {
  if (classes.some((name) => name.startsWith("cluster"))) return ["cluster"];
  return classes.length > 0 ? ["subgraph"] : [];
}

// `style="invis,filled"` → `invis filled`. A word is what a class is, so each
// one travels as a class and the theme decides what it means — `.invis` is
// hidden. Split on the comma, nothing else: the words are the author's.
export function styleWords(style: string): string[] {
  return style
    .split(",")
    .map((word) => word.trim())
    .filter((word) => word !== "");
}

// ------------------------------------------------------------------- markdown
//
// We hand-rolled this once — six regexes whose own comment called it "the
// second grammar we own". Nobody writes a markdown parser.

// A name we do not carry is passed through — the author gets a broken image
// and can see why.
function iconSrc(src: string): string {
  const svg = ICONS.get(src.replace(/^(\.\/)?icon\//, ""));
  return svg === undefined ? src : svgUri(svg);
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
// the characters the record split above reserved.
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
function renderLabel(label: string): string {
  return md.renderInline(unescape(label));
}

// An annotation is the opposite: a note wants paragraphs and lists, so it is
// block mode. Same pre-pass, so `\n` means the same thing in both (§7) — with
// `\n\n` reading as a paragraph break here, which is the point of block mode.
export function renderAnnotation(text: string): string {
  return md.render(unescape(text));
}
