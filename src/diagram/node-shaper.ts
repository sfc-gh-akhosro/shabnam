// SHAPE_HTML — a registry, not a class (§8). shape → the node's HTML layer.
// The HTML layer exists to be measured, so it stays in flow and carries the
// identity: DOT id + one type class (`node` / `record`) + one subgraph class (§3.1).

import type * as T from "../types.ts";

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

function iconSrc(src: string): string {
  const filename = src.replace(/^icon\//, "").replace(/^\.\/icon\//, "");
  const svg = ICONS.get(filename);
  if (svg !== undefined) {
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
  return src;
}

export const SHAPE_HTML: T.ShapeHtml = new Map([
  ["box", box],
  ["record", record],
]);

export function shapeHtml(node: T.Node): string {
  const render = SHAPE_HTML.get(node.shape) ?? SHAPE_HTML.get("box")!;
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
const SHAPE_CLASS: T.ShapeClass = new Map([["record", "record"]]);

function box(node: T.Node): string {
  return `<div ${identity(node)}><span class="label">${text(node.label)}</span></div>`;
}

// ------------------------------------------------------------------ shape=record
//
// The record label is one of the two grammars we own. `renderJSON` hands it over
// unexpanded — the JSON describes the same nesting in `rects` and `_draw_`, but
// as geometry, and geometry is the Measurer's (§3.4) — so the tree exists only in
// the string. A split, not a parser: `|` separates cells, `{}` flips the flex
// axis. Depth rises at `{` and falls at `}`, so flipping at both reproduces depth
// parity without counting it.
//
// A cell's class is its **path**: `._2_1` is the first field inside the second
// top-level item. Positional, but positional the way a filesystem is — inserting
// a sibling at one level leaves every other level alone.
//
// A leading `{` is the node's own axis, not a container inside it. Records are
// written `{Head | {A | B}}`, and honouring that brace as a level would push the
// whole diagram down to `._1_1`, `._1_2_1` — a level of path that says nothing.

type Cell = {
  classes: string[];
  span: number; // indices this cell swallowed — `{me || you}` gives `me` two
  text: string;
};

type Cursor = {
  path: number[]; // the index of the current cell at each level
  dir: string; // the axis the next `{` will flip away from
  depth: number; // open braces, so an unbalanced label throws
  outer: boolean; // the leading `{` is the node element, and emits no div
  prev: string; // the separator we last passed — `{`, `}`, `|`, or "" at the ends
  pending: Cell | null; // one cell of lookbehind, so an empty slot can grow it
};

function record(node: T.Node): string {
  const label = node.label.trim();
  const outer = label.startsWith("{");
  const dir = outer ? "col" : "row";
  const cursor: Cursor = { path: [0], dir, depth: 0, outer, prev: "", pending: null };

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
  bump(cursor);
  cursor.pending = { classes: [path(cursor)], span: 1, text: label };
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
  if (!open) {
    cursor.path.pop();
    return "</div>";
  }
  // A group takes an index of its own, or the field after it would reuse one.
  bump(cursor);
  cursor.path.push(0);
  return `<div>`;
}

function isSlot(prev: string, next: string): boolean {
  return prev !== "{" && prev !== "}" && next !== "{" && next !== "}";
}

function bump(cursor: Cursor): void {
  cursor.path[cursor.path.length - 1] += 1;
}

// An empty slot spends an index and hands it to the cell before it, which is
// what "the previous field is twice the size" means in classes as well as width.
function grow(cursor: Cursor): void {
  bump(cursor);
  if (cursor.pending === null) return;
  cursor.pending.span += 1;
}

function flush(cursor: Cursor): string {
  const cell = cursor.pending;
  if (cell === null) return "";
  cursor.pending = null;

  // `--span` is data; Base CSS turns it into growth, so a theme can still say no.
  const span = cell.span > 1 ? ` style="--span:${cell.span}"` : "";
  const extra = cell.classes.join(" ");
  const classes = extra === "" ? "cell" : `cell ${extra}`;
  return `<span class="${classes}"${span}>${text(cell.text)}</span>`;
}

function path(cursor: Cursor): string {
  return `_${cursor.path.join("_")}`;
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

// `<p6> 6th` — a port is a stable name beside the path class. We cannot honour it
// as an edge attachment point, since connectors are drawn from measured boxes
// (§3.4), so this is all it is: a name the author already chose.
function splitPort(text: string): [string, string] {
  if (!text.startsWith("<")) return ["", text];

  const end = text.indexOf(">");
  return [text.slice(1, end).trim(), text.slice(end + 1).trim()];
}

// --------------------------------------------------------------------- markdown
//
// The second grammar we own, and the smaller one: inline markdown inside a label.
// Inline only — a label is a name, not a document — and deliberately no image
// syntax, because a remote image would make Redraw fetch, taint the PNG canvas,
// and leave Export HTML no longer standalone (§4). Icons already arrive through
// `icon=`, resolved by Graphviz and inlined.
//
// `_emphasis_` is not supported: underscores are common in DOT names and are our
// own path notation. Applied in insertion order, so `**` is claimed before `*`.
const MD = new Map<RegExp, string>([
  [/`([^`]+)`/g, "<code>$1</code>"],
  [/\*\*([^*]+)\*\*/g, "<strong>$1</strong>"],
  [/\*([^*]+)\*/g, "<em>$1</em>"],
  [/~~([^~]+)~~/g, "<del>$1</del>"],
  [/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>'],
]);

// --------------------------------------------------------------------- shared

function identity(node: T.Node): string {
  const kind = SHAPE_CLASS.get(node.shape) ?? "node";
  const classes = [kind, ...styleWords(node.attrs), ...node.classes].join(" ");
  const shape = kind === "node" ? ` data-shape="${node.shape}"` : "";
  return `id="${node.id}" class="${classes}"${shape}`;
}

// `style="invis,filled"` → `invis filled`. Graphviz's `style` is a comma-list of
// words, and a word is what a class is, so each one travels as a class and the
// theme decides what it means — `.invis` is hidden, and the others are there to
// be styled if we ever want them. Split on the comma, nothing else: the words
// are the author's.
export function styleWords(attrs: Map<string, string>): string[] {
  return (attrs.get("style") ?? "")
    .split(",")
    .map((word) => word.trim())
    .filter((word) => word !== "");
}

// Escape first, so the author's `<` is text and only our own tags are markup.
// Graphviz escapes (`\n`, `\l`, `\r`) and literal newlines become `<br />`.
function text(label: string): string {
  const escaped = label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\\([|{}])/g, "$1")
    .replace(/\\[nlr]/g, "<br />")
    .replace(/\n/g, "<br />");

  const withImages = escaped.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_, alt: string, src: string) =>
      `<img class="icon" src="${iconSrc(src)}" alt="${alt}" />`,
  );

  return [...MD].reduce((out, [pattern, tag]) => out.replace(pattern, tag), withImages);
}
