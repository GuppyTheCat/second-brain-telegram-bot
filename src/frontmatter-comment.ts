import { formatYamlScalar } from "./yaml.js";

interface Line {
  start: number;
  text: string;
}

interface LocatedComment {
  keyStart: number;
  valueEnd: number;
  nextLine: number;
  old: string;
}

interface BlockHeader {
  kind: "|" | ">";
  indent: number | undefined;
  chomp: "-" | "+" | "clip";
}

/**
 * Splices `comment` onto the existing top-level `comment` value (or adds the
 * key as the last frontmatter entry). Returns undefined when the frontmatter
 * cannot be edited without guessing.
 */
export function appendFrontmatterComment(content: string, comment: string): string | undefined {
  const lines = splitLines(content);
  if ((lines[0]?.text ?? "") !== "---") return undefined;
  const nl = content.includes("\r\n") ? "\r\n" : "\n";

  let quote: '"' | "'" | null = null;
  let found: LocatedComment | undefined;
  let close = -1;

  for (let index = 1; index < lines.length; index++) {
    const text = lines[index]?.text ?? "";
    if (quote) {
      if (quoteClosed(text, quote, 0)) quote = null;
      continue;
    }
    if (text === "---" || text === "...") {
      close = index;
      break;
    }
    if (text.length === 0 || text[0] === " " || text[0] === "\t" || text[0] === "#") continue;

    const colon = text.indexOf(":");
    if (colon === -1) return undefined;
    const rest = text.slice(colon + 1);
    const trimmed = rest.trimStart();
    const opener = trimmed[0];
    if ((opener === '"' || opener === "'") && !quoteClosed(trimmed, opener, 1)) {
      quote = opener;
    }

    if (!/^comment[ \t]*:/.test(text)) continue;
    const parsed = parseComment(lines, index, rest);
    if (!parsed) return undefined;
    found ??= parsed;
    index = parsed.nextLine - 1;
  }

  if (close === -1 || quote) return undefined;

  if (!found) {
    const insertAt = lines[close]?.start ?? 0;
    return content.slice(0, insertAt) + serializeComment(comment, nl) + content.slice(insertAt);
  }

  const combined = combineComments(found.old, comment);
  return (
    content.slice(0, found.keyStart) + serializeComment(combined, nl) + content.slice(found.valueEnd)
  );
}

function splitLines(content: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (let index = 0; index < content.length; index++) {
    if (content[index] !== "\n") continue;
    const textEnd = content[index - 1] === "\r" ? index - 1 : index;
    lines.push({ start, text: content.slice(start, textEnd) });
    start = index + 1;
  }
  if (start < content.length) lines.push({ start, text: content.slice(start) });
  return lines;
}

function parseComment(lines: Line[], index: number, rest: string): LocatedComment | undefined {
  const line = lines[index];
  if (!line) return undefined;
  const trimmed = rest.trimStart();
  const opener = trimmed[0];
  if (opener === '"' || opener === "'") {
    if (indentedContinuation(lines, index)) return undefined;
    const old = opener === "'" ? parseSingleQuoted(trimmed) : parseDoubleQuoted(trimmed);
    if (old === undefined) return undefined;
    return located(lines, index, line.start, old);
  }

  const bare = rest.trim().replace(/[ \t]+#.*$/, "");
  if (bare.startsWith("|") || bare.startsWith(">")) {
    const header = parseBlockHeader(bare);
    if (!header) return undefined;
    return parseBlock(lines, index, line.start, header);
  }

  if (indentedContinuation(lines, index)) return undefined;
  return located(lines, index, line.start, normalizeNull(parsePlain(rest)));
}

function located(lines: Line[], index: number, keyStart: number, old: string): LocatedComment {
  const nextLine = index + 1;
  return { keyStart, valueEnd: lines[nextLine]?.start ?? endOf(lines, index), nextLine, old };
}

function endOf(lines: Line[], index: number): number {
  const line = lines[index];
  if (!line) return 0;
  const newline = line.start + line.text.length;
  return newline;
}

function indentedContinuation(lines: Line[], index: number): boolean {
  const text = lines[index + 1]?.text ?? "";
  return text.startsWith(" ") || text.startsWith("\t");
}

function parseBlock(
  lines: Line[],
  index: number,
  keyStart: number,
  header: BlockHeader,
): LocatedComment | undefined {
  const raw: string[] = [];
  let nextLine = index + 1;
  while (nextLine < lines.length) {
    const text = lines[nextLine]?.text ?? "";
    if (text.length > 0 && text[0] !== " " && text[0] !== "\t") break;
    raw.push(text);
    nextLine += 1;
  }

  const indent = header.indent ?? detectIndent(raw);
  if (indent === null) return undefined;
  const stripped = stripIndent(raw, indent);
  if (!stripped) return undefined;
  const literal = header.kind === ">" ? foldLines(stripped) : literalLines(stripped);
  const old = applyChomp(literal, header.chomp);
  return {
    keyStart,
    valueEnd: lines[nextLine]?.start ?? endOf(lines, nextLine - 1),
    nextLine,
    old,
  };
}

function parseBlockHeader(bare: string): BlockHeader | undefined {
  const match = bare.match(/^([|>])([1-9][+-]|[+-][1-9]|[1-9]|[+-])?$/);
  if (!match) return undefined;
  const kind = match[1] === ">" ? ">" : "|";
  let indent: number | undefined;
  let chomp: "-" | "+" | "clip" = "clip";
  for (const char of match[2] ?? "") {
    if (char >= "1" && char <= "9") indent = Number(char);
    else if (char === "-" || char === "+") chomp = char;
  }
  return { kind, indent, chomp };
}

function detectIndent(rawLines: string[]): number | null {
  for (const raw of rawLines) {
    if (raw.trim().length === 0) continue;
    let spaces = 0;
    while (raw[spaces] === " ") spaces += 1;
    if (raw[spaces] === "\t") return null;
    return spaces;
  }
  return 0;
}

function stripIndent(rawLines: string[], indent: number): string[] | undefined {
  const stripped: string[] = [];
  for (const raw of rawLines) {
    if (raw.length === 0) {
      stripped.push("");
      continue;
    }
    let spaces = 0;
    while (spaces < raw.length && raw[spaces] === " ") spaces += 1;
    const rest = raw.slice(spaces);
    if (rest.length === 0) {
      stripped.push(spaces >= indent ? raw.slice(indent) : "");
      continue;
    }
    if (spaces < indent) return undefined;
    stripped.push(raw.slice(indent));
  }
  return stripped;
}

function literalLines(lines: string[]): string {
  if (lines.length === 0) return "";
  return `${lines.join("\n")}\n`;
}

function foldLines(lines: string[]): string {
  if (lines.length === 0) return "";
  let out = "";
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (index === 0) {
      out = line;
      continue;
    }
    const prev = lines[index - 1] ?? "";
    if (line.length === 0) {
      out += "\n";
      continue;
    }
    if (prev.length === 0) {
      if (!out.endsWith("\n")) out += "\n";
      out += line;
      continue;
    }
    if (line.startsWith(" ") || line.startsWith("\t") || prev.startsWith(" ") || prev.startsWith("\t")) {
      out += `\n${line}`;
      continue;
    }
    out += ` ${line}`;
  }
  return `${out}\n`;
}

function applyChomp(value: string, chomp: "-" | "+" | "clip"): string {
  if (value.length === 0) return "";
  if (chomp === "+") return value;
  if (chomp === "-") return value.replace(/\n+$/, "");
  const stripped = value.replace(/\n+$/, "");
  if (stripped.length === 0) return "";
  return `${stripped}\n`;
}

function parsePlain(raw: string): string {
  const trimmed = raw.trim();
  const commentAt = trimmed.search(/[ \t]#/);
  return (commentAt === -1 ? trimmed : trimmed.slice(0, commentAt)).trimEnd();
}

function normalizeNull(value: string): string {
  if (value === "" || value === "~" || value === "null" || value === "Null" || value === "NULL") return "";
  return value;
}

function parseDoubleQuoted(value: string): string | undefined {
  let out = "";
  for (let index = 1; index < value.length; index++) {
    const char = value[index];
    if (char === undefined) return undefined;
    if (char === '"') return out;
    if (char !== "\\") {
      out += char;
      continue;
    }
    const escaped = value[index + 1];
    if (escaped === undefined) return undefined;
    index += 1;
    out += unescapeDouble(escaped);
  }
  return undefined;
}

function unescapeDouble(char: string): string {
  switch (char) {
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "t":
      return "\t";
    case "\\":
      return "\\";
    case '"':
      return '"';
    default:
      return char;
  }
}

function parseSingleQuoted(value: string): string | undefined {
  let out = "";
  for (let index = 1; index < value.length; index++) {
    const char = value[index];
    if (char === undefined) return undefined;
    if (char !== "'") {
      out += char;
      continue;
    }
    if (value[index + 1] === "'") {
      out += "'";
      index += 1;
      continue;
    }
    return out;
  }
  return undefined;
}

function quoteClosed(text: string, quote: '"' | "'", start: number): boolean {
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (quote === "'") {
      if (char !== "'") continue;
      if (text[index + 1] === "'") {
        index += 1;
        continue;
      }
      return true;
    }
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === '"') return true;
  }
  return false;
}

/** The block scalar's final newline ends the last line; it is not a blank comment line. */
function combineComments(existing: string, added: string): string {
  if (existing.length === 0) return added;
  const base = existing.endsWith("\n") ? existing.slice(0, -1) : existing;
  return `${base}\n${added}`;
}

function serializeComment(value: string, nl: string): string {
  if (!value.includes("\n")) return `comment: ${formatYamlScalar(value)}${nl}`;
  const lines = value.split("\n");
  const header = `comment: |${needsExplicitIndent(lines) ? "2" : ""}-`;
  return [header, ...lines.map((line) => `  ${line}`)].join(nl) + nl;
}

function needsExplicitIndent(lines: string[]): boolean {
  const first = lines.find((line) => line.length > 0);
  if (!first) return true;
  return first.startsWith(" ") || first.startsWith("\t");
}
