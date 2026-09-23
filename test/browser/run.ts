// The browser half of the suite. `bun test` has no CSSOM, so the Stylist's feed,
// the live repaint, and the rows tab cannot be reached from there at all (debt
// S2). This serves the real app to a real headless Chrome, lets the page drive
// its own UI, and reads one JSON report back out of the dumped DOM.
//
//   bun run test/browser/run.ts        (or: bun run test:browser)
//
// No new dependency: Chrome is already on the machine, `--dump-dom` is the whole
// driver, and the report travels as base64 in an attribute so nothing has to
// un-escape serialized HTML.

import { bundleConfig, ROOT } from "../../build/bundle.ts";

const PORT = 3101;
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BUDGET = 120_000;

type Report = { results: { name: string; ok: boolean; detail: string }[]; errors: string[] };

// Console and uncaught errors are collected before the app loads, so a check can
// assert on them. The two modules are ordered: the app mounts, the checks wait.
const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Shabnam — browser checks</title>
    <link rel="stylesheet" href="./app.css" />
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.SHABNAM_ERRORS = [];
      const real = console.error.bind(console);
      console.error = (...args) => { window.SHABNAM_ERRORS.push(args.join(" ")); real(...args); };
      addEventListener("error", (e) => window.SHABNAM_ERRORS.push(String(e.message)));
      addEventListener("unhandledrejection", (e) => window.SHABNAM_ERRORS.push(String(e.reason)));
    </script>
    <script type="module" src="./index.js"></script>
    <script type="module" src="./checks.js"></script>
  </body>
</html>
`;

async function script(config: Parameters<typeof Bun.build>[0]): Promise<Response> {
  const built = await Bun.build(config);
  return new Response(built.outputs[0], { headers: { "content-type": "text/javascript" } });
}

const server = Bun.serve({
  port: PORT,
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/") return new Response(PAGE, { headers: { "content-type": "text/html" } });
    if (pathname === "/index.js") return script(bundleConfig(false));
    if (pathname === "/checks.js") {
      return script({ entrypoints: [`${ROOT}test/browser/checks.ts`], target: "browser", format: "esm" });
    }
    const path = pathname === "/app.css" ? "/src/app.css" : pathname;
    return new Response(Bun.file(`${ROOT}${path.slice(1)}`));
  },
});

const chrome = Bun.spawn(
  [
    CHROME,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--window-size=1440,900",
    `--virtual-time-budget=${BUDGET}`,
    "--dump-dom",
    `http://localhost:${PORT}/`,
  ],
  { stdout: "pipe", stderr: "pipe" },
);

const dom = await new Response(chrome.stdout).text();
const noise = await new Response(chrome.stderr).text();
await chrome.exited;
server.stop(true);

const found = dom.match(/data-report="([A-Za-z0-9+/=]+)"/);
if (found === null) {
  // A page that never reached the report is a debugging job, not a diff: keep
  // what Chrome saw rather than printing 30 KB of DOM at the console.
  await Bun.write("/tmp/shabnam-dom.html", dom);
  console.error(noise);
  throw new Error(`no report in the dumped DOM — see /tmp/shabnam-dom.html (${dom.length} bytes)`);
}

const { results, errors }: Report = JSON.parse(Buffer.from(found[1]!, "base64").toString("utf8"));
const stage = dom.match(/data-stage="(\w+)"/)![1]!;
for (const { name, ok, detail } of results) console.log(`${ok ? "ok  " : "FAIL"}  ${name} — ${detail}`);
for (const message of errors) console.log(`page error: ${message}`);

const failed = results.filter(({ ok }) => !ok).length;
console.log(`\n${results.length - failed} pass / ${failed} fail  (headless Chrome, stage "${stage}")`);
if (failed > 0 || stage !== "done") process.exit(1);
