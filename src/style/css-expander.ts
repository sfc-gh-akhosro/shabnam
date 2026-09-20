// CSS Composition expander. Resolves `@apply` and `@mixin` / `@include` at
// runtime before injecting into the DOM, giving Shabnam modern CSS composition
// without requiring a heavyweight build-step preprocessor.

export function expandCss(css: string, contextCss?: string): string {
  if (!css) return "";

  const definitions = new Map<string, string>();

  // 1. If context CSS is provided (e.g. theme.css), extract its mixins and utility classes
  if (contextCss) {
    extractDefinitions(contextCss, definitions);
  } else if (typeof document !== "undefined") {
    // Fallback in browser: look up theme stylesheet sink
    const themeEl = document.getElementById("shabnam-theme-css");
    if (themeEl && themeEl.textContent && themeEl.textContent !== css) {
      extractDefinitions(themeEl.textContent, definitions);
    }
  }

  // 2. Extract mixins and utility classes from target CSS
  extractDefinitions(css, definitions);

  if (!css.includes("@apply") && !css.includes("@mixin") && !css.includes("@include")) {
    return css;
  }

  // Remove @mixin declarations from output
  const mixinRegex = /@mixin\s+([\w-]+)\s*\{([^}]+)\}/g;
  let result = css.replace(mixinRegex, "");

  // 3. Expand @apply class1 class2; and @include mixinName;
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
  // Extract @mixin name { ... }
  const mixinRegex = /@mixin\s+([\w-]+)\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = mixinRegex.exec(sourceCss)) !== null) {
    definitions.set(match[1], match[2].trim());
  }

  // Extract single class definitions: .name { declarations }
  const classRegex = /\.([\w-]+)\s*\{([^}]+)\}/g;
  while ((match = classRegex.exec(sourceCss)) !== null) {
    const className = match[1];
    const body = match[2].trim();
    if (!definitions.has(className)) {
      definitions.set(className, body);
      definitions.set("." + className, body);
    }
  }
}

