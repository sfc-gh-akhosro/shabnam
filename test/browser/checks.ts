// The checks, running inside the page, next to the real app. They touch nothing
// but the DOM: the rows tab is driven the way a person drives it (set the box,
// dispatch the event the component listens for), and every assertion is read
// back off the live sheet or out of `getComputedStyle`. No app internals, so
// this cannot pass by agreeing with the Stylist about something wrong.
//
// The report leaves as base64 in `#shabnam-checks[data-report]`, which survives
// HTML serialization untouched. `run.ts` picks it up from there.

type Result = { name: string; ok: boolean; detail: string };

const results: Result[] = [];
const errors = (window as never as { SHABNAM_ERRORS: string[] }).SHABNAM_ERRORS;

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
  const report = document.getElementById("shabnam-checks") ?? document.body.appendChild(document.createElement("div"));
  report.id = "shabnam-checks";
  report.dataset.stage = stage;
  report.dataset.report = base64(JSON.stringify({ results, errors }));
}

// A crash is reported, not swallowed: the listener only flushes what has already
// been collected, so the driver prints the failing stage and the page's error.
addEventListener("unhandledrejection", () => publish("crashed"));

const $ = (selector: string) => document.querySelector(selector) as HTMLElement;
const $$ = (selector: string) => [...document.querySelectorAll(selector)] as HTMLElement[];
const tick = () => new Promise((done) => setTimeout(done, 30));

const sheet = () => ($("#shabnam-style-css") as unknown as HTMLStyleElement).sheet!;
const cssTexts = () => [...sheet().cssRules].map((rule) => rule.cssText);
const background = (id: string) => getComputedStyle($(`#${id}`)).backgroundColor;
const boxes = () => $$("#shabnam-main-html .node").map((node) => JSON.stringify(node.getBoundingClientRect()));

/** Set a box and tell the component, the way a keystroke or a blur would. */
function type(box: HTMLElement, value: string, event: "input" | "change"): Promise<unknown> {
  (box as HTMLInputElement).value = value;
  box.dispatchEvent(new Event(event, { bubbles: true }));
  return tick();
}

const rows = () => $$("#shabnam-styles-list .style-row");
const lastRow = () => rows()[rows().length - 1]!;
const box = (row: HTMLElement, field: "selector" | "property" | "value") =>
  row.querySelector(`.style-${field}`) as HTMLInputElement;

function smoke(): void {
  check("the workbench mounts", $("#shabnam-workbench") !== null, $$("#shabnam-tab-strip .tab").length + " tabs");
  check(
    "four tabs, named as the spec names them",
    $$("#shabnam-tab-strip .tab").map((tab) => tab.textContent).join(" ") ===
      "diagram.dot styles annotation.html action.js",
    $$("#shabnam-tab-strip .tab").map((tab) => tab.textContent).join(" "),
  );

  const nodes = $$("#shabnam-main-html .node").length;
  const connectors = $$("#shabnam-connectors *").length;
  check("the starter diagram draws", nodes === 3 && connectors > 0, `${nodes} nodes, ${connectors} connector parts`);
  check("the SVG layer is measured, not empty", $$("#shabnam-node-shells *").length > 0, $$("#shabnam-node-shells *").length);
  check("the annotation is placed", $("#shabnam-annotation-html div") !== null, $("#shabnam-annotation-html").innerHTML.length);
}

function stylesheet(): void {
  check("the sink carries no CSS text", $("#shabnam-style-css").textContent === "", JSON.stringify($("#shabnam-style-css").textContent));
  check("the sheet has rules", sheet().cssRules.length > 0, `${sheet().cssRules.length} rules`);
  check("no @apply survives the feed", !cssTexts().join("").includes("@apply"), cssTexts().filter((t) => t.includes("apply")).length);

  const nodeBg = background("core");
  check("the theme paints a node", nodeBg !== "rgba(0, 0, 0, 0)" && nodeBg !== "", nodeBg);
  const token = getComputedStyle(document.documentElement).getPropertyValue("--primary-color");
  check("derived tokens reach :root", token.trim() !== "", token);
}

async function rowsTab(): Promise<void> {
  $$("#shabnam-tab-strip .tab")[1]!.click();
  await tick();

  const origins = rows().reduce<Record<string, number>>((count, row) => {
    const origin = row.dataset.origin!;
    return { ...count, [origin]: (count[origin] ?? 0) + 1 };
  }, {});
  check("the styles tab lists every layer, tagged", rows().length > 0 && origins.theme! > 0 && origins.derived! > 0, JSON.stringify(origins));

  const themeRow = rows().find((row) => row.dataset.origin === "theme")!;
  const locked = box(themeRow, "selector").readOnly && box(themeRow, "property").readOnly && !box(themeRow, "value").readOnly;
  check("a theme row is value-editable only", locked, `selector ${box(themeRow, "selector").readOnly}, value ${box(themeRow, "value").readOnly}`);
}

/** The whole point of the rewrite: one `setProperty`, no redraw, no re-layout. */
async function liveRepaint(): Promise<void> {
  const before = background("core");
  const layout = boxes();
  const ruleCount = sheet().cssRules.length;

  $("#shabnam-styles-head button")!.click();
  await tick();
  const row = lastRow();
  await type(box(row, "selector"), ".node", "change");
  await type(box(row, "property"), "background", "change");
  await type(box(row, "value"), "#ff0000", "input");

  const painted = $$("#shabnam-main-html .node").map((node) => getComputedStyle(node).backgroundColor);
  check("a user row repaints live, with no redraw", painted.every((colour) => colour === "rgb(255, 0, 0)"), JSON.stringify(painted));
  check("the repaint did not re-layout", JSON.stringify(boxes()) === JSON.stringify(layout), boxes().length + " boxes compared");
  check("the sheet gained no rule for a known selector", sheet().cssRules.length === ruleCount, `${ruleCount} → ${sheet().cssRules.length}`);

  (lastRow().querySelector("button.style-remove") as HTMLElement).click();
  await tick();
  check("removing a shadow reverts to the layer under it", background("core") === before, `${background("core")} vs ${before}`);
}

async function applyAndCleanup(): Promise<void> {
  $("#shabnam-styles-head button")!.click();
  await tick();
  const row = lastRow();
  await type(box(row, "selector"), ".node", "change");
  await type(box(row, "property"), "@apply", "change");
  await type(box(row, "value"), ".glass", "input");

  check("an @apply row feeds without leaking @apply", !cssTexts().join("").includes("@apply"), `${sheet().cssRules.length} rules`);
  (lastRow().querySelector("button.style-remove") as HTMLElement).click();
  await tick();

  const settled = rows().length;
  $("#shabnam-styles-head button")!.click();
  await tick();
  const withBlank = rows().length;
  $$("#shabnam-styles-head button")[1]!.click();
  await tick();
  check("Cleanup drops a blank row", withBlank === settled + 1 && rows().length === settled, `${settled} → ${withBlank} → ${rows().length}`);
}

async function redrawStillWorks(): Promise<void> {
  $$("#shabnam-tab-strip .tab")[0]!.click();
  await tick();
  $("#shabnam-redraw").click();
  await tick();
  await mounted();
  const nodes = $$("#shabnam-main-html .node").length;
  const connectors = $$("#shabnam-connectors *").length;
  check("Redraw still draws the picture", nodes === 3 && connectors > 0, `${nodes} nodes, ${connectors} connector parts`);
}

// The app's own `onMount` kicks the first redraw, so wait for the picture rather
// than for a timer.
async function mounted(): Promise<void> {
  // The SVG layer is injected a frame after the HTML, so waiting on a node would
  // read the picture half-drawn. Connectors are the last thing the pipeline puts
  // down.
  for (let waited = 0; waited < 200; waited += 1) {
    if ($$("#shabnam-connectors *").length > 0) return;
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
await applyAndCleanup();
publish("apply");
await redrawStillWorks();
check("no console or uncaught errors", errors.length === 0, JSON.stringify(errors));
publish("done");
