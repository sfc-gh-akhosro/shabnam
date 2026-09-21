// Highlighters. String in, HTML spans out. CodeJar paints the editor.

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function hl(cls: string, text: string): string {
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

function paint(code: string, pattern: RegExp, take: (m: RegExpExecArray) => string): string {
  let last = 0;
  let out = "";
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code)) !== null) {
    out += escapeHtml(code.slice(last, match.index));
    out += take(match);
    last = pattern.lastIndex;
  }
  return out + escapeHtml(code.slice(last));
}

export function highlightJs(code: string): string {
  const JS_PATTERN =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(".*?"|'.*?'|`[\s\S]*?`)|(\b(?:const|let|var|function|return|if|else|for|while|import|export|from|async|await|new|try|catch|class|typeof)\b)|(\b(?:document|window|console|Math|JSON|Array|Object|String|Number)\b)|(\b\d+(?:\.\d+)?\b)/g;
  return paint(code, JS_PATTERN, ([, comment, str, keyword, builtin, num]) =>
    comment ? hl("hl-comment", comment)
    : str ? hl("hl-string", str)
    : keyword ? hl("hl-keyword", keyword)
    : builtin ? hl("hl-builtin", builtin)
    : num ? hl("hl-number", num)
    : "",
  );
}

export function highlightHtml(code: string): string {
  const HTML_PATTERN =
    /(<!--[\s\S]*?-->)|(<\/?[a-zA-Z0-9_-]+)|(\/?>)|([a-zA-Z0-9_-]+)(?==)|(".*?"|'.*?')/g;
  return paint(code, HTML_PATTERN, ([, comment, tag, close, attr, str]) =>
    comment ? hl("hl-comment", comment)
    : tag ? hl("hl-tag", tag)
    : close ? hl("hl-tag", close)
    : attr ? hl("hl-attr", attr)
    : str ? hl("hl-string", str)
    : "",
  );
}

export function highlightCss(code: string): string {
  const CSS_PATTERN =
    /(\/\*[\s\S]*?\*\/)|(@(?:apply|mixin|include|keyframes|media|layer|import)\b)|([^{};\n]+(?=\{))|([a-zA-Z0-9_-]+)(?=\s*:)|(".*?"|'.*?')/g;
  return paint(code, CSS_PATTERN, ([, comment, atrule, selector, property, str]) =>
    comment ? hl("hl-comment", comment)
    : atrule ? hl("hl-atrule", atrule)
    : selector ? hl("hl-selector", selector)
    : property ? hl("hl-property", property)
    : str ? hl("hl-string", str)
    : "",
  );
}

export function highlightDot(code: string): string {
  const DOT_PATTERN =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)|(".*?")|(\b(?:digraph|graph|subgraph|node|edge|strict)\b)|(\b(?:rankdir|label|shape|style|color|fillcolor|fontname|fontsize|penwidth|splines)\b)|(->|--)/gi;
  return paint(code, DOT_PATTERN, ([, comment, str, keyword, property, operator]) =>
    comment ? hl("hl-comment", comment)
    : str ? hl("hl-string", str)
    : keyword ? hl("hl-keyword", keyword)
    : property ? hl("hl-property", property)
    : operator ? hl("hl-operator", operator)
    : "",
  );
}
