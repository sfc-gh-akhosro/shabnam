// Shared bundler settings. Both dev.ts and build.ts go through here so the
// dev server and the shipped bundle can never drift apart.

import { transformAsync } from "@babel/core";
import typescript from "@babel/preset-typescript";
import solid from "babel-preset-solid";
import type { BuildConfig, BunPlugin } from "bun";

export const ROOT = new URL("..", import.meta.url).pathname;

// SolidJS compiles JSX into DOM calls with its own Babel preset — there is no
// runtime JSX to fall back on. Preset order is load-bearing: TypeScript must
// strip types before Solid rewrites the JSX, or Babel 8 fails to parse .tsx.
const solidPlugin: BunPlugin = {
  name: "solid",
  setup(build) {
    build.onLoad({ filter: /\.tsx$/ }, async ({ path }) => {
      const source = await Bun.file(path).text();
      const out = await transformAsync(source, {
        filename: path,
        presets: [[typescript, {}], [solid, {}]],
        babelrc: false,
        configFile: false,
      });
      return { contents: out!.code!, loader: "js" };
    });
    build.onLoad({ filter: /\.css$/ }, async ({ path }) => {
      const source = await Bun.file(path).text();
      return { contents: source, loader: "text" };
    });
  },
};

export function bundleConfig(minify: boolean): BuildConfig {
  return {
    entrypoints: [`${ROOT}src/index.ts`],
    target: "browser",
    format: "esm",
    minify,
    plugins: [solidPlugin],
    // Shells, icons, and themes are imported as text, so an export stays one
    // self-contained file with no network fetch needed.
    loader: { ".svg": "text", ".css": "text" },
  };
}
