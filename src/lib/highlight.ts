/**
 * Tiny, dependency-free syntax highlighters that emit HTML strings (consumed
 * via `dangerouslySetInnerHTML`). Kept deliberately small — just enough to make
 * CloudFormation JSON and CDK source readable.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Highlight a JSON value (pretty-printed) into HTML. */
export function highlightJson(value: unknown): string {
  const json = JSON.stringify(value, null, 2) ?? "undefined";
  const escaped = escapeHtml(json);
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "tok-num";
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? "tok-key" : "tok-str";
      } else if (/true|false/.test(match)) {
        cls = "tok-bool";
      } else if (/null/.test(match)) {
        cls = "tok-null";
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

const TS_KEYWORDS = new Set([
  "import", "from", "export", "const", "let", "var", "function", "return",
  "new", "class", "extends", "implements", "interface", "type", "public",
  "private", "protected", "readonly", "static", "async", "await", "if",
  "else", "for", "while", "switch", "case", "break", "continue", "this",
  "super", "void", "true", "false", "null", "undefined", "enum",
]);

const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
const isIdentChar = (c: string) => /[A-Za-z0-9_$]/.test(c);

/**
 * Highlight a single line of TypeScript/JavaScript source into HTML using a
 * small single-pass scanner (a regex chain would re-match the markup it emits).
 */
export function highlightTsLine(line: string): string {
  let out = "";
  let i = 0;
  const n = line.length;

  while (i < n) {
    const c = line[i];

    // Line comment — consumes the rest of the line.
    if (c === "/" && line[i + 1] === "/") {
      out += `<span class="tok-comment">${escapeHtml(line.slice(i))}</span>`;
      break;
    }

    // String / template literal.
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n && line[j] !== c) {
        if (line[j] === "\\") j++;
        j++;
      }
      const str = line.slice(i, Math.min(j + 1, n));
      out += `<span class="tok-str">${escapeHtml(str)}</span>`;
      i = j + 1;
      continue;
    }

    // Number literal (not part of an identifier).
    if (/[0-9]/.test(c) && (i === 0 || !isIdentChar(line[i - 1]))) {
      let j = i;
      while (j < n && /[0-9._a-fxA-FX]/.test(line[j])) j++;
      out += `<span class="tok-num">${escapeHtml(line.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    // Identifier / keyword / type.
    if (isIdentStart(c)) {
      let j = i + 1;
      while (j < n && isIdentChar(line[j])) j++;
      const word = line.slice(i, j);
      const cls = TS_KEYWORDS.has(word)
        ? "tok-key"
        : /^[A-Z]/.test(word)
          ? "tok-type"
          : "";
      out += cls ? `<span class="${cls}">${escapeHtml(word)}</span>` : escapeHtml(word);
      i = j;
      continue;
    }

    out += escapeHtml(c);
    i++;
  }

  return out;
}
