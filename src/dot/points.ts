// The walk's record → points and arrows (§2).
//
// Everything about appearance is thrown away. Layout gets the two structural
// facts that genuinely are its business: which groups asked for one rank, and
// which clusters want to be boxed together.

import type * as T from "../types.ts";
import { membersOf } from "./model.ts";

export function buildPoints(written: T.Written): T.PointGraph {
  const sameRank = groupsAskingForOneRank(written);
  const pinned = new Set(sameRank.flat());

  const boxes = new Map<T.SubgraphName, T.NodeId[]>();
  for (const name of written.scopes.keys()) {
    if (!name.startsWith("cluster")) continue;
    const members = membersOf(name, written);
    // A cluster that is itself a same-rank group is already served by
    // contraction; boxing it as well would constrain the same nodes twice.
    if (members.length > 1 && !members.some((id) => pinned.has(id))) boxes.set(name, members);
  }

  return {
    rankdir: written.rankdir,
    nodes: [...written.members.keys()],
    arrows: written.edges.map(({ from, to }) => ({ from, to }) satisfies T.Arrow),
    sameRank,
    boxes,
  };
}

/** `rank=same` on a subgraph, as member lists. A group of one is not a group. */
function groupsAskingForOneRank(written: T.Written): T.NodeId[][] {
  const groups: T.NodeId[][] = [];
  for (const [name, said] of written.scopes) {
    if (said.get("rank") !== "same") continue;
    const members = membersOf(name, written);
    if (members.length > 1) groups.push(members);
  }
  return groups;
}
