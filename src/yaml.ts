const ALWAYS_QUOTE_START = new Set([
  "[",
  "]",
  "{",
  "}",
  ",",
  "&",
  "*",
  "!",
  "|",
  ">",
  "'",
  '"',
  "%",
  "@",
  "`",
  "#",
]);

const BOOL_OR_NULL = /^(?:true|false|yes|no|on|off|null|~)$/i;

function looksLikeYamlNumber(value: string): boolean {
  return (
    /^[+-]?0x[0-9a-fA-F]+$/i.test(value) ||
    /^[+-]?0o[0-7]+$/i.test(value) ||
    /^[+-]?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) ||
    /^[+-]?\d+(?:[eE][+-]?\d+)?$/.test(value) ||
    /^[+-]?\.(?:inf|nan)$/i.test(value)
  );
}

function mustQuote(value: string): boolean {
  if (value.length === 0 || value !== value.trim()) return true;
  if (value === "---" || value === "...") return true;
  if (BOOL_OR_NULL.test(value) || looksLikeYamlNumber(value)) return true;
  if (value.includes(": ") || value.includes(" #")) return true;
  if (/[\n\r\t]/.test(value)) return true;

  const first = value[0];
  if (first === undefined) return true;
  if (ALWAYS_QUOTE_START.has(first)) return true;
  if (
    (first === "-" || first === "?" || first === ":") &&
    (value.length === 1 || value[1] === " " || value[1] === "\t")
  ) {
    return true;
  }
  return false;
}

/** Double-quote a string when a plain YAML scalar would misparse it. */
export function formatYamlScalar(value: string): string {
  if (!mustQuote(value)) return value;
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t");
  return `"${escaped}"`;
}
