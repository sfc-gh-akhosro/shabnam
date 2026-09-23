// CSS composition expander. Resolves `@apply` and `@mixin` / `@include`.
//
// Later definition wins — overlay last, same as the cascade. Comments do not
// exist. A name that is not defined throws. Nested `@apply` is resolved.

export function expandCss(css: string, contextCss?: string): string {
  if (!css) return "";

  const definitions = new Map<string, string>();
  if (contextCss) extractDefinitions(contextCss, definitions);
  extractDefinitions(css, definitions);

  if (!css.includes("@apply") && !css.includes("@mixin") && !css.includes("@include")) {
    return stripComments(css);
  }

  const result = stripComments(css)
    .replace(/@mixin\s+([\w-]+)\s*\{[^}]*\}/g, "")
    .replace(/@(apply|include)\s+([^;]+);/g, (_, _directive: string, names: string) => {
      return names
        .trim()
        .split(/\s+/)
        .map((token) => bodyOf(token, definitions, []))
        .join("\n  ");
    });

  return result;
}

function bodyOf(token: string, definitions: Map<string, string>, seen: string[]): string {
  const key = token.startsWith(".") ? token.slice(1) : token;
  if (seen.includes(key)) throw new Error(`@apply cycle: ${[...seen, key].join(" → ")}`);

  const raw = definitions.get(key);
  if (raw === undefined) throw new Error(`@apply ${token}: not defined`);

  return raw.replace(/@(apply|include)\s+([^;]+);/g, (_, _directive: string, names: string) => {
    return names
      .trim()
      .split(/\s+/)
      .map((inner) => bodyOf(inner, definitions, [...seen, key]))
      .join("\n  ");
  });
}

function extractDefinitions(sourceCss: string, definitions: Map<string, string>): void {
  const source = stripComments(sourceCss);

  const mixinRegex = /@mixin\s+([\w-]+)\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = mixinRegex.exec(source)) !== null) {
    definitions.set(match[1]!, match[2]!.trim());
  }

  const classRegex = /^\s*\.([\w-]+)\s*\{([^}]+)\}/gm;
  while ((match = classRegex.exec(source)) !== null) {
    const className = match[1]!;
    const body = match[2]!.trim();
    definitions.set(className, body);
    definitions.set("." + className, body);
  }
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}
