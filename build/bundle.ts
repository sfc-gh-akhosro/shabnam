// Shared bundler settings. Both dev.ts and build.ts go through here so the
// dev server and the shipped bundle can never drift apart.

import type { BuildConfig } from "bun";

export const ROOT = new URL("..", import.meta.url).pathname;

export function bundleConfig(minify: boolean): BuildConfig {
  return {
    entrypoints: [`${ROOT}src/index.ts`],
    target: "browser",
    format: "esm",
    minify,
    // Shells and icons are imported as text, so an export stays one
    // self-contained file with no network fetch needed.
    loader: { ".svg": "text" },
  };
}
