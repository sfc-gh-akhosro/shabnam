// SPIKE — can the picture export take its CSS straight from CSSOM?
//
// Not part of the app. Nothing here is imported by `src/`. Run it by pasting
// `probe()` into the console with the app open, or read the findings below and
// skip that.
//
// THE QUESTION
// The export currently inlines two strings: the raw text of `src/app.css`, and
// `Stylist.serialize()`. The first is 389 lines of which the picture can use about
// six selectors; the rest is toolbar, tabs and the export dialog. The idea was to
// drop it and read the Stylist's own sheet back instead — `#style-css` is driven
// through CSSOM only, so its `cssRules` are exactly the book.
//
//     [...sheet.cssRules].map((rule) => rule.cssText).join("\n")
//
// FINDING 1 — the mechanism is sound.
// 19 rules, 2446 bytes against 8427 for the combo. Zero chrome selectors leak in.
// No at-rules to think about. Custom properties survive verbatim, nested `var()`
// and all:
//
//     --paper-background: color-mix(in srgb, var(--primary-color) 10%, var(--theme-color))
//
// `cssText` hands back *declared* values, not computed ones, so the exported file
// stays re-themeable. That was the one thing worth checking and it passes.
//
// FINDING 2 — the premise does not hold. This is the useful part.
// Rendering a snapshot from the sheet alone loses the connectors, the arrowheads
// and the annotation, puts the cluster label in the wrong place, and reflows the
// node labels. Those six `app.css` rules are load-bearing. Diffing them against
// the book gives the whole gap — 15 declarations, four selectors:
//
//     #diagram-canvas   position: relative
//     #diagram-svg      position: absolute; inset: 0; width: 100%; height: 100%;
//                       overflow: visible; pointer-events: none
//     #annotation-html  position: absolute; inset: 0
//     .diagram          flex: 1 1 0%
//
// `.edge`, `.arrow` and `.shell` are already complete in the book — the connectors
// vanished only because `#diagram-svg` lost `position: absolute` and its size, so
// the whole SVG layer left the overlay and took the edges with it.
//
// WHAT THIS MEANS
// Every one of those 15 is scaffolding, not styling: it is how the three-layer
// stack of §3 is held together, not a decision anyone would want to theme. So the
// question the spike turns up is not "which serializer" — it is *where the
// scaffolding lives*. Four answers, in the order I would rank them:
//
//   1. Seed them as source 0 from code, before the theme. The book becomes
//      self-sufficient, `cssText` is then the whole story, and the plumbing stays
//      in `src/` where it belongs. A user can still override it at source 2,
//      which is how everything else already works.
//   2. Put them in `theme/basic-theme.json`. Simplest, but it hands structural
//      plumbing to a user-editable file.
//   3. A second small stylesheet inlined into both the page and the export. An
//      honest combo rather than an accidental one, but it is still a combo and it
//      adds a file.
//   4. Keep inlining `app.css` but extract only the six selectors. Rejected: a
//      hardcoded selector list is the fragile thing this was meant to remove.
//
// With (1) done, the export path loses `asset("app-css")`, and
// `Stylist.serialize()`, `sheet.serialize()`, `declarations()` and the `serialize`
// entry in `types.ts` can all go — seven methods back to six. Against that, about
// twelve lines of scaffolding data. Net deletion.

// OUTCOME — adopted, with the scaffolding handwritten into the theme.
// The 9 authored declarations (the 15 above are CSSOM's longhand expansion of
// `inset`, `padding` and `flex`) went into `theme/basic-theme.json` as source 0:
// `#diagram-canvas`, `#annotation-html, #diagram-svg`, `#diagram-svg`, and two
// more on `.diagram`. That is option 2 rather than option 1 — the theme is
// handwritten and the entries read naturally there, and a user overriding them is
// no different from a user overriding anything else.
//
// `Stylist.serialize()` now returns `cssText` off its own sheet and the export
// inlines that alone. Verified end to end through the Export Picture dialog: the
// file is 5.3 KB with 2705 bytes of CSS (was 8427), carries no chrome selector,
// and renders connectors, arrowheads, annotation, cluster label and shadows.
//
// Cost: `serialize()` is now DOM-bound, so the two pure tests that asserted on its
// hand-rolled text format are gone. `@apply` expansion is still covered directly
// through `resolve`, and the `!important` case is now asserted on the book.

export function probe(): void {
  const sheet = (document.getElementById("style-css") as HTMLStyleElement).sheet!;
  const css = [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
  console.log(`${sheet.cssRules.length} rules, ${css.length} bytes`);
  console.log(css);
}
