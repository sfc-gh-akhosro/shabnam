// SHAPE_HTML — a registry, not a class (§8). shape → the node's HTML layer.
// The HTML layer exists to be measured, so it stays in flow and carries the
// identity: the DOT's names, plus at most one kind and one membership class (§3).

import type * as T from "../types.ts";
import { renderLabel } from "./markdown.ts";

export const SHAPE_HTML: T.ShapeHtml = new Map([
  ["box", box],
  ["record", record],
]);

export function shapeHtml(node: T.DiagramNode): string {
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
  const kind = SHAPE_CLASS.get(node.shape) ?? "node";
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
