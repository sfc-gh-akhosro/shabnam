// Lightweight, robust token-based syntax highlighters for JS, HTML, CSS, and DOT.

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function highlightJs(code: string): string {
  const JS_PATTERN =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(".*?"|'.*?'|`[\s\S]*?`)|(\b(?:const|let|var|function|return|if|else|for|while|import|export|from|async|await|new|try|catch|class|typeof)\b)|(\b(?:document|window|console|Math|JSON|Array|Object|String|Number)\b)|(\b\d+(?:\.\d+)?\b)/g;

  let lastIndex = 0;
  let out = "";
  let match: RegExpExecArray | null;

  while ((match = JS_PATTERN.exec(code)) !== null) {
    out += escapeHtml(code.slice(lastIndex, match.index));
    const [, comment, str, keyword, builtin, num] = match;
    if (comment) {
      out += `<span class="hl-comment">${escapeHtml(comment)}</span>`;
    } else if (str) {
      out += `<span class="hl-string">${escapeHtml(str)}</span>`;
    } else if (keyword) {
      out += `<span class="hl-keyword">${escapeHtml(keyword)}</span>`;
    } else if (builtin) {
      out += `<span class="hl-builtin">${escapeHtml(builtin)}</span>`;
    } else if (num) {
      out += `<span class="hl-number">${escapeHtml(num)}</span>`;
    }
    lastIndex = JS_PATTERN.lastIndex;
  }
  out += escapeHtml(code.slice(lastIndex));
  return out;
}

export function highlightHtml(code: string): string {
  const HTML_PATTERN =
    /(<!--[\s\S]*?-->)|(<\/?[a-zA-Z0-9_-]+)|(\/?>)|([a-zA-Z0-9_-]+)(?==)|(".*?"|'.*?')/g;

  let lastIndex = 0;
  let out = "";
  let match: RegExpExecArray | null;

  while ((match = HTML_PATTERN.exec(code)) !== null) {
    out += escapeHtml(code.slice(lastIndex, match.index));
    const [, comment, tag, close, attr, str] = match;
    if (comment) {
      out += `<span class="hl-comment">${escapeHtml(comment)}</span>`;
    } else if (tag) {
      out += `<span class="hl-tag">${escapeHtml(tag)}</span>`;
    } else if (close) {
      out += `<span class="hl-tag">${escapeHtml(close)}</span>`;
    } else if (attr) {
      out += `<span class="hl-attr">${escapeHtml(attr)}</span>`;
    } else if (str) {
      out += `<span class="hl-string">${escapeHtml(str)}</span>`;
    }
    lastIndex = HTML_PATTERN.lastIndex;
  }
  out += escapeHtml(code.slice(lastIndex));
  return out;
}

export function highlightCss(code: string): string {
  const CSS_PATTERN =
    /(\/\*[\s\S]*?\*\/)|(@(?:apply|mixin|include|keyframes|media|layer|import)\b)|([^{};\n]+(?=\{))|([a-zA-Z0-9_-]+)(?=\s*:)|(".*?"|'.*?')/g;

  let lastIndex = 0;
  let out = "";
  let match: RegExpExecArray | null;

  while ((match = CSS_PATTERN.exec(code)) !== null) {
    out += escapeHtml(code.slice(lastIndex, match.index));
    const [, comment, atrule, selector, property, str] = match;
    if (comment) {
      out += `<span class="hl-comment">${escapeHtml(comment)}</span>`;
    } else if (atrule) {
      out += `<span class="hl-atrule">${escapeHtml(atrule)}</span>`;
    } else if (selector) {
      out += `<span class="hl-selector">${escapeHtml(selector)}</span>`;
    } else if (property) {
      out += `<span class="hl-property">${escapeHtml(property)}</span>`;
    } else if (str) {
      out += `<span class="hl-string">${escapeHtml(str)}</span>`;
    }
    lastIndex = CSS_PATTERN.lastIndex;
  }
  out += escapeHtml(code.slice(lastIndex));
  return out;
}

export function highlightDot(code: string): string {
  const DOT_PATTERN =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)|(".*?")|(\b(?:digraph|graph|subgraph|node|edge|strict)\b)|(\b(?:rankdir|label|shape|style|color|fillcolor|fontname|fontsize|penwidth|splines)\b)|(->|--)/gi;

  let lastIndex = 0;
  let out = "";
  let match: RegExpExecArray | null;

  while ((match = DOT_PATTERN.exec(code)) !== null) {
    out += escapeHtml(code.slice(lastIndex, match.index));
    const [, comment, str, keyword, property, operator] = match;
    if (comment) {
      out += `<span class="hl-comment">${escapeHtml(comment)}</span>`;
    } else if (str) {
      out += `<span class="hl-string">${escapeHtml(str)}</span>`;
    } else if (keyword) {
      out += `<span class="hl-keyword">${escapeHtml(keyword)}</span>`;
    } else if (property) {
      out += `<span class="hl-property">${escapeHtml(property)}</span>`;
    } else if (operator) {
      out += `<span class="hl-operator">${escapeHtml(operator)}</span>`;
    }
    lastIndex = DOT_PATTERN.lastIndex;
  }
  out += escapeHtml(code.slice(lastIndex));
  return out;
}
