# Shabnam

This document tells the storyof the app from the perspective of a user-designer-architect persona. It is an interwoven story tells what the user/prsona wants to do, how they use the ui, might tell about major ui components (casual and scattered version of SolidJS components), Major types and interfaces involved (casual and scattered version of types.ts), talks about major libraries or major built-in algorithms that we implemented (brief version of app-architecture.md), etc.

Then as you can imagine, recreating our other "app defining files" types.ts, soldijs compoennts, major classes (that implement mentioned interfaces), major methods (that have logic), and architecture are consequential to this document. It explains Shabnam as it is (at the moment of closing ceremony) but might mentions briefly (while telling the story) the major technical debts as well (decisions that we delayed).

As you see, while very informal, it is the gateway to our app. 

This should be the most revealing for someone like "me" that "Oh! I got it this app does this in this way". LLM and most docs have tendency to cateate "technical" categorizations, being precisely accurate in saying although unclear what they are saying, and using jargo a lot. It is like a lawyer speaking: nobody can say he is wrong but noone can say what he is talking about.

I want it to be how "I" would explain it to my peers. Just the "cores" but wholestic, intersting, revealing, and focusing on parts that "define" this app.


# The story

This is a single page app:
- On the left (<main>) it has 
  - top bar for action buttons, 
  - and the main view is a canvas (#diagram-canvas) to draw our diagram in html/svg. 
- on the right (<aside>) we have tabs that user selects (DOT, style, annotation, and js for scripting). Tabs are similar to radio button functionality but designed to look tightly and .raised-shadow next to each other. Selecting one would make it .flat-shadow which gives like old radio button push look.

(indeed, we have bunch of "basic" components that we will develop and reuse):
- radio buttons: (raised and tight, active becomes flat).
- check boxes: (...)
- .glass, .paper, .row, .col
etc. 

The idea is that:
User draws the semantic of the graph in DOT (Bring Your Own Dot), style it here with css (but easier form), add annotation and script that is difficult in diagrams, and voila! you've got a beautiful technical diagram for your blog or research paper or ....

CLever theming and vry small styling classes and options makes working wiht style much more fun and less technical.

Then you can export it to SVG and PNG. 
- SVG uses foreign objcts. Just arrang it in foreign objct, then attach the <style> which comes from "CSSOM" printing all css we need. Since it is using this way the result is identical to html version. 
- user can choose to export in "transparent", which means just add #diagram-canvas to be trasparent background (on css rule added to end of <style> )


Shabnam does not compete with graphviz (vizjs), indeed we use it to build our DiagramModel, to traverse and do cssBagger (picking up the css rules) and feed our styleRuls. W ealso travrse diagramModel to get the node arrangemnt.

We have 3 representation of styles:
- our styleRules which is the source of truth for us.
- the browser CSSOM that we interact dirctly through add and remove rules (no css file or css text is used in styling the graphs, however for the chrome of the app we have app.css, which we keep it extrmely lean.)
- the ui .rows of .row in "style" tab view. It is user interaction.


type styleRules: Map(selector: string, Map(property, {value: string, source: 1 or 2, id: counter}))

to add a style (liek user entered in "style" ui tab or we read it from theme json file):
we add it to cssom, if it rejected, we attach .invalid to that .row, and do not enter it in our styleRules (since it is source of truth and that style is not applied).
If accepted, we add to styleRules.
To associate the rule, we have a counter that we use to get an ID and then give it to cssom, styleRules, and to the row id=#${counter}


Since DOT deines the semantic of the diagram, we religiously use DOT namings:
- subgraph <name> becomes .name class for all its membr nodes.
- subgraph cluster_... on top of that would have its box drawn as svg around member nodes.
- nodes gets .node class, if shape=record, instead it gets .record
Also we will have data-shape=<shape>
- nodes have their id so do the cluster_. like node `bq` bcomes `#bq` in html and css. Edge from bq to catalog becomes #bq_catalog
- all classes from styleRules will be as selectors too.

Let me answer the factual question first — I'll actually probe Graphviz rather than assert.Confirmed — no `rank` on nodes. One more probe on how subgraph rank constraints surface, since that's your future-release question.Two answers first, then the rewrite.

## 1. Is there a rank property? No — I checked

I ran `renderJSON` on a graph with `rank=same`, a cluster, nesting, and `rank=max`:

```
{"name":"grp_a","rank":"same","nodes":[5,6]}
{"name":"cluster_box","rank":"same","label":"Box","nodes":[7,8],"bb":"82,46,152,177"}
{"name":"deep","nodes":[9],"subgraphs":[3]}
{"name":"%1","rank":"max","nodes":[10]}
{"name":"a","pos":"27,126"}
{"name":"b","pos":"27,72"}
```

A node object has `pos` and no `rank` — the only `rank` keys in the whole blob sit on subgraph objects, and the only other match is `rankdir`. So the bucketing is not us ignoring a field Graphviz offers; the rank is genuinely implicit, recoverable only from coordinates. Your instinct was the right one to check, though: `xdot` output *does* carry rank information in some tools, just not here.

On local ranks, and this is useful for your subgraph plans — there are two halves, and they arrive separately:

- The effect is already baked into `pos`. `rank=same` on `c; d` puts them at the same `x` under `LR`, so our 2pt bucketing lands them in one `.rank` div for free. `rank=min/max/source/sink` likewise just moves the coordinates. We get the outcome without knowing the cause.
- The declaration survives verbatim on the subgraph object: `rank: "same"`, `rank: "max"`, next to `nodes: [gvid…]` and `subgraphs: [gvid…]` for nesting. Anonymous ones are named `%1`.

That second half is worth writing down, because it is one of the very few places Graphviz hands us the author's intent rather than its own computation — the whole reason M4 exists is that node attributes lose that. So a future release can style or draw *on the basis of a rank constraint* (a "these belong together" band, a sink lane), and read nesting depth from `subgraphs`, without a parser. Also note `bb` appears only on `cluster_*` subgraphs, which is why non-cluster subgraphs give classes and no box.

## 2. "clearance is a preference with a floor"

Clearance is how much empty space a route wants to keep between itself and a box it passes. Measured from CSS (`1em`), so your styling sets it.

The trouble is arithmetic: clearance `c` on both sides of a gutter `g` leaves `g - 2c`. At a 28px gutter, `1em` leaves zero — the corridor closes, and a strict router would answer "no route" and drop the edge. Since your CSS controls the gutter, you can close every corridor in the diagram by tightening a gap.

So the router degrades instead of refusing:

```ts
for (const inflate of [clearance, 0]) { … }   // try roomy, then touching
return [tail, tailStub, ...dogleg(…), headStub, head];   // last resort
```

- try the walk with obstacles inflated by the asked-for clearance,
- if nothing gets through, try again with none — allowed to graze boxes,
- if still nothing, emit a plain two-bend dog-leg, ignoring obstacles entirely.

The floor is that last line: the edge always draws. A diagram with a tight edge is worse than a pretty one, and a diagram missing an edge is a lie about the architecture.

---

## The rewrite

Continuing after your DOT-naming list.

Now the pipeline, and the thing to hold onto is that each stage has exactly one owner and nobody reaches past their own stage.

```
DOT → Vizer.render → VizJson → Diagram.bag → DiagramModel
        ├─ frame   → html ranks
        ├─ derived → styleRules @ source 1
        └─ after the browser paints: measure → clusters / shells / connectors → svg
```

`Vizer` is the only thing in the codebase that calls vizjs, and `bag` is the only thing that reads its JSON. Graphviz's output is genuinely strange — stringly-typed positions, `_draw_` arrays, subgraphs as index lists — and the point of `bag` is that the strangeness stops there. Everything downstream sees `DiagramModel`: nodes, edges, clusters, rankdir, numbers already numbers. `diagram/*` is pure, data in and data out, no DOM, which is why it tests as plain functions.

The app has exactly one `try/catch` and it wraps `renderJSON`, because DOT is syntactically broken on most keystrokes. It shows the message and leaves the last good picture standing. Everywhere else we fail loud.

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

A node is two layers, and the html layer owns the visible node: background, border and label are real CSS on a real div, in flow, measurable. The svg layer only draws chrome *around* the measured rectangle — a stroke-only shell, an icon badge, a caption strip. The skeleton order forces this: svg paints after html, so a filled shell would cover the very label it is decorating, and two text layers would print every node twice.

From Graphviz's layout we take two facts and nothing else: which rank a node is in, and its order inside that rank. There is no rank field in the JSON — I looked — so we recover it from `pos`: sort on one axis and open a new rank whenever a node sits more than 2 points from the one it would otherwise join. Exact equality would scatter one visual column across three divs, and 2 is safe because Graphviz never puts real ranks closer than about 36. The four `rankdir` values disagree about which coordinate is the key, which way ranks run, and which way nodes order inside one (Graphviz's `y` grows upward, the DOM's grows down), so that is a four-entry `Map` of data rather than four branches of code.

Everything else about the picture is CSS, and we once broke that rule on purpose to see what happened: we derived per-node spacing from the coordinates, and deleted it again, because it was the only number in the pipeline that was computed instead of passed through.

Which brings the important half. Graphviz's pixel sizes are thrown away entirely. The html goes out with no inline styles, the browser lays it out under whatever CSS is live at that moment, and only then does `measure` read the real boxes back with `getBoundingClientRect`. Every number the svg layer uses is that measurement. Put `font-size: 24px` on `.node` and the div grows; shells and edge endpoints computed from Graphviz's old numbers would detach, and every style change would need a Redraw to look right. Measured after paint, they simply stay glued.

Connectors are an ortho snake, and it works because we never search for free space — the layout already is a grid. The vertical corridors are the gutters between ranks, the horizontal ones are the gaps between rows, and a route alternates: out of a side, along a gutter, across a row gap, along the next gutter, into the destination side. A real diagram gives about eight vertical lines and twenty horizontal ones, so the walk is a few hundred steps; a visibility graph over obstacle edges would be an order of magnitude bigger to answer the same question. A bend costs about 240 pixels of straightness, deliberately a lot, because you read a connector by its corners and two turns saved is worth a long way round. And clearance is a preference with a floor: try the walk at the clearance CSS asks for, then try it grazing the boxes, then fall back to a dog-leg that ignores obstacles. Your CSS can close every corridor in the diagram by tightening a gap, and a tight edge beats a missing one.

On the style side, the one thing to add to the three representations above is where the rows come from before you touch them. A theme JSON is absorbed at source 0. Then `derived` recovers what the DOT implied — and note *recovers*, because Graphviz has already resolved `node [...]` defaults onto every member, so we take the most common value with ties broken lexicographically, which makes identical DOT produce an identical map in an identical order. A bare DOT derives only the `:root` token block and leaves presentation to the theme. Selectors are composed flat, `.cluster_x.node, .cluster_x.record`, because CSSOM has no nesting and there is one rule per selector.

`@apply` is ours, not CSS: a property whose value lists other selectors in the same map. It is expanded only at the moment of feeding CSSOM, at the position it appears, so the selector's own later properties win. Expansion is a read, never a write — an expanded declaration reaches the sheet and never becomes a row you did not type. Undefined name throws, cycle throws. And there is exactly one place a rule becomes text again, `serialize()`, called only by the exports, because an SVG file has to carry its own stylesheet.

Export is a wrapper, not a translation, and it is the decision I would most want understood. Save SVG clones the canvas into a `<foreignObject>` — SVG's own way of saying *this region is another language, go ask that engine* — so the file contains no shapes at all, and Chromium lays it out with the same engine that painted the screen. Shadows, gradients, `color-mix()`, text: correct by construction, including features nobody has invented yet. We built the alternative first, a real translator, boxes to `<rect>` and text to `<text>`, and deleted it. A translator is a dictionary with one entry per CSS feature, and this app ships a CSS editor, so users can always reach a property the dictionary lacks — and then the export quietly disagrees with the screen. Ours had already dropped shadows and per-side borders. The library everyone recommends, `dom-to-svg`, dropped every label in a record diagram when we measured it. The price we accept knowingly: the SVG opens in a browser and nowhere else, which is the use case.

Chromium only, and that is not a support matrix — it is a ban on compatibility code in `src/`. No fallbacks, no polyfills, no feature detection, no declining a platform feature because another engine is slow to it.

Five components, and one of them is the app. `Workbench` renders `main` beside `aside` straight into `body`, no root wrapper, and it is the only DOM owner — inject, wait for the paint, measure, place. `Tabs` is a radio strip that knows nothing about contents. The coding window is a bare `<textarea>` shared by the three text tabs: no highlighting, no completion, and it is not allowed to grow into an editor — CodeJar was on the stack and was removed, since it cost a library, a highlighter file, nine classes and a contenteditable div, and bought the diagram nothing. `Rows` is the style tab. `ExportDialog` is the one modal, asking SVG or PNG, and it exists because a file format stopped being a verb. State is signals and one store held by the workbench: no global store, no context, no router, no event bus. Every action is a button in the one toolbar, each with a chord in a `Map` from chord to verb, so adding a shortcut is adding a line.

`types.ts` is five interfaces — `Vizer`, `Diagram`, `Stylist`, `Workbench`, `Files` — where `interface` means methods and `type` means data. Two runtime dependencies, vizjs and solid. No CSS framework, no state library, no icon package, no test framework beyond `bun test` plus a headless-Chrome `--dump-dom` harness for anything CSSOM. The ban that matters is not the dependency count; it is a library that changes the design, meaning a second DOT reader, a second layout engine, or a second UI framework.

What we refuse: no DOT parser, because Graphviz is one. No CSS parser and no CSS algebra, because CSSOM is one and a rule that stays data never needs re-reading. No second layout engine, no config tab, no IDE. And the rule that governs every line, no "what if" — code written for a state nobody has observed is a debt someone else services. If it cannot happen, the types say so and the check is deleted; if it can and we choose not to serve it, the architecture says so and the code is deleted.

What we delayed, briefly, because each one is a real position and not an oversight. vizjs will be replaced by a real DOT AST plus our own layout maths, since Graphviz resolves defaults at parse time and no output format it offers says *where* an attribute was written — we measured all of them (M4). Deleting a row is not an undo: one entry per selector and property, so typing over the theme replaces it, and Load DOT is the reset (S10). A saved style document has a writer and a tested reader but no verb loads it (S11). Export HTML is about 3.4 MB because it carries vizjs, which is the price of depending on nothing (V6). The picture exports are verified by eye, because a harness for them cost more than it caught (V10). And annotations, labels, icons and edges carry classes and nothing else until a real request says what the values should be — so an `.icon` fills its node and a cluster label is invisible, and both stay that way on purpose.






