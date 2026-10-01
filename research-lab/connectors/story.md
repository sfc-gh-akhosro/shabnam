
so we have 3 parts:
- find the pathways => find the pathways
- then find which port to choose given the pathways from part 1.
- then do some "polishing" like putting lanes in gutters, and moving the lines to avoid adding lanes.

we keep step 1 and 3 mainly as it is (slight changes).
the step 2 becomes which port to choose changes.



# story (written by human):
the layout is simple. I write it here again with my ideas (no ideas are wrriten on stone, they can be used or discarded if a better idea you have replaces it, these are just ideas).

we have ranks (they have no width:0 in LR direction and ....) nodes are one dimentional, they only have length. so every node is
type NodeOrder = (rank: integer, order or y: position in px unit in integer, length: the same unit as order)

(I like my own vocabulary)
gutters: run between ranks (up-down in rankdir=LR; like home gutters)
pathways: run cross ranks (left-right in rankdir=LR)

node margins are ok to go through! We have a special number (let's set --node-clearance: 2em for default that we make nodes bigger from each side (length += 2em) so connectors avoid nodes). otherwise gaps and amrgins are "space" for connectors and they can go through them.

## Part 1: find pathways:

during finding pathways, we have this rule: we always go through positive direction (going closer to "to" in x or y direction). but in the part 2: fiding the ports, we dont have this rule "no going back".

If such pathway not find: we find whatever path (really no need to have extra code, a good/ok path or first path is good).


since we go positive, there is no such thing as distance difference between solutions. so, this part is all about fewer bends but not including the begging and end (which finding port will take care of).

what does a route means: finding pathways. Let's say we have:
r2: pw0 n1 pw1 n2 pw2 n3 pw3
for each rank.
then we just if we want to go from r1 to r4, I just need to say (pw22, pw31) 
means i need to pass r2 (throuh pw22) and r3 (through pw31). The path is defined.

eligible pathways are where it is in between from and to (from y1 to y2)

let's define each pathway with its start and end pw(s, e) (e and s are the same unit as y/order)


### idea1: (use or not)
les make it easier: there are 3 main cases:
- in-rank connections: no need, we know how to, and we draw the last in the best available side or inside ranks if immediate neighbors. Easy. but the last.
- immediate connections. these are the most common ones and they need no pathway. no need to go through the finding path. this just needs finding exit/enter sides and locations.

- rank 2: pathways are already known, filter eligible one, select a good one

- rank 3 and more: first find all cross pathways:
intersecting eligible pathways cross involving ranks should give you the cross pathways.

find the min number of pathways.

as you see the min number of pathway replaced min bend which replaced shortest path for part 1.

## part 2: finding the correct ports for enter/exit



So , now we have pathways (across ranks) to go through (given from the first part).
I write it like in rankdir=LR (but would be similar to other rankdirs).

we have 8 parts: nw, n, ne (top side in any rankdir), e and w in sides, and sw, s, se (bottom side in any rankdir)

### eligible ports
for every from_to nodes, each node only has eligible ports:
- directional ports always center in and out for all nodes
- in addition to directional ports: border nodes have their open side ports available. 
    - So for instance for first nodes of each rank: in LR: top ports are open. In rankdir=TD the left port is open (there is just one port in the sides middle).



### The criteria to choose the ports. 
DOnt forget the pathways are given (part 1), now we need to choose the best port in each side with these criteria:
- the ports that give us fewer bends wins.
- in tie: directional ports win. 
- in tie: closer ports (shorter path) wins


## Part3: polishing

When it is done, we like to do "lane the gutters".
since the gutters will be filled with connectors, we would like for two connecotrs like from1_to1 and from2_to2 that (from1 <> from2 AND to1 <> to2) (the dont share exit or enter) to not collide, so we create a neighboring lane.
BTW, sometimes, we can avoid collusion by moving enter or exit (no changing side or path, just location in side): like look at gcs_horizon and bq_runtime.
no need to create a lane if you bring down the enter and up the other exit.

In the end, we give a radius to our bends and that is it.




# Written by LLM wrote the code: Connector routing

The working page is `research-lab/connectors/index.html`. It is `connectors4` with part 2 swapped. `src/` is untouched.

Three parts, in this order:

1. Pathways — `stab` on rank free intervals (`connectors4`, unchanged).
2. Ports — eight named ports; pick one pair.
3. Polish — `place` (slide), then `assignLanes`, then radius (`connectors4`, unchanged).

---

## World

A rank has no width. A node is `{ rank, y, length }` on the order axis.

**Gutter** — between ranks. Always free.

**Pathway** — a gap through a rank (`pw(s, e)` on the order axis). `--clear` (2em) inflates each node before pathways are cut. Margins are free; the inflated box is not.

---

## Part 1 — pathways

Keep `connectors4`: `measure` cuts `free` per rank, `stab` joins consecutive free sets. Score is how few bands you need, monotone toward the head. Adjacent (Δrank 1) and in-rank skip this.

---

## Part 2 — ports

The only change from `connectors4`. Pathways from part 1 do not move.

Eight ports, same names in every rankdir:

```
nw   n   ne
w         e
sw   s   se
```

- `e` / `w` — every node, centre of the directional face.
- `nw n ne` — only the first node of a rank (nothing on that outer side).
- `sw s se` — only the last node of a rank.

The three on an extra face sit at `1/6`, `1/2`, `5/6` of that face, inset `min(round(width/6), 24)` so the marker has room. They are not corners.

Pick, in this order:

1. fewer bends
2. directional ports win (`e`/`w` beat `ne`)
3. closer ports win (`ne` beats `n`/`nw` when exiting toward the right)

In-rank stays last: neighbours draw inside the rank; otherwise the emptier gutter.

---

## Part 3 — polish

Unchanged from `connectors4`. Slide attachments on the chosen side so gutter runs miss (`gcs_horizon` / `bq_runtime`). Lane only when both ends differ. Then one radius.

---

## What this is not

Do not rewrite part 1 or 3. Do not hunt straight lines. Do not run A*.
