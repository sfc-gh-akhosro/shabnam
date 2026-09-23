// Writes src/workbench/theme-catalog.ts from theme/*.css. Catalog is those names.

import { readdirSync } from "node:fs";
import { ROOT } from "./bundle.ts";

export function writeThemeCatalog(): void {
  const names = readdirSync(`${ROOT}theme`)
    .filter((name) => name.endsWith(".css"))
    .sort((a, b) => (a === "theme.css" ? -1 : b === "theme.css" ? 1 : a.localeCompare(b)));

  const imports = names
    .map((name, i) => `import t${i} from "../../theme/${name}" with { type: "text" };`)
    .join("\n");
  const entries = names.map((name, i) => `  ["${name}", t${i}],`).join("\n");

  Bun.write(
    `${ROOT}src/workbench/theme-catalog.ts`,
    `// Generated from theme/*.css. Do not edit.\n\n${imports}\n\nexport const THEMES = new Map<string, string>([\n${entries}\n]);\n`,
  );
}
