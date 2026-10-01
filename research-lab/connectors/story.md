# Connector routing

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
