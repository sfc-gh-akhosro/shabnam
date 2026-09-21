// CSS composition expander. Resolves `@apply` and `@mixin` / `@include`.

export function expandCss(css: string, contextCss?: string): string {
  if (!css) return "";

  const definitions = new Map<string, string>();

  if (contextCss) {
    extractDefinitions(contextCss, definitions);
  } else if (typeof document !== "undefined") {
    const themeEl = document.getElementById("shabnam-theme-css");
    if (themeEl && themeEl.textContent && themeEl.textContent !== css) {
      extractDefinitions(themeEl.textContent, definitions);
    }
  }

  extractDefinitions(css, definitions);

  if (!css.includes("@apply") && !css.includes("@mixin") && !css.includes("@include")) {
    return css;
  }

  const mixinRegex = /@mixin\s+([\w-]+)\s*\{([^}]+)\}/g;
  let result = css.replace(mixinRegex, "");

  const applyRegex = /@(apply|include)\s+([^;]+);/g;
  result = result.replace(applyRegex, (_, _directive: string, names: string) => {
    const tokens = names.trim().split(/\s+/);
    const inlined = tokens
      .map((token: string) => {
        const key = token.startsWith(".") ? token.slice(1) : token;
        return definitions.get(key) ?? definitions.get(token) ?? "";
      })
      .filter(Boolean)
      .join("\n  ");
    return inlined ? inlined : "";
  });

  return result;
}

function extractDefinitions(sourceCss: string, definitions: Map<string, string>): void {
  const mixinRegex = /@mixin\s+([\w-]+)\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = mixinRegex.exec(sourceCss)) !== null) {
    definitions.set(match[1]!, match[2]!.trim());
  }

  const classRegex = /\.([\w-]+)\s*\{([^}]+)\}/g;
  while ((match = classRegex.exec(sourceCss)) !== null) {
    const className = match[1]!;
    const body = match[2]!.trim();
    if (!definitions.has(className)) {
      definitions.set(className, body);
      definitions.set("." + className, body);
    }
  }
}
