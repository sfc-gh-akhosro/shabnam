// Production bundle into dist/: index.js, plus index.html and app.css copied
// beside it so dist/ opens from a static server with no rewriting.

import { bundleConfig, ROOT } from "./bundle.ts";

const DIST = `${ROOT}dist/`;

const built = await Bun.build({ ...bundleConfig(true), outdir: DIST });

for (const name of ["index.html", "app.css"]) {
  await Bun.write(`${DIST}${name}`, Bun.file(`${ROOT}src/${name}`));
}

console.log(`built ${built.outputs.length + 2} files into dist/`);
