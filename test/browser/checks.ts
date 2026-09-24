// The checks, running inside the page, next to the real app. They touch nothing
// but the DOM: the rows tab is driven the way a person drives it (set the box,
// dispatch the event the component listens for), and every assertion is read
// back off the live sheet or out of `getComputedStyle`. No app internals, so
// this cannot pass by agreeing with the Stylist about something wrong.
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

/** The prototype's box names (`index.html`): selector, property, value. */
const FIELD = new Map<Field, string>([
  ["selector", ".sel"],
  ["property", ".prop"],
  ["value", ".val"],
]);

const rows = () => $$(".rows > .row");
// A dropped row is hidden, not removed (§4), so "what the user can see" and "what
// is in the list" are now two different questions.
const live = () => rows().filter((row) => !row.hasAttribute("hidden"));
// Only a row that reached the book carries an id, so this is "the rules".
const ruleRows = () => rows().filter((row) => row.id !== "");
// The list always ends with an untouched blank row, and `.rows` is
// `column-reverse`, so the end of the list is the top of the screen. This is the
// row a person types into without asking for one first.
const blankRow = () => rows()[rows().length - 1]!;

// The shell carries no hook of its own now: the tabs are the aside's nav, and
// Redraw is the first button in the main toolbar.
const tabs = () => $$("body > aside > nav button");
const redrawButton = () => $("body > main > nav button");
// The tab has no toolbar of its own: ➕ on a row opens another blank after it,
// and it is that row's last button.
const addRow = () => ([...blankRow().querySelectorAll("button")].pop() as HTMLElement).click();
// ❌ is the row's first button.
const dropRow = (row: HTMLElement) => (row.querySelector("button") as HTMLElement).click();

// Re-reads the book, synchronously. `Rows` is behind a `Show`, so leaving the tab
// unmounts it and coming back runs its effect again — which is the book, not the
// list's own optimistic copy of it. This replaces what Cleanup used to give the
// harness: a sync path that needs no frame (debt S9).
async function resync(): Promise<void> {
  tabs()[0]!.click();
  await tick();
  tabs()[1]!.click();
  await tick();
}

const box = (row: HTMLElement, field: Field) =>
  row.querySelector(FIELD.get(field)!) as HTMLInputElement;

function smoke(): void {
  check("the workbench mounts", document.querySelector("body > main") !== null, tabs().length + " tabs");
  check(
    "four tabs, named as the spec names them",
    tabs().map((tab) => tab.textContent).join(" ") ===
      "diagram.dot styles annotation.html action.js",
    tabs().map((tab) => tab.textContent).join(" "),
  );

  const nodes = $$("#diagram-html .node").length;
  const connectors = $$("#connector-paths *").length;
  check("the starter diagram draws", nodes === 3 && connectors > 0, `${nodes} nodes, ${connectors} connector parts`);
  check("the SVG layer is measured, not empty", $$("#node-shells *").length > 0, $$("#node-shells *").length);
  check("the annotation is placed", $("#annotation-html div") !== null, $("#annotation-html").innerHTML.length);
}

function stylesheet(): void {
  check("the sink carries no CSS text", $("#style-css").textContent === "", JSON.stringify($("#style-css").textContent));
  check("the sheet has rules", sheet().cssRules.length > 0, `${sheet().cssRules.length} rules`);
  check("no @apply survives the feed", !cssTexts().join("").includes("@apply"), cssTexts().filter((t) => t.includes("apply")).length);

  const nodeBg = background("core");
  check("the theme paints a node", nodeBg !== "rgba(0, 0, 0, 0)" && nodeBg !== "", nodeBg);
  const token = getComputedStyle(document.documentElement).getPropertyValue("--primary-color");
  check("derived tokens reach :root", token.trim() !== "", token);
}

async function rowsTab(): Promise<void> {
  tabs()[1]!.click();
  await tick();

  const sources = rows().reduce<Record<string, number>>((count, row) => {
    const source = row.dataset.source!;
    return { ...count, [source]: (count[source] ?? 0) + 1 };
  }, {});
  check("the styles tab lists the book, source-tagged", rows().length > 0 && sources["0"]! > 0 && sources["1"]! > 0, JSON.stringify(sources));

  // The whole point of one book: the theme and the DOT both write `:root, svg`
  // and `.node`, and a repeated key is an overwrite — so it cannot be two rows.
  const keys = ruleRows().map((row) => `${box(row, "selector").value}\u0000${box(row, "property").value}`);
  const repeated = keys.filter((key, at) => keys.indexOf(key) !== at);
  check("no rule appears twice", repeated.length === 0, repeated.length === 0 ? `${keys.length} rows, all distinct` : JSON.stringify(repeated));

  const tokens = rows().filter((row) => box(row, "selector").value === ":root, svg");
  check("the token block is one run of rows", tokens.length > 0, `${tokens.length} :root, svg rows`);

  // Every row the book produced points at its entry. The waiting blank is not in
  // the book and carries no id — that is how it says so.
  const identified = ruleRows().every((row) => /^\d+$/.test(row.id));
  check("every rule row carries its rule id", identified, ruleRows().map((row) => row.id).slice(0, 3).join(" ") + " …");

  const blanks = rows().filter((row) => row.id === "");
  check(
    "one blank row waits at the end of the list, which is the top of the screen",
    blanks.length === 1 && blanks[0] === blankRow() && !keyedRow(blankRow()),
    `${blanks.length} blank, last row id=${blankRow().id || "(none)"}`,
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
 * The waiting blank, and what ❌ means now.
 *
 * Typing into the blank is how a rule is added — there is no "add row" step — and
 * filling it in must put the next blank there, or the top of the list would be
 * occupied and the next rule would need a click first.
 *
 * ❌ takes the rule out of the book and out of CSSOM and then only hides the
 * element: the book is the source of truth, and the list is rebuilt from it on
 * the next sync. So the element survives this stage and disappears at the resync.
 */
async function blankRowFlow(): Promise<void> {
  tabs()[1]!.click();
  await tick();

  const before = rows().length;
  const typed = blankRow();
  await type(box(typed, "selector"), ".scratch-flow", "change");
  await type(box(typed, "property"), "opacity", "change");
  await type(box(typed, "value"), "0.5", "input");

  check("filling the blank row adds the rule", typed.id !== "" && /^\d+$/.test(typed.id), `id=${typed.id || "(none)"}`);
  check(
    "and puts a fresh blank after it",
    rows().length === before + 1 && blankRow() !== typed && !keyedRow(blankRow()),
    `${before} → ${rows().length}, last is ${blankRow() === typed ? "the typed row" : "blank"}`,
  );

  const painted = cssTexts().join("");
  check("the new rule reached the sheet", painted.includes("scratch-flow"), `${sheet().cssRules.length} rules`);
  check("and the row's id is the one the book minted", declaration(".scratch-flow", "opacity") === "0.5", `#${typed.id} → opacity: ${declaration(".scratch-flow", "opacity")}`);

  dropRow(typed);
  await tick();
  check("❌ hides the row rather than removing it", rows().length === before + 1 && typed.hasAttribute("hidden"), `${rows().length} rows, hidden=${typed.hasAttribute("hidden")}`);
  check("❌ is not in the live list", !live().includes(typed), `${live().length} of ${rows().length} live`);
  // The declaration goes; the selector's own rule block stays behind, empty, until
  // a `cleanup` drops it. So the question is whether the property is still painted,
  // not whether the selector is still mentioned.
  check("❌ took the declaration out of the sheet", declaration(".scratch-flow", "opacity") === "", `opacity="${declaration(".scratch-flow", "opacity")}"`);

  await resync();
  check("the re-read drops the hidden row", rows().length === before && !rows().includes(typed), `${rows().length} rows, none hidden: ${rows().every((row) => !row.hasAttribute("hidden"))}`);
  check("and still leaves exactly one blank waiting", rows().filter((row) => row.id === "").length === 1, `${rows().filter((row) => row.id === "").length} blank`);

  // ➕ is the only way to get a second blank, and a re-read takes it back.
  addRow();
  await tick();
  const two = rows().filter((row) => row.id === "").length;
  await resync();
  check("➕ opens another blank, and a re-read settles back to one", two === 2 && rows().filter((row) => row.id === "").length === 1, `${two} → ${rows().filter((row) => row.id === "").length}`);
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
  await type(box(row, "value"), "#ff0000", "input");

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
 *  The scratch key is `--primary-color` on purpose — the theme owns it *and* the
 *  DOT derives it, so it is the one place all three sources meet. The row is left
 *  standing at the end: deleting it would take the theme's entry with it, which
 *  is the design (§1) and not something to do behind a later stage's back. */
async function survivesRedraw(): Promise<void> {
  const token = () => getComputedStyle(document.documentElement).getPropertyValue("--primary-color").trim();
  const derived = token();

  const row = blankRow();
  await type(box(row, "selector"), ":root, svg", "change");
  await type(box(row, "property"), "--primary-color", "change");
  await type(box(row, "value"), "#ff00ff", "input");
  check("a user row overwrites what the DOT derived", token() === "#ff00ff", `${derived} → ${token()}`);

  await resync();
  const mine = rows().filter((one) => box(one, "property").value === "--primary-color");
  const detail = mine.map((one) => `${one.id || "(no id)"}:${one.dataset.source}:${box(one, "value").value}`).join(" ");
  check("the overwrite is one row, not two", mine.length === 1, detail);
  check("it kept the theme entry's id", /^\d+$/.test(mine[0]!.id), detail);
  check("and it is the user's row now", mine[0]!.dataset.source === "2", detail);

  // A redraw absorbs the DOT's tokens at source 1 *before* the pipeline ever
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
  await type(box(row, "value"), ".glass", "input");

  check("an @apply row feeds without leaking @apply", !cssTexts().join("").includes("@apply"), `${sheet().cssRules.length} rules`);
  dropRow(row);
  await tick();
  await resync();
  check("the dropped @apply row is gone from the list", !rows().includes(row), `${rows().length} rows`);
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
  await type(box(specific, "value"), "10px", "input");
  check("an #id row outranks a class row", padding() === "10px", padding());

  const shout = blankRow();
  await type(box(shout, "selector"), ".node", "change");
  await type(box(shout, "property"), "padding", "change");
  await type(box(shout, "value"), "0 !important", "input");
  check("!important reaches CSSOM as a priority", padding() === "0px", `padding: ${padding()}`);
  check(
    "and the book keeps the value as typed",
    box(shout, "value").value === "0 !important" && !shout.classList.contains("invalid"),
    `"${box(shout, "value").value}" invalid=${shout.classList.contains("invalid")}`,
  );

  // The old behaviour, now impossible: the priority inside the value made the
  // whole declaration unparseable, so this used to paint nothing at all.
  const before = errors.length;
  const bad = blankRow();
  await type(box(bad, "selector"), ".scratch-bad", "change");
  await type(box(bad, "property"), "margin", "change");
  await type(box(bad, "value"), "0px0", "input");
  check("a value CSSOM rejects marks the row", bad.classList.contains("invalid"), bad.className);
  check("and says so once, in the console", errors.length === before + 1, JSON.stringify(errors.slice(before)));

  await type(box(bad, "value"), "0px", "input");
  check("fixing the value clears the mark", !bad.classList.contains("invalid"), bad.className);

  // Expected, and already asserted. Out of the list so the suite's last check
  // still means "nothing went wrong that we did not ask for".
  errors.splice(before, errors.length - before);

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
async function redrawStillWorks(): Promise<void> {
  tabs()[0]!.click();
  await tick();
  redrawButton().click();
  await tick();
  const nodes = $$("#diagram-html .node").length;
  const connectors = $$("#connector-paths *").length;
  check("Redraw still draws the picture", nodes === 3 && connectors > 0, `${nodes} nodes, ${connectors} connector parts`);
}

// The app's own `onMount` kicks the first redraw, so wait for the picture rather
// than for a timer.
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
 * The three source checkboxes. View state only: hiding a source must not touch
 * the book, and \u2014 the trap this is really here for \u2014 must not renumber the rows.
 * Every edit verb addresses a row by its position in the book, so if the filter
 * renumbered them, editing the first visible row would write to whatever row
 * happens to sit at index 0 of the book instead.
 *
 * Synchronous throughout: a checkbox is a signal, and the list re-renders in the
 * same turn. Nothing here waits for a frame (debt S9).
 */
async function sourceFilter(): Promise<void> {
  tabs()[1]!.click();
  await tick();

  const themeBox = $("#theme-styles-selected") as HTMLInputElement;
  const dotBox = $("#dot-styles-selected") as HTMLInputElement;
  const userBox = $("#user-styles-selected") as HTMLInputElement;
  check("the styles tab has one checkbox per source", themeBox !== null && dotBox !== null && userBox !== null, "three boxes");

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
  // either: the guard stage below needs that one to still be the DOT's.
  // A row the filter excludes is not rendered at all, so `ruleRows()` is already
  // "the rules on screen"; only a dropped row needs filtering out here.
  const visibleRules = () => ruleRows().filter((row) => !row.hasAttribute("hidden"));
  const probe = () => visibleRules()[visibleRules().length - 1]!;
  const id = probe().id;
  const selector = box(probe(), "selector").value;
  const property = box(probe(), "property").value;
  const original = box(probe(), "value").value;
  await type(box(probe(), "value"), "1px", "input");
  check(
    "editing a row under a filter writes to that row",
    probe().id === id && box(probe(), "selector").value === selector && box(probe(), "property").value === property && box(probe(), "value").value === "1px",
    `#${id} ${selector} ${property}: ${box(probe(), "value").value}`,
  );

  await type(box(probe(), "value"), original, "input");
  await flip(themeBox);
  check("re-checking a source brings its rows back", rows().length === all, `${rows().length} of ${all}`);
}

await mounted();
smoke();
publish("smoke");
stylesheet();
publish("stylesheet");
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
await redrawStillWorks();
check("no console or uncaught errors", errors.length === 0, JSON.stringify(errors));
publish("done");
