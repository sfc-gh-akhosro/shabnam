// The checks, running inside the page, next to the real app. They touch nothing
// but the DOM: the rows tab is driven the way a person drives it (set the box,
// dispatch the event the component listens for), and every assertion is read back
// off the live sheet or out of `getComputedStyle`. No app internals, so this
// cannot pass by agreeing with the Stylist about something wrong.
//
// The picture *files* are **not** covered here — see `docs/archive.md`, V10.
// Reading a download back out of headless Chrome needed a patched
// `URL.createObjectURL` and a clicked anchor, and it hung the suite under virtual
// time. "Does the file open and look right" is one glance from a human, and a
// harness that costs more than the thing it guards is not worth keeping.
//
// The export *dialog* is covered, because it is DOM and costs nothing: the three
// options are the ones the two old buttons hard-coded, and a wrong default is how a
// PNG came out on transparency with the theme's 10%-alpha borders invisible.
//
// The report leaves as base64 in `#test-report[data-report]`, which survives
// HTML serialization untouched. `run.ts` picks it up from there.

type Result = { name: string; ok: boolean; detail: string };

const results: Result[] = [];
const errors = (window as never as { TEST_ERRORS: string[] }).TEST_ERRORS;

function check(name: string, ok: boolean, detail: unknown): void {
  results.push({ name, ok, detail: String(detail) });
}

// `btoa` only speaks Latin-1, and a detail string can hold an arrow or an em
// dash, so the JSON is encoded as UTF-8 bytes first.
function base64(json: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(json)));
}

// Republished after every stage instead of once at the end. There is no `catch`
// here — if a stage throws, the page simply stops, and the report already in the
// DOM is what the dump carries out. The driver notices the missing stages.
function publish(stage: string): void {
  const report = document.getElementById("test-report") ?? document.body.appendChild(document.createElement("div"));
  report.id = "test-report";
  report.dataset.stage = stage;
  report.dataset.report = base64(JSON.stringify({ results, errors }));
}

// A crash is reported, not swallowed: the listener only flushes what has already
// been collected, so the driver prints the failing stage and the page's error.
addEventListener("unhandledrejection", () => publish("crashed"));

const $ = (selector: string) => document.querySelector(selector) as HTMLElement;
const $$ = (selector: string) => [...document.querySelectorAll(selector)] as HTMLElement[];
const tick = () => new Promise((done) => setTimeout(done, 30));

const sheet = () => ($("#style-css") as unknown as HTMLStyleElement).sheet!;
const cssTexts = () => [...sheet().cssRules].map((rule) => rule.cssText);
// One declaration off the live sheet: `""` when the selector has no such property,
// which is also what CSSOM reports for a rule block left empty by a removal.
const declaration = (selector: string, property: string) => {
  const rule = [...sheet().cssRules].find((one) => (one as CSSStyleRule).selectorText === selector);
  return rule === undefined ? "" : (rule as CSSStyleRule).style.getPropertyValue(property).trim();
};
const background = (id: string) => getComputedStyle($(`#${id}`)).backgroundColor;
const boxes = () => $$("#diagram-html .node").map((node) => JSON.stringify(node.getBoundingClientRect()));

/** Set a box and tell the component, the way a keystroke or a blur would. */
function type(box: HTMLElement, value: string, event: "input" | "change"): Promise<unknown> {
  (box as HTMLInputElement).value = value;
  box.dispatchEvent(new Event(event, { bubbles: true }));
  return tick();
}

/** Flip a checkbox the way a click does: the property, then the event. */
function flip(box: HTMLInputElement): Promise<unknown> {
  box.checked = !box.checked;
  box.dispatchEvent(new Event("change", { bubbles: true }));
  return tick();
}

type Field = "selector" | "property" | "value";

/** The row's three boxes, by the field each one edits. */
const box = (row: HTMLElement, field: Field) => row.querySelector(`input[name="${field}"]`) as HTMLInputElement;

const rows = () => $$("[data-tab=styles] .rows > .row");
// The annotation layer's marks, in document order.
const marks = () => $$("#annotation-html [data-selector]");
/** A box's centre in viewport coordinates, rounded the way the DOM reports it. */
const centre = (element: HTMLElement) => {
  const at = element.getBoundingClientRect();
  return { x: Math.round(at.left + at.width / 2), y: Math.round(at.top + at.height / 2) };
};
// A row is a rule when all three boxes say something and the book took it.
const ruleRows = () => rows().filter((row) => keyedRow(row) && !row.classList.contains("invalid"));
const blanks = () => rows().filter((row) => !keyedRow(row));
// The list always ends with an untouched blank row, and `.rows` is
// `column-reverse`, so the end of the list is the top of the screen. This is the
// row a person types into without asking for one first.
const blankRow = () => rows()[rows().length - 1]!;

// The tabs are a strip of radios; a label click is how a person picks one.
const tabs = () => $$("body > aside > .radios label");
const redrawButton = () => $('button[data-action="draw"]');
// The tab has no toolbar of its own: ➕ on a row opens another blank after it,
// and it is that row's last button.
const addRow = () => ([...blankRow().querySelectorAll("button")].pop() as HTMLElement).click();
// ❌ is the row's first button.
const dropRow = (row: HTMLElement) => (row.querySelector("button") as HTMLElement).click();

// Re-reads the book: showing the styles tab reads it again, which drops the
// list's own refused text and any extra blank.
async function resync(): Promise<void> {
  tabs()[0]!.click();
  await tick();
  tabs()[1]!.click();
  await tick();
}

// The notes tab is the same rows piece with its own columns. Its list reads
// top-down, so the waiting blank is the last row here as it is there — it is
// simply at the bottom of the pane rather than the top.
const markRows = () => $$(".rows.notes > .row");
const blankMarkRow = () => markRows()[markRows().length - 1]!;
const markBox = (row: HTMLElement, name: string) => row.querySelector(`input[name="${name}"]`) as HTMLInputElement;
/** Fill a whole note row, the way a person tabs through it. Addressed by
 *  position and re-read each time: filling the last row appends the next blank. */
async function fillMark(at: number, fields: Array<[name: string, value: string]>): Promise<void> {
  for (const [name, value] of fields) await type(markBox(markRows()[at]!, name), value, "change");
}

function smoke(): void {
  check("the workbench mounts", document.querySelector("body > main") !== null, tabs().length + " tabs");
  check(
    "four tabs, named as the design names them",
    tabs().map((tab) => tab.textContent).join(" ") === "DOT styles notes JS",
    tabs().map((tab) => tab.textContent).join(" "),
  );

  const nodes = $$("#diagram-html .node").length;
  const connectors = $$("#connector-paths *").length;
  check("the starter diagram draws", nodes === 3 && connectors > 0, `${nodes} nodes, ${connectors} connector parts`);
  check("the SVG layer is measured, not empty", $$("#node-shells *").length > 0, $$("#node-shells *").length);
}

function stylesheet(): void {
  check("the sink carries no CSS text", $("#style-css").textContent === "", JSON.stringify($("#style-css").textContent));
  check("the sheet has rules", sheet().cssRules.length > 0, `${sheet().cssRules.length} rules`);
  check("no @apply survives the feed", !cssTexts().join("").includes("@apply"), cssTexts().filter((t) => t.includes("apply")).length);
  const painted = [...sheet().cssRules].map((rule) => (rule as CSSStyleRule).selectorText);
  const leaked = [".paper", ".glass", ".row", ".col"].filter((name) => painted.includes(name));
  check("the theme's mixins never reach the sheet, so its `.row` cannot reach the chrome", leaked.length === 0, leaked.join(" ") || "none");

  const nodeBg = background("core");
  check("the theme paints a node", nodeBg !== "rgba(0, 0, 0, 0)" && nodeBg !== "", nodeBg);
  const token = getComputedStyle(document.getElementById("diagram-canvas")!).getPropertyValue("--primary-color");
  check("theme tokens reach the canvas", token.trim() !== "", token);
}

async function rowsTab(): Promise<void> {
  tabs()[1]!.click();
  await tick();

  const sources = rows().reduce<Record<string, number>>((count, row) => {
    const source = row.dataset.source!;
    return { ...count, [source]: (count[source] ?? 0) + 1 };
  }, {});
  check("the styles tab lists the book, source-tagged", rows().length > 0 && sources["0"]! > 0, JSON.stringify(sources));

  // The whole point of one book: the theme and the DOT both write
  // `#diagram-canvas, svg` and `.node`, and a repeated key is an overwrite — so
  // it cannot be two rows.
  const keys = ruleRows().map((row) => `${box(row, "selector").value}\u0000${box(row, "property").value}`);
  const repeated = keys.filter((key, at) => keys.indexOf(key) !== at);
  check("no rule appears twice", repeated.length === 0, repeated.length === 0 ? `${keys.length} rows, all distinct` : JSON.stringify(repeated));

  const tokens = rows().filter((row) => box(row, "selector").value === "#diagram-canvas, svg");
  check("the token block is one run of rows", tokens.length > 0, `${tokens.length} token rows`);

  // Every row wears its key as `data-` hooks, the pair CSSOM finds a style by.
  // The waiting blank is not in the book, and its hooks are empty.
  const hooked = ruleRows().every((row) => row.dataset.selector === box(row, "selector").value && row.dataset.property === box(row, "property").value);
  check("every rule row carries its selector and property", hooked, ruleRows().slice(0, 2).map((row) => `${row.dataset.selector} ${row.dataset.property}`).join(" · ") + " …");

  check(
    "one blank row waits at the end of the list, which is the top of the screen",
    blanks().length === 1 && blanks()[0] === blankRow(),
    `${blanks().length} blank`,
  );

  // Every row is editable now: there is no layer beneath one for it to shadow.
  const editable = rows().every((row) => !box(row, "selector").readOnly && !box(row, "value").readOnly);
  check("no row is read-only", editable, `${rows().length} rows checked`);
}

/** True when all three boxes say something — i.e. the row is a rule, not a blank. */
function keyedRow(row: HTMLElement): boolean {
  return box(row, "selector").value !== "" && box(row, "property").value !== "" && box(row, "value").value !== "";
}

/**
 * The waiting blank, and what ❌ means.
 *
 * Typing into the blank is how a rule is added — there is no "add row" step — and
 * filling it in must put the next blank there, or the top of the list would be
 * occupied and the next rule would need a click first. The typed row stays the
 * same element: the list is patched in place, so tabbing on keeps the caret.
 *
 * ❌ takes the rule out of the book, out of CSSOM, and out of the list at once.
 */
async function blankRowFlow(): Promise<void> {
  tabs()[1]!.click();
  await tick();

  const before = rows().length;
  const typed = blankRow();
  await type(box(typed, "selector"), ".scratch-flow", "change");
  await type(box(typed, "property"), "opacity", "change");
  await type(box(typed, "value"), "0.5", "change");

  check("filling the blank row adds the rule", declaration(".scratch-flow", "opacity") === "0.5", `opacity: ${declaration(".scratch-flow", "opacity")}`);
  check(
    "and puts a fresh blank after it, in the same element it was typed in",
    rows().length === before + 1 && blankRow() !== typed && rows()[before - 1] === typed && !keyedRow(blankRow()),
    `${before} → ${rows().length}, last is ${blankRow() === typed ? "the typed row" : "blank"}`,
  );
  check("the row wears its key", typed.dataset.selector === ".scratch-flow" && typed.dataset.property === "opacity", `${typed.dataset.selector} ${typed.dataset.property}`);

  dropRow(typed);
  await tick();
  check("❌ takes the row out of the list", rows().length === before && !rows().some((row) => box(row, "selector").value === ".scratch-flow"), `${rows().length} rows`);
  // The declaration goes; the selector's own rule block stays behind, empty. So
  // the question is whether the property is still painted, not whether the
  // selector is still mentioned.
  check("❌ took the declaration out of the sheet", declaration(".scratch-flow", "opacity") === "", `opacity="${declaration(".scratch-flow", "opacity")}"`);

  await resync();
  check("a re-read agrees, and leaves exactly one blank waiting", rows().length === before && blanks().length === 1, `${rows().length} rows, ${blanks().length} blank`);

  // ➕ is the only way to get a second blank, and a re-read takes it back.
  addRow();
  await tick();
  const two = blanks().length;
  await resync();
  check("➕ opens another blank, and a re-read settles back to one", two === 2 && blanks().length === 1, `${two} → ${blanks().length}`);
}

/**
 * The annotation tab: rows in, marks out.
 *
 * Every assertion is read off the live DOM, so this is the anchoring contract of
 * §4 end to end — the row is typed, the sink is derived, `place()` publishes
 * `--anchor-x` / `--anchor-y`, and CSS spends them in `calc()`. Nothing here
 * touches the annotation model directly.
 *
 * It runs before any styles row is typed, because the ported checks measure the
 * starter's own geometry and a stray `padding` on `#core` would move it.
 */
async function annotations(): Promise<void> {
  tabs()[2]!.click();
  await tick();

  // Two starter marks, and the blank waiting under them. A mark is added by
  // typing, exactly as a rule is.
  check(
    "the annotation tab lists the starter marks, plus a waiting blank",
    markRows().length === 3 && marks().length === 2,
    `${markRows().length} rows, ${marks().length} marks`,
  );
  check(
    "a row is a typed selector, not markup",
    markBox(markRows()[0]!, "selector").value === "#core" && markBox(markRows()[0]!, "dy").value === "4em",
    `${markBox(markRows()[0]!, "selector").value} dy=${markBox(markRows()[0]!, "dy").value}`,
  );
  const shownAreas = $$("aside textarea").filter((area) => area.offsetParent !== null);
  check("and no textarea is in sight", shownAreas.length === 0, shownAreas.length);

  // `4em` is the theme's, not ours, and `em` here is the mark's own font size —
  // so the expectation resolves the length off the mark rather than hard-coding
  // a pixel count.
  const mark = marks()[0]!;
  const anchored = $(mark.dataset.selector!);
  const em = parseFloat(getComputedStyle(mark).fontSize);
  const node = centre(anchored);
  const want = { x: node.x, y: Math.round(node.y + 4 * em) };
  const got = centre(mark);
  check(
    "a mark's centre lands on its selector's centre, plus a length CSS resolved",
    getComputedStyle(mark).position === "absolute" && got.x === want.x && got.y === want.y,
    `${JSON.stringify(got)} vs ${JSON.stringify(want)} at ${em}px/em`,
  );

  // The origin, which is not a special case in the code: the layer is a thing a
  // selector can match, so its centre less half of itself is its corner. This is
  // the only check that would notice `place()` growing a branch for it.
  const second = marks()[1]!;
  const layer = $("#annotation-html").getBoundingClientRect();
  const corner = centre(second);
  check(
    "a mark selecting the layer itself measures from the drawing's corner",
    corner.x === Math.round(layer.left + em) && corner.y === Math.round(layer.top + em),
    `${JSON.stringify(corner)} vs ${JSON.stringify({ x: Math.round(layer.left + em), y: Math.round(layer.top + em) })}`,
  );

  // Pass-through, proved in the one unit we could never have added ourselves: a
  // percentage resolves against the containing block, which is the annotation
  // layer. It also proves the offset is live CSS — no redraw, no `place()`.
  await type(markBox(markRows()[0]!, "dx"), "50%", "change");
  const shifted = centre(marks()[0]!).x - got.x;
  await type(markBox(markRows()[0]!, "dx"), "", "change");
  check(
    "a percentage offset resolves against the layer",
    shifted === Math.round(layer.width / 2),
    `${shifted}px of ${layer.width}px`,
  );

  // `data-selector` is run as a selector, so it can match more than one thing,
  // and then the anchor is the box containing all of them. Typed into the waiting
  // blank, and no Redraw: a row edit is the short path (§5).
  await fillMark(markRows().length - 1, [["selector", ".node"], ["text", "every node"]]);
  const many = marks()[2]!;
  const rects = $$("#diagram-html .node").map((one) => one.getBoundingClientRect());
  const union = {
    x: Math.round((Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2),
    y: Math.round((Math.min(...rects.map((r) => r.top)) + Math.max(...rects.map((r) => r.bottom))) / 2),
  };
  const centred = centre(many);
  check(
    "a selector matching many anchors to the box that holds them all",
    centred.x === union.x && centred.y === union.y,
    `${JSON.stringify(centred)} vs ${JSON.stringify(union)} over ${rects.length} nodes`,
  );
  check("and the edit reached the sink with no Redraw", marks().length === 3, `${marks().length} marks`);

  // The gate, and the reason it is a gate rather than politeness: an empty
  // selector reaching `querySelectorAll` throws `SyntaxError`. The suite's last
  // check fails on any console error, so this passing quietly is the assertion.
  await type(markBox(blankMarkRow(), "text"), "text but no selector", "change");
  check(
    "a row with no selector emits nothing rather than throwing",
    marks().length === 3,
    `${marks().length} marks, ${markRows().length} rows`,
  );

  // Markdown, in block mode, and the one line-break convention (§7).
  await fillMark(markRows().length - 1, [["selector", "#app"], ["text", "**bold**\\nsecond"], ["class", "note"]]);
  const rich = marks()[3]!;
  check(
    "markdown and `\\n` survive into a mark",
    rich.innerHTML.includes("<strong>bold</strong>") && rich.innerHTML.includes("<br"),
    rich.innerHTML,
  );
  check("and the class column reaches the element", rich.classList.contains("note"), rich.className);

  // ❌ removes the entry outright: the list is the model, so there is no second
  // opinion for a hidden row to hold.
  const before = markRows().length;
  dropRow(markRows()[3]!);
  await tick();
  dropRow(markRows()[2]!);
  await tick();
  check(
    "❌ takes the row and its mark away",
    markRows().length === before - 2 && marks().length === 2,
    `${before} → ${markRows().length} rows, ${marks().length} marks`,
  );
}

/** The whole point of the rewrite: one `setProperty`, no redraw, no re-layout. */
async function liveRepaint(): Promise<void> {
  const before = background("core");
  const layout = boxes();
  const ruleCount = sheet().cssRules.length;

  // The blank is already waiting at the end of the list, so a rule is added by
  // typing, not by asking for a row first.
  const row = blankRow();
  await type(box(row, "selector"), ".node", "change");
  await type(box(row, "property"), "background", "change");
  await type(box(row, "value"), "#ff0000", "change");

  const painted = $$("#diagram-html .node").map((node) => getComputedStyle(node).backgroundColor);
  check("a user row repaints live, with no redraw", painted.every((colour) => colour === "rgb(255, 0, 0)"), JSON.stringify(painted));
  check("the repaint did not re-layout", JSON.stringify(boxes()) === JSON.stringify(layout), boxes().length + " boxes compared");
  check("the sheet gained no rule for a known selector", sheet().cssRules.length === ruleCount, `${ruleCount} → ${sheet().cssRules.length}`);

  dropRow(row);
  await tick();
  // Delete is not revert — but the theme says `.node { @apply .paper }`, and what
  // `feed` paints is the expansion, so removing the row falls back to what
  // `.paper` supplies rather than to nothing.
  check("removing a row falls back to what @apply supplies", background("core") === before, `${background("core")} vs ${before}`);
}

/** The source guard, end to end: a redraw must not take a typed row back.
 *
 *  The scratch key is `--primary-color` on purpose — the theme owns it, and a
 *  silent DOT no longer invents a competing source-1 row. The user write is
 *  still refused a take-back, because an add at source 1 cannot beat source 2.
 *  The row is left standing at the end: deleting it would take the theme's
 *  entry with it, which is the design (§1) and not something to do behind a
 *  later stage's back. */
async function survivesRedraw(): Promise<void> {
  const token = () =>
    getComputedStyle(document.getElementById("diagram-canvas")!)
      .getPropertyValue("--primary-color")
      .trim();
  const derived = token();

  const row = blankRow();
  await type(box(row, "selector"), "#diagram-canvas, svg", "change");
  await type(box(row, "property"), "--primary-color", "change");
  await type(box(row, "value"), "#ff00ff", "change");
  check("a user row overwrites the theme token", token() === "#ff00ff", `${derived} → ${token()}`);

  await resync();
  const mine = rows().filter((one) => box(one, "property").value === "--primary-color");
  const detail = mine.map((one) => `${one.dataset.selector}:${one.dataset.source}:${box(one, "value").value}`).join(" ");
  check("the overwrite is one row, not two", mine.length === 1, detail);
  check("and it is the user's row now", mine[0]!.dataset.source === "2", detail);

  // A redraw adds the DOT's tokens at source 1 *before* the pipeline ever
  // waits for a frame, so the guard is observable without waiting for the whole
  // draw to land.
  redrawButton().click();
  await tick();
  check("a redraw does not take the row back", token() === "#ff00ff", token());
}

async function applyAndResync(): Promise<void> {
  // A scratch selector nothing else owns: removing this row must not take a
  // theme rule down with it, because delete is not revert (§1).
  const row = blankRow();
  await type(box(row, "selector"), ".scratch", "change");
  await type(box(row, "property"), "@apply", "change");
  await type(box(row, "value"), ".glass", "change");

  check("an @apply row feeds without leaking @apply", !cssTexts().join("").includes("@apply"), `${sheet().cssRules.length} rules`);
  check("and `.glass`, now applied, stays out of the sheet", !cssTexts().some((text) => text.startsWith(".glass ")), `${sheet().cssRules.length} rules`);
  dropRow(row);
  await tick();
  await resync();
  check("the dropped @apply row is gone from the list", !rows().some((one) => box(one, "selector").value === ".scratch"), `${rows().length} rows`);

  // `@apply` only names what the book already has, so a typo is refused like
  // an invalid value: the row is marked and nothing is written.
  const unknown = blankRow();
  const before = errors.length;
  await type(box(unknown, "selector"), ".scratch-apply", "change");
  await type(box(unknown, "property"), "@apply", "change");
  await type(box(unknown, "value"), ".nowhere", "change");
  check("an @apply of an unknown selector is refused and marks the row", unknown.classList.contains("invalid") && !cssTexts().join("").includes("scratch-apply"), unknown.className);
  dropRow(unknown);
  errors.splice(before, errors.length - before);
  await tick();
  await resync();
}

/**
 * `!important`, and what happens to a value CSSOM will not take.
 *
 * `setProperty` takes priority as its third argument, so a value still carrying
 * `!important` is not a valid value of anything and the declaration is dropped in
 * silence. The proof has to be a fight the row can only win by priority: `#core`
 * beats `.node` on specificity, so the `.node` row wins here or `!important`
 * never reached CSSOM.
 *
 * An unsupported value is **not written at all**, so the interesting case is a
 * row that already holds a good one: the sheet must still hold it afterwards.
 * That is why the invalid value is typed over `#core`'s `10px` rather than into a
 * fresh row — a blank row has no last good value to keep.
 *
 * The rejected row logs, on purpose, and the last check of the suite fails on any
 * console error — so this stage takes its own expected lines back out of `errors`
 * rather than muting the channel.
 */
async function importantAndInvalid(): Promise<void> {
  tabs()[1]!.click();
  await tick();

  const padding = () => getComputedStyle($("#core")).paddingTop;

  const specific = blankRow();
  await type(box(specific, "selector"), "#core", "change");
  await type(box(specific, "property"), "padding", "change");
  await type(box(specific, "value"), "10px", "change");
  check("an #id row outranks a class row", padding() === "10px", padding());

  const shout = blankRow();
  await type(box(shout, "selector"), ".node", "change");
  await type(box(shout, "property"), "padding", "change");
  await type(box(shout, "value"), "0 !important", "change");
  check("!important reaches CSSOM as a priority", padding() === "0px", `padding: ${padding()}`);
  check(
    "and the book keeps the value as typed",
    box(shout, "value").value === "0 !important" && !shout.classList.contains("invalid"),
    `"${box(shout, "value").value}" invalid=${shout.classList.contains("invalid")}`,
  );

  // The refusal, over a row that already says something. `0px0` is the old
  // trap — unparseable, and dropped in silence by `setProperty` — so before this
  // session it reached the book and took `10px` down with it.
  const before = errors.length;
  await type(box(specific, "value"), "0px0", "change");
  check("a value CSSOM rejects marks the row", specific.classList.contains("invalid"), specific.className);
  check("and never reaches the sheet", declaration("#core", "padding") === "10px", `padding: "${declaration("#core", "padding")}"`);
  check("so the row keeps the text and the book keeps the value", box(specific, "value").value === "0px0", `"${box(specific, "value").value}"`);
  check("and it says so once, in the console", errors.length === before + 1, JSON.stringify(errors.slice(before)));

  // A brand-new row that is invalid from the start has nothing to keep, so what
  // it must not do is enter the book at all.
  const bad = blankRow();
  await type(box(bad, "selector"), ".scratch-bad", "change");
  await type(box(bad, "property"), "margin", "change");
  await type(box(bad, "value"), "0px0", "change");
  check("an invalid new row enters neither the book nor the sheet", bad.classList.contains("invalid") && !cssTexts().join("").includes("scratch-bad"), bad.className);

  await type(box(bad, "value"), "0px", "change");
  check("fixing the value clears the mark and adds the rule", !bad.classList.contains("invalid") && declaration(".scratch-bad", "margin") === "0px", `${bad.className} margin: "${declaration(".scratch-bad", "margin")}"`);

  // The premise the DOT reader's one correction rests on (§3.1): a Graphviz
  // length is a bare number, and a bare non-zero number is not a CSS `<length>`.
  // So `fontsize=12` was reaching CSSOM as `font-size: 12`, being refused here,
  // and never painting — which is why `styles.ts` appends `px`. Probed rather
  // than remembered, because the whole law is downstream of this one answer.
  const unitless = blankRow();
  await type(box(unitless, "selector"), ".scratch-unit", "change");
  await type(box(unitless, "property"), "font-size", "change");
  await type(box(unitless, "value"), "12", "change");
  check("CSSOM refuses a unitless length, which is why the reader adds `px`", unitless.classList.contains("invalid") && !cssTexts().join("").includes("scratch-unit"), `invalid=${unitless.classList.contains("invalid")}`);

  await type(box(unitless, "value"), "12px", "change");
  check("and takes the same number with a unit", !unitless.classList.contains("invalid") && declaration(".scratch-unit", "font-size") === "12px", `font-size: "${declaration(".scratch-unit", "font-size")}"`);

  // Expected, and already asserted. Out of the list so the suite's last check
  // still means "nothing went wrong that we did not ask for".
  errors.splice(before, errors.length - before);

  // Last first: ❌ patches the list in place, so the rows below a dropped one
  // move up, and a held element is only still that row if nothing above it went.
  dropRow(unitless);
  dropRow(bad);
  dropRow(shout);
  dropRow(specific);
  await tick();
  check("the scratch rows leave no padding behind", padding() === getComputedStyle($("#app")).paddingTop, padding());
}

// Clicks Redraw and checks the picture is still whole. It does not wait for the
// draw to finish: under `--virtual-time-budget` a poll loop fast-forwards the
// page's clock and the run gets cut off wherever it happens to be, so this stage
// stays cheap on purpose (debt S3).
/**
 * The export dialog: format, transparency, scale.
 *
 * No file is produced — a download hangs this harness (see the header). What is
 * checked is that the controls exist, carry the right opening state, and that the
 * one control that is conditional becomes so.
 */
async function exportDialog(): Promise<void> {
  const dialog = $("dialog") as HTMLDialogElement;
  const radio = (name: string) => $$(`dialog input[name="${name}"]`) as HTMLInputElement[];
  const scale = () => $('dialog input[type="number"]') as HTMLInputElement;
  const transparent = () => $('dialog input[type="checkbox"]') as HTMLInputElement;

  check("the dialog starts closed", !dialog.open, dialog.open);

  $('button[data-action="export-picture"]').click();
  await tick();
  check("the Export button opens it", dialog.open, dialog.open);

  const svg = radio("format").find((one) => one.value === "svg")!;
  check("it opens on SVG", svg.checked, svg.checked);

  // Transparency is one rule appended to the book, and it is on by default: these
  // are architecture diagrams, and one that drops onto any slide is the useful one.
  check("transparent is on by default", transparent().checked, transparent().checked);
  check("scale is inapplicable to SVG", scale().disabled, scale().disabled);
  check("there is no margin control", $$("#export-margin").length === 0, $$("#export-margin").length);
  check("and no paper control", radio("paper").length === 0, radio("paper").length);

  const png = radio("format").find((one) => one.value === "png")!;
  await flip(png);
  check("choosing PNG enables scale", !scale().disabled, scale().disabled);
  check("at 3x", scale().value === "3", scale().value);

  // A typed value is the user's, and stays the user's — switching format
  // disables the box, and never reaches in to overwrite what you typed.
  await type(scale(), "1", "input");
  check("scale takes a value", scale().value === "1", scale().value);
  await flip(svg);
  await flip(png);
  check("switching format leaves it alone", scale().value === "1", scale().value);

  // Escape and the backdrop are the browser's; Cancel is ours, and it must not
  // leave a modal open over the rest of the suite.
  ($('dialog button[value="cancel"]') as HTMLButtonElement).click();
  await tick();
  check("Cancel closes it", !dialog.open, dialog.open);
}

async function redrawStillWorks(): Promise<void> {
  tabs()[0]!.click();
  await tick();
  redrawButton().click();
  await tick();
  const nodes = $$("#diagram-html .node").length;
  const connectors = $$("#connector-paths *").length;
  check("Redraw still draws the picture", nodes === 3 && connectors > 0, `${nodes} nodes, ${connectors} connector parts`);
}

/**
 * A text tab never live-updates (§5).
 *
 * The textarea's `onInput` writes the store and nothing else; the store is read
 * at `redraw()`. So the picture is exactly as stale as the last Redraw, which is
 * what keeps the one conductor the one trigger — a reactive redraw here could
 * interleave two draws across the paint each one waits for.
 *
 * Runs last, because it leaves a different diagram on the canvas. `core` stays in
 * the DOT: a starter annotation anchors to `#core`, and a selector matching
 * nothing throws (§4).
 */
async function textTabsWaitForRedraw(): Promise<void> {
  tabs()[0]!.click();
  await tick();

  const area = $("[data-tab=dot] > textarea") as HTMLTextAreaElement;
  const drawn = () => $$("#diagram-html .node").length;
  const before = drawn();

  await type(area, "digraph { rankdir=LR core -> app -> sink -> extra }", "input");
  check("typing in the DOT tab draws nothing", drawn() === before, `${before} → ${drawn()} nodes`);

  redrawButton().click();
  for (let waited = 0; waited < 200 && drawn() !== 4; waited += 1) await tick();
  check("and Redraw is what draws it", drawn() === 4, `${drawn()} nodes`);
}

/**
 * The one sanctioned catch (§5): malformed DOT shows the parser's message and
 * leaves the last picture standing. `alert` is that message; a real dialog
 * would hang this page, so the harness records the call.
 */
async function parseKeepsThePicture(): Promise<void> {
  const shown: string[] = [];
  window.alert = (message?: string) => {
    shown.push(String(message));
  };

  const area = $("[data-tab=dot] > textarea") as HTMLTextAreaElement;
  const drawn = () => $$("#diagram-html .node").length;
  const before = drawn();

  await type(area, "digraph { a ->", "input");
  redrawButton().click();
  await tick();

  check("malformed DOT does not wipe the picture", drawn() === before, `${before} → ${drawn()} nodes`);
  check(
    "and the parser's message is shown",
    shown.length === 1 && shown[0]!.length > 0,
    JSON.stringify(shown),
  );
}

// The workbench's first draw starts on construction, so wait for the picture
// rather than for a timer.
async function mounted(): Promise<void> {
  // The SVG layer is injected a frame after the HTML, so waiting on a node would
  // read the picture half-drawn. Connectors are the last thing the pipeline puts
  // down.
  for (let waited = 0; waited < 200; waited += 1) {
    if ($$("#connector-paths *").length > 0) return;
    await tick();
  }
  throw new Error("the diagram never drew");
}

/**
 * The three source checks. View state only: hiding a source must not touch
 * the book, and — the trap this is really here for — must not renumber the rows.
 * Every edit verb addresses a row by its position in the book, so if the filter
 * renumbered them, editing the first visible row would write to whatever row
 * happens to sit at index 0 of the book instead.
 *
 * Synchronous throughout: a check publishes a topic, and the list re-renders in
 * the same turn. Nothing here waits for a frame.
 */
async function sourceFilter(): Promise<void> {
  tabs()[1]!.click();
  await tick();

  const source = (name: string) => $(`[data-tab=styles] .checks input[value="${name}"]`) as HTMLInputElement;
  const themeBox = source("theme");
  const dotBox = source("dot");
  const userBox = source("user");
  check("the styles tab has one checkbox per source", themeBox !== null && dotBox !== null && userBox !== null, "three boxes");

  // Starter DOT is pure markup, so there are no source-1 rows. A user scratch
  // rule has to exist first, or hiding the theme leaves only the waiting blank
  // and `probe()` throws.
  const scratch = blankRow();
  await type(box(scratch, "selector"), ".scratch-filter", "change");
  await type(box(scratch, "property"), "opacity", "change");
  await type(box(scratch, "value"), "0.9", "change");

  const all = rows().length;
  const themeRows = rows().filter((row) => row.dataset.source === "0").length;
  const painted = cssTexts().length;

  await flip(themeBox);
  check("unchecking a source hides its rows", rows().length === all - themeRows, `${all} → ${rows().length}`);  check("and hides only that source", rows().every((row) => row.dataset.source !== "0"), JSON.stringify(rows().map((row) => row.dataset.source)));
  check("hiding a source paints nothing", cssTexts().length === painted, `${painted} rules, unchanged`);

  // The off-by-index trap. With the theme hidden, the visible rules sit some way
  // into the list, so typing into one must land on that rule and no other. The
  // last *rule* row, not the last row — the last row is the waiting blank, and
  // typing into that would add a rule rather than edit one. Not `--primary-color`
  // either: the guard stage below needs that one to still be the theme's. A row
  // the filter excludes is not rendered at all, so `ruleRows()` is already "the
  // rules on screen".
  const probe = () => ruleRows()[ruleRows().length - 1]!;
  const selector = box(probe(), "selector").value;
  const property = box(probe(), "property").value;
  const original = box(probe(), "value").value;
  // `initial`, not a length. The probe is whichever rule happens to be last, so
  // its property is not known here — typing `1px` passed only as long as that
  // property accepted a length, and quietly became a console error (and so a
  // suite failure) the day a `text-align` rule landed at the end of the list. A
  // CSS-wide keyword is valid for every property, which is what this check needs:
  // it is asserting *where* the write lands, not what the value means.
  await type(box(probe(), "value"), "initial", "change");
  check(
    "editing a row under a filter writes to that row",
    box(probe(), "selector").value === selector && box(probe(), "property").value === property && box(probe(), "value").value === "initial",
    `${selector} ${property}: ${box(probe(), "value").value}`,
  );

  await type(box(probe(), "value"), original, "change");
  await flip(themeBox);
  check("re-checking a source brings its rows back", rows().length === all, `${rows().length} of ${all}`);

  dropRow(scratch);
  await tick();
  await resync();
}

await mounted();
smoke();
publish("smoke");
stylesheet();
publish("stylesheet");
await annotations();
publish("annotations");
await rowsTab();
publish("rows");
await blankRowFlow();
publish("blank");
await sourceFilter();
publish("filter");
await liveRepaint();
publish("repaint");
await survivesRedraw();
publish("guard");
await applyAndResync();
publish("apply");
await importantAndInvalid();
publish("important");
await exportDialog();
publish("export");
await redrawStillWorks();
publish("redraw");
await textTabsWaitForRedraw();
publish("stale");
await parseKeepsThePicture();
check("no console or uncaught errors", errors.length === 0, JSON.stringify(errors));
publish("done");
