# Shabnam

This document tells the story of the app from the perspective of a user-designer-architect persona. It is interwoven and informal: what the user wants to do, how they use the UI, the major components, the types and interfaces that matter, the libraries and algorithms we lean on. 

We have 4 "defining files or root files" that defines our app, what and how it does.
- `user-story.md` (this file). It is the gateway and an informal source for other defining files:
- `app-architecture.md` that in a more detailed and formal and accurate language describes our major architectural decisions.
- `types.ts` that defines the signiture of our major classes through types and interfaces.
- `coding-rules.md` that tell about our principals and craftmanship practices.

`(user-story => app-architeture + types.ts) + coding-rules => src/ codebase => test/`


This file should be the most revealing thing here: "Oh! I got it, this app does *this*, in *this* way." Not a technical categorization, not jargon, not a lawyer speaking — nobody can say he is wrong and nobody can say what he is talking about. Just the cores, but whole.

# The story

This is a single page app. On the left, `<main>` has a top bar of action buttons (open, save, export, etc.) and then the canvas, `#diagram-canvas`, where we draw the diagram in HTML and SVG. On the right, `<aside>` has the tabs the user selects: DOT, styles, annotations, and JS for scripting. Tabs behave like radio buttons but are drawn tight together and `.raised-shadow`; selecting one makes it `.flat-shadow`, which gives that old pushed-in look.

We have a handful of basic components we build once and reuse — radio strips, check boxes, `.glass`, `.paper`, `.row`, `.col`.

The idea: the user draws the *semantics* of the graph in DOT — bring your own DOT — styles it here with CSS in an easier form, adds annotation and script, which are the two things diagrams are normally bad at, and out comes a beautiful technical diagram for a blog or a paper. Clever theming and very small styling classes make working with style fun instead of technical.

Then you export to SVG or PNG. The SVG is a `<foreignObject>` wrapper: arrange the canvas inside it, attach a `<style>` printed out of CSSOM, done — the result is identical to the HTML version because the same engine renders it. Transparency is one appended rule making `#diagram-canvas` transparent, not a `<rect>`; you cannot remove a background by painting behind it.

Shabnam does not compete with Graphviz. We borrow a DOT parser to read the language, and a layout algorithm to decide what sits where — and we own everything after that.

Because DOT defines the semantics, we religiously use DOT's own naming. A `subgraph <name>` becomes a `.name` class on every member node. A `cluster_…` subgraph additionally gets its box drawn in SVG around those nodes. Nodes get `.node`, or `.record` instead when `shape=record`, and every other shape names itself in `data-shape`. Ids are DOT names: node `bq` is `#bq` in HTML and in CSS, and the edge from `bq` to `catalog` is `#bq_catalog`. Sanitizing an id that collides with another throws — a malformed page is much harder to debug than a stack trace.

Identity in CSS is identity in DOT. Nothing less, nothing more. Somebody who can read the DOT can write the CSS without learning a second vocabulary, and can grep one for the other.

## The pipeline

Each stage has exactly one owner, and nobody reaches past their own stage.

```
dot ──parse──▶ Ast ──┬──▶ DiagramModel     who exists, who connects, who belongs
                  ├──▶ DotStyles        appearance, at the branch it was written
                  └──▶ PointGraph ──layout──▶ Positions

        then, after the browser paints: measure → clusters / shells / connectors → svg
```

One string in, three answers out, and **the `Ast` is a hub rather than a stage in a chain** — because each answer needs what the others throw away. Styles need to know which *branch* an attribute was written on, and the moment you push `node [fillcolor=coral]` down onto its members that fact is gone forever. Layout wants the opposite: points and arrows with every attribute deleted. The model wants neither; it wants identity and connection. Three questions, one walk, no queue.

Which gives the line every attribute falls on one side of: **it is either markup or appearance.** `label`, `shape`, `icon` and `caption` decide what HTML we build, so they belong to the model — and they are *resolved*, pushed down from the branches above, because a node has to know its own shape. A colour is appearance, and it is deliberately *not* resolved, because the nesting the author wrote is exactly the selector we want. Same tree, two readings, and that asymmetry is the whole reason a real parse tree beats a laid-out JSON: we stopped guessing backwards at which value had been the default.

Two libraries, two walls. The parser is visible inside one class and the layout inside another, each named after the thing it hides, so nothing else in the app could tell you what either is called. `diagram/*` is pure, data in and data out, no DOM, which is why it tests as plain functions.

The app has exactly one `try/catch` and it wraps the parse, because DOT is syntactically broken on most keystrokes. It shows the message and leaves the last good picture standing. Everywhere else we fail loud.

The canvas is a skeleton of named sinks, one per worker, and the order of the children is load-bearing:

```html
<article id="diagram-canvas">
  <div id="diagram-html">   <!-- ranks + node html, zero inline styles -->
  <svg id="diagram-svg">    <!-- #cluster-shells, #node-shells, #connector-paths -->
  <div id="annotation-html">
  <style id="style-css">    <!-- the stylist's sheet. never textContent -->
  <script id="action-js">   <!-- yours, runs last -->
```

Every id we own is two hyphenated words. That is not tidiness — a DOT name is a bare word, so the diagram's ids and the page's ids share one namespace, and a node called `app` once inherited `height: 100vh` from a chrome rule and stretched its rank to the viewport.

A node is two layers, and the HTML layer owns the visible node: background, border and label are real CSS on a real div, in flow, measurable. The SVG layer only draws chrome *around* the measured rectangle — a stroke-only shell, an icon badge, a caption strip. The skeleton order forces this: SVG paints after HTML, so a filled shell would cover the very label it is decorating, and two text layers would print every node twice.

## Ranks, and the one thing layout will not say

From layout we take two facts and nothing else: which rank a node is in, and its order inside that rank. Both arrive as **integers**, which is worth saying because for a long time they did not — the old reader handed us coordinates and nothing else, so a rank had to be inferred by sorting on an axis and opening a new bucket whenever a node sat more than two points from the one it would otherwise join. That whole recovery, and the four-way `rankdir` axis map it needed, is gone.

The one thing layout cannot express is `rank=same`, so we contract each group into a single stand-in node, lay that out, and expand it again — members take the stand-in's rank and spread across it. It is exact rather than a heuristic, and it is about fifteen lines.

Coordinates still come back, deliberately rough, and we barely use them: they tell us sequence today and will feed a bit of within-rank gravity later. Real size is CSS's, which is the next paragraph.

Everything else about the picture is CSS, and we once broke that rule on purpose to see what happened: we derived per-node spacing from the coordinates, and deleted it again, because it was the only number in the pipeline that was computed instead of passed through.

Which brings the important half. Layout's pixel sizes are thrown away entirely. The HTML goes out with no inline styles, the browser lays it out under whatever CSS is live at that moment, and only then does `measure` read the real boxes back with `getBoundingClientRect`. Every number the SVG layer uses is that measurement. Put `font-size: 24px` on `.node` and the div grows; shells and edge endpoints computed from layout's old numbers would detach, and every style change would need a Redraw to look right. Measured after paint, they simply stay glued.

## Connectors

Connectors are an ortho snake, and it works because we never search for free space — the layout already *is* a grid. The vertical corridors are the gutters between ranks, the horizontal ones are the gaps between rows, and a route alternates: out of a side, along a gutter, across a row gap, along the next gutter, into the destination side. A real diagram gives about eight vertical lines and twenty horizontal ones, so the walk is a few hundred steps; a visibility graph over obstacle edges would be an order of magnitude bigger to answer the same question. A bend costs about 240 pixels of straightness, deliberately a lot, because you read a connector by its corners and two turns saved is worth a long way round.

Clearance is how much empty space a route wants to keep between itself and a box it passes, measured from CSS (`1em`), so your styling sets it. The trouble is arithmetic: clearance `c` on both sides of a gutter `g` leaves `g - 2c`, and at a 28px gutter `1em` leaves zero. The corridor closes, and a strict router would answer "no route" and drop the edge — meaning your CSS could delete edges by tightening a gap. So it is a preference with a floor:

```ts
for (const inflate of [clearance, 0]) { … }   // try roomy, then touching
return [tail, tailStub, ...dogleg(…), headStub, head];   // last resort
```

Try the walk with obstacles inflated by the clearance asked for; if nothing gets through, try again with none, allowed to graze boxes; if still nothing, emit a plain two-bend dog-leg ignoring obstacles entirely. The edge always draws. A diagram with a tight edge is worse than a pretty one, and a diagram missing an edge is a lie about the architecture.

## Style

We have three representations of style, and only one of them is the truth:

- our `styleRules`, which is the source of truth;
- the browser's CSSOM, which we drive directly with add and remove — no CSS file and no CSS text is used to style the graph, though the chrome of the app has `app.css`, kept extremely lean;
- the `.row`s in the styles tab, which is user interaction.

```ts
type styleRules = Map<selector, Map<property, { value, source, id }>>
source: 0 theme · 1 dot · 2 user
```

To add a style — the user typed a row, or we read it from a theme JSON — we ask CSSOM first. If it refuses the value, the `.row` gets `.invalid` and nothing enters `styleRules`, because `styleRules` is the truth and that style is not applied. If it accepts, we write the entry. A counter mints an id that ties the three together: CSSOM's declaration, the book entry, and the row's `id`.

One book, so there are no layers and no merge step. `addRule` is the one door in and it refuses a write whose source is *lower* than the entry already there — equal or higher wins. That single guard does what three layers used to: a redraw re-feeds the DOT's rules at `1` and cannot take a row back off the user at `2`. An accepted overwrite is destructive immediately, which is the trap worth saying out loud: type over a key the theme owns and your row *becomes* it: delete the row and the theme's value goes with it. Load DOT is the way back, and Redraw deliberately is not.

A theme JSON is absorbed at source `0`. Then the DOT's own rules arrive at `1`, read straight off the branch they were written on — `node [fillcolor=coral]` inside `cluster_a` becomes one `.cluster_a.node` rule, not three `#id` rules and a guess. We used to guess: the old reader resolved every default onto the leaves before we saw it, so the rules were recovered by tallying the most common value per key, counting absence as a value, and breaking ties lexicographically. A bare DOT derives only the `:root` token block and leaves presentation to the theme. Selectors are composed flat, `.cluster_x.node, .cluster_x.record`, because CSSOM has no nesting and there is one rule per selector.

`@apply` is ours, not CSS: a property whose value lists other selectors in the same map. It is expanded only at the moment of feeding CSSOM, at the position it appears, so the selector's own later properties win. Expansion is a read, never a write — an expanded declaration reaches the sheet and never becomes a row you did not type. An undefined name throws; a cycle throws. And there is exactly one place a rule becomes text again, `serialize()`, called only by the exports, because an SVG file has to carry its own stylesheet.

Nothing repaints while you type, and that is law rather than wiring. A text tab never live-updates: the textarea writes the store, and the store is read at Redraw. A rows tab commits on `change`, never on keystroke, or the picture would flicker through `1`, `1p`, `1px` on the way to being typed.

## Export

Export is a wrapper, not a translation, and it is the decision I would most want understood. Save SVG clones the canvas into a `<foreignObject>` — SVG's own way of saying *this region is another language, go ask that engine* — so the file contains no shapes at all, and Chromium lays it out with the same engine that painted the screen. Shadows, gradients, `color-mix()`, text: correct by construction, including features nobody has invented yet. We built the alternative first, a real translator, boxes to `<rect>` and text to `<text>`, and deleted it. A translator is a dictionary with one entry per CSS feature, and this app ships a CSS editor, so users can always reach a property the dictionary lacks — and then the export quietly disagrees with the screen. Ours had already dropped shadows and per-side borders. The library everyone recommends, `dom-to-svg`, dropped every label in a record diagram when we measured it. The price we accept knowingly: the SVG opens in a browser and nowhere else, which is the use case. PNG is the same string through `Image` → `<canvas>` → `toBlob`.

Chromium only, and that is not a support matrix — it is a ban on compatibility code in `src/`. No fallbacks, no polyfills, no feature detection, no declining a platform feature because another engine is slow to it.

## The app itself

Five components, and one of them is the app. `Workbench` renders `main` beside `aside` straight into `body`, no root wrapper, and it is the only DOM owner — inject, wait for the paint, measure, place. `Tabs` is a radio strip that knows nothing about contents. The coding window is a bare `<textarea>` shared by the text tabs: no highlighting, no completion, and it is not allowed to grow into an editor — CodeJar was on the stack and was removed, since it cost a library, a highlighter file, nine classes and a contenteditable div, and bought the diagram nothing. `Rows` is the styles tab; annotations are a rows view too, onto an ordered list that *is* the model, with marks derived from it and never read back. `ExportDialog` is the one modal, asking SVG or PNG, and it exists because a file format stopped being a verb. State is signals and one store held by the workbench: no global store, no context, no router, no event bus. Every action is a button in the one toolbar, each with a chord in a `Map` from chord to verb, so adding a shortcut is adding a line.

`types.ts` names our own shapes and two walls — `Ast` and `Layout`, each with exactly one implementation named after the library it hides — plus `Diagram`, `Stylist`, `Workbench` and `Files`, where `interface` means methods and `type` means data. Every atomic type has a name: `NodeId[][]` reads on its own, `string[][]` needs a reference open beside it. Four runtime dependencies: a DOT parser, a layout algorithm, markdown-it, solid. No CSS framework, no state library, no icon package, no test framework beyond `bun test` plus a headless-Chrome `--dump-dom` harness for anything CSSOM. The ban that matters is not the dependency count; it is a library that changes the design, meaning a second DOT reader, a second layout engine, or a second UI framework. We hand-rolled markdown once, six regexes whose own comment called it "the second grammar we own" — nobody writes a markdown parser, they call one, and the same now goes for DOT.

What we refuse: no DOT parser *of our own*, because good ones exist and we call one. No CSS parser and no CSS algebra, because CSSOM is one and a rule that stays data never needs re-reading. No recovering a default by statistics, now that the tree says where it was written. No second layout engine, no config tab, no IDE. And the rule that governs every line, no "what if" — code written for a state nobody has observed is a debt someone else services. If it cannot happen, the types say so and the check is deleted; if it can and we choose not to serve it, the architecture says so and the code is deleted.

What we delayed, briefly, because each one is a real position and not an oversight. Deleting a row is not an undo: one entry per selector and property, so typing over the theme replaces it, and Load DOT is the reset (S10). A saved style document has a writer and a tested reader but no verb loads it (S11). The picture exports are verified by eye, because a harness for them cost more than it caught (V10). And annotations, labels, icons and edges carry classes and nothing else until a real request says what the values should be — so an `.icon` fills its node and a cluster label is invisible, and both stay that way on purpose. One debt we did pay: the reader used to cost us a 3.4 MB export and every style rule was a statistical guess, and replacing it retired both.