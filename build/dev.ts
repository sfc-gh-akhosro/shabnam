// Dev server. Bundles src/index.ts on every request for /index.js, and serves
// src/, svg/, and icon/ as static files. No HMR, no watcher, no cache — a
// browser reload is the whole reload story.

import { bundleConfig, ROOT } from "./bundle.ts";
import { writeThemeCatalog } from "./theme-catalog.ts";

writeThemeCatalog();

const PORT = 3000;

async function bundle(): Promise<Response> {
  const built = await Bun.build(bundleConfig(false));
  return new Response(built.outputs[0], {
    headers: { "content-type": "text/javascript" },
  });
}

function staticFile(pathname: string): Response {
  const path = pathname === "/" ? "/src/index.html" : pathname;
  return new Response(Bun.file(`${ROOT}${path.slice(1)}`));
}

Bun.serve({
  port: PORT,
  fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/index.js") return bundle();
    if (pathname === "/app.css") return staticFile("/src/app.css");
    return staticFile(pathname);
  },
});

console.log(`Shabnam dev server on http://localhost:${PORT}`);
