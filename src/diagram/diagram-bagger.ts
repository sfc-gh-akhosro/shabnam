// The only reader of Graphviz's JSON (§3). Everything downstream sees
// DiagramModel and nothing else, so Graphviz's shape is quarantined here.

import type * as T from "../types.ts";

// Graphviz's own shape, named only so this file can talk about it. `objects`
// holds the subgraphs first — `_subgraph_cnt` of them, and the root graph is
// *not* one of them — and then every node. `nodes` / `subgraphs` / `tail` /
// `head` are indices into `objects`, which is also the `_gvid` of each entry.
type RawObject = {
  name: string;
  pos?: string;
  nodes?: number[];
  subgraphs?: number[];
  [key: string]: unknown;
};

type RawEdge = {
  tail: number;
  head: number;
  [key: string]: unknown;
};

type RawGraph = {
  _subgraph_cnt: number;
  objects: RawObject[];
  // Absent, not empty, when the DOT has no edges at all — so a first diagram of
  // nothing but boxes is a real case, and it reached here as a crash.
  edges?: RawEdge[];
  [key: string]: unknown;
};

// The presentational keys we carry into the model. CssBagger translates the
// ones ATTR_CSS knows and skips the rest (§3.2). Graphviz has already resolved
// `node [...]` / `edge [...]` defaults onto every object, so whatever is here
// is the object's effective value.
const STYLE_KEYS = [
  "fillcolor",
  "bgcolor",
  "color",
  "fontname",
  "fontsize",
  "penwidth",
  "style",
  "splines",
];

// Size is the one pair we cannot take at face value. Graphviz reports `width`
// and `height` on every node whether the author said anything or not — `0.75 x
// 0.5` when nothing was said, and otherwise its own text measurement, in its own
// font at its own size. Carrying that would put Graphviz's metrics in our CSS,
// and geometry is the Measurer's (§3.4).
//
// `fixedsize` is the one field that appears only when the author asked for it, so
// it is the gate: an authored size travels, a computed one does not. It arrives as
// a string, so `"false"` is truthy and has to be named — these two are the values
// that mean fixed.
const SIZE_KEYS = ["width", "height"];
const FIXED = new Set(["true", "shape"]);

export class DiagramBagger implements T.DiagramBagger {
  // sanitized id → the DOT name that claimed it, so a collapse throws (§3.1)
  private ids = new Map<string, string>();

  bag(json: T.VizJson): T.DiagramModel {
    const raw = json as RawGraph;
    this.ids = new Map();

    const names = nodeNames(raw);
    const groups = groupNames(raw);

    // Graph-level attributes are on the top-level JSON, not on any entry of
    // `objects` — the root graph is not in there at all.
    return {
      rankdir: String(raw.rankdir ?? "TB"),
      nodes: this.bagNodes(raw, classesByNode(raw, groups)),
      edges: this.bagEdges(raw, names),
      clusters: bagClusters(raw, names, groups),
      attrs: attrsOf(raw),
    };
  }

  private bagNodes(raw: RawGraph, classes: Map<number, string[]>): T.Node[] {
    return nodeEntries(raw).map(([gvid, object]) => {
      const [x, y] = object.pos!.split(",");
      const label = String(object.label ?? "");
      return {
        id: this.id(object.name),
        classes: classes.get(gvid) ?? [],
        shape: String(object.shape ?? "box"),
        shell: String(object.shell ?? ""),
        icon: String(object.icon ?? ""),
        label,
        caption: String(object.caption ?? label),
        x: Number(x),
        y: Number(y),
        attrs: attrsOf(object),
      };
    });
  }

  private bagEdges(raw: RawGraph, names: Map<number, string>): T.Edge[] {
    const seen = new Map<string, number>();

    return (raw.edges ?? []).map((edge) => {
      const from = names.get(edge.tail)!;
      const to = names.get(edge.head)!;
      const nth = (seen.get(`${from}>${to}`) ?? 0) + 1;
      seen.set(`${from}>${to}`, nth);
      const suffix = nth === 1 ? "" : `_${nth}`;
      return {
        id: this.id(`${from}_${to}${suffix}`),
        from: sanitize(from),
        to: sanitize(to),
        classes: [],
        attrs: attrsOf(edge),
      };
    });
  }

  // One HTML id space for nodes and edges. Two DOT names that sanitize to the
  // same id would silently collapse the page, so throw (§3.1). Clusters are
  // classes, not ids, so they are not in this space.
  private id(name: string): string {
    const id = sanitize(name);
    const owner = this.ids.get(id);
    if (owner !== undefined && owner !== name) {
      throw new Error(`id collision: "${owner}" and "${name}" both become "${id}"`);
    }
    this.ids.set(id, name);
    return id;
  }
}

function bagClusters(
  raw: RawGraph,
  names: Map<number, string>,
  groups: Map<number, string>,
): T.Cluster[] {
  return subgraphs(raw).map(([gvid, object]) => ({
    name: groups.get(gvid)!,
    label: String(object.label ?? ""),
    isInvis: String(object.style ?? "").split(",").includes("invis"),
    nodes: (object.nodes ?? []).map((member) => sanitize(names.get(member)!)),
    clusters: (object.subgraphs ?? []).map((nested) => groups.get(nested)!),
    attrs: attrsOf(object),
  }));
}

function sanitize(name: string): string {
  return name.replace(/[^A-Za-z0-9_-]/g, "-");
}

// Graphviz names anonymous subgraphs `%1`, `%3`, `%5` — its own numbering, with
// gaps. We renumber by appearance instead, so the class a reader sees counts the
// subgraphs they wrote.
function isAnonymous(name: string): boolean {
  return name.startsWith("%");
}

function nodeNames(raw: RawGraph): Map<number, string> {
  return new Map(nodeEntries(raw).map(([gvid, object]) => [gvid, object.name]));
}

function nodeEntries(raw: RawGraph): [number, RawObject][] {
  return raw.objects
    .slice(raw._subgraph_cnt)
    .map((object, index): [number, RawObject] => [raw._subgraph_cnt + index, object]);
}

// The subgraphs, which are the first `_subgraph_cnt` objects. The root graph is
// not among them — verified in `research-lab/probe-subgraphs.ts`, because the
// opposite belief costs you the anonymous block at index 0.
//
// An anonymous subgraph usually exists only to carry `rank=same`, but it can
// also carry a `node [...]` default — example-1's first one carries
// `fillcolor="#ddffdd"` for six nodes — and then it is the only thing standing
// between one class rule and one `#id` rule per member. So it is a cluster like
// any other (§3.1).
function subgraphs(raw: RawGraph): [number, RawObject][] {
  return raw.objects
    .slice(0, raw._subgraph_cnt)
    .map((object, index): [number, RawObject] => [index, object]);
}

// gvid → the class a subgraph contributes. A named subgraph gives its DOT name
// verbatim, `cluster_` included (§3.1); an anonymous one is numbered by
// appearance, which is `objects` order and therefore deterministic.
function groupNames(raw: RawGraph): Map<number, string> {
  let anonymous = 0;

  return new Map(
    subgraphs(raw).map(([gvid, object]): [number, string] => [
      gvid,
      isAnonymous(object.name) ? `subgraph_${++anonymous}` : sanitize(object.name),
    ]),
  );
}

// Every subgraph a node sits in becomes one of its classes, in declaration
// order (§3.1).
function classesByNode(raw: RawGraph, groups: Map<number, string>): Map<number, string[]> {
  const classes = new Map<number, string[]>();

  for (const [gvid, object] of subgraphs(raw)) {
    for (const member of object.nodes ?? []) {
      const list = classes.get(member) ?? [];
      list.push(groups.get(gvid)!);
      classes.set(member, list);
    }
  }
  return classes;
}

function attrsOf(object: { [key: string]: unknown }): Map<string, string> {
  const attrs = new Map<string, string>();

  for (const key of STYLE_KEYS) {
    if (object[key] !== undefined) attrs.set(key, String(object[key]));
  }
  if (!FIXED.has(String(object["fixedsize"]))) return attrs;

  for (const key of SIZE_KEYS) {
    if (object[key] !== undefined) attrs.set(key, String(object[key]));
  }
  return attrs;
}
