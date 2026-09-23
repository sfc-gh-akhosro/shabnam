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
const background = (id: string) => getComputedStyle($(`#${id}`)).backgroundColor;
const boxes = () => $$("#diagram-html .node").map((node) => JSON.stringify(node.getBoundingClientRect()));

/** Set a box and tell the component, the way a keystroke or a blur would. */
function type(box: HTMLElement, value: string, event: "input" | "change"): Promise<unknown> {
  (box as HTMLInputElement).value = value;
  box.dispatchEvent(new Event(event, { bubbles: true }));
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
const lastRow = () => rows()[rows().length - 1]!;

// The shell carries no hook of its own now: the tabs are the aside's nav, and
// Redraw is the first button in the main toolbar.
const tabs = () => $$("body > aside > nav button");
const redrawButton = () => $("body > main > nav button");
// The styles tab's own toolbar: + Row, Cleanup, Save. It sits above the list, so
// it is the section's header and not inside `.rows`.
const rowTools = () => $$("body > aside > section > header button");

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
  const keys = rows().map((row) => `${box(row, "selector").value}\u0000${box(row, "property").value}`);
  const repeated = keys.filter((key, at) => keys.indexOf(key) !== at);
  check("no rule appears twice", repeated.length === 0, repeated.length === 0 ? `${keys.length} rows, all distinct` : JSON.stringify(repeated));

  const tokens = rows().filter((row) => box(row, "selector").value === ":root, svg");
  check("the token block is one run of rows", tokens.length > 0, `${tokens.length} :root, svg rows`);

  // Every row the book produced points at its entry. A row the tab has just
  // invented has no id yet, but at this point none of them are invented.
  const identified = rows().every((row) => /^\d+$/.test(row.id));
  check("every row carries its rule id", identified, rows().map((row) => row.id).slice(0, 3).join(" ") + " …");

  // Every row is editable now: there is no layer beneath one for it to shadow.
  const editable = rows().every((row) => !box(row, "selector").readOnly && !box(row, "value").readOnly);
  check("no row is read-only", editable, `${rows().length} rows checked`);
}

/** The whole point of the rewrite: one `setProperty`, no redraw, no re-layout. */
async function liveRepaint(): Promise<void> {
  const before = background("core");
  const layout = boxes();
  const ruleCount = sheet().cssRules.length;

  rowTools()[0]!.click();
  await tick();
  const row = lastRow();
  await type(box(row, "selector"), ".node", "change");
  await type(box(row, "property"), "background", "change");
  await type(box(row, "value"), "#ff0000", "input");

  const painted = $$("#diagram-html .node").map((node) => getComputedStyle(node).backgroundColor);
  check("a user row repaints live, with no redraw", painted.every((colour) => colour === "rgb(255, 0, 0)"), JSON.stringify(painted));
  check("the repaint did not re-layout", JSON.stringify(boxes()) === JSON.stringify(layout), boxes().length + " boxes compared");
  check("the sheet gained no rule for a known selector", sheet().cssRules.length === ruleCount, `${ruleCount} → ${sheet().cssRules.length}`);

  (lastRow().querySelector("button") as HTMLElement).click();
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

  tabs()[1]!.click();
  await tick();
  rowTools()[0]!.click();
  await tick();
  const row = lastRow();
  await type(box(row, "selector"), ":root, svg", "change");
  await type(box(row, "property"), "--primary-color", "change");
  await type(box(row, "value"), "#ff00ff", "input");
  check("a user row overwrites what the DOT derived", token() === "#ff00ff", `${derived} → ${token()}`);

  // Cleanup re-reads the book, which is a synchronous sync path — no redraw, no
  // waiting on a frame. What comes back is the book itself, so this is where the
  // overwrite can be read rather than the tab's own optimistic copy of it.
  rowTools()[1]!.click();
  await tick();
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

async function applyAndCleanup(): Promise<void> {
  // A scratch selector nothing else owns: removing this row must not take a
  // theme rule down with it, because delete is not revert (§1).
  rowTools()[0]!.click();
  await tick();
  const row = lastRow();
  await type(box(row, "selector"), ".scratch", "change");
  await type(box(row, "property"), "@apply", "change");
  await type(box(row, "value"), ".glass", "input");

  check("an @apply row feeds without leaking @apply", !cssTexts().join("").includes("@apply"), `${sheet().cssRules.length} rules`);
  (lastRow().querySelector("button") as HTMLElement).click();
  await tick();

  // Cleanup first, so the count is the book's and not a list still carrying
  // rows this run has since removed. Then the comparison measures one thing.
  rowTools()[1]!.click();
  await tick();
  const settled = rows().length;
  rowTools()[0]!.click();
  await tick();
  const withBlank = rows().length;
  rowTools()[1]!.click();
  await tick();
  check("Cleanup drops a blank row", withBlank === settled + 1 && rows().length === settled, `${settled} → ${withBlank} → ${rows().length}`);
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

await mounted();
smoke();
publish("smoke");
stylesheet();
publish("stylesheet");
await rowsTab();
publish("rows");
await liveRepaint();
publish("repaint");
await survivesRedraw();
publish("guard");
await applyAndCleanup();
publish("apply");
await redrawStillWorks();
check("no console or uncaught errors", errors.length === 0, JSON.stringify(errors));
publish("done");
