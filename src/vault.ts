import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ExistingNote {
  filename: string;
  noteName: string;
}

export interface VaultStore {
  createNote(filename: string, content: string): Promise<void>;
  findBySource(source: string): Promise<ExistingNote | undefined>;
}

export function createVaultStore(root: string): VaultStore {
  return {
    async createNote(filename, content) {
      await atomicWrite(root, filename, content);
    },
    async findBySource(source) {
      const entries = await readdir(root, { withFileTypes: true });
      const filenames = entries
        .filter((entry) => entry.isFile() && isRootNote(entry.name))
        .map((entry) => entry.name)
        .sort();
      for (const filename of filenames) {
        const content = await readFile(path.join(root, filename), "utf8");
        if (readSource(content) === source) {
          return { filename, noteName: filename.slice(0, -".md".length) };
        }
      }
      return undefined;
    },
  };
}

function isRootNote(name: string): boolean {
  return name.endsWith(".md") && !name.startsWith(".syncthing.");
}

async function atomicWrite(directory: string, filename: string, data: string | Uint8Array): Promise<void> {
  const target = resolveInside(directory, filename);
  const temporary = path.join(directory, `.syncthing.${path.basename(filename)}.tmp`);
  await writeFile(temporary, data);
  await rename(temporary, target);
}

function readSource(content: string): string | undefined {
  const lines = content.split("\n");
  if (stripCr(lines[0] ?? "") !== "---") return undefined;
  for (let index = 1; index < lines.length; index++) {
    const line = stripCr(lines[index] ?? "");
    if (line === "---" || line === "...") return undefined;
    if (line.length === 0 || line.startsWith(" ") || line.startsWith("\t") || line.startsWith("#")) continue;
    if (!line.startsWith("source:")) continue;
    return parseScalar(line.slice("source:".length));
  }
  return undefined;
}

function stripCr(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

function parseScalar(raw: string): string | undefined {
  const value = raw.trimStart();
  if (value.startsWith('"')) return parseDoubleQuoted(value);
  if (value.startsWith("'")) return parseSingleQuoted(value);
  const trimmed = value.trim();
  if (
    trimmed.length === 0 ||
    trimmed.startsWith("|") ||
    trimmed.startsWith(">") ||
    trimmed.startsWith("[") ||
    trimmed.startsWith("{")
  ) {
    return undefined;
  }
  const commentAt = trimmed.search(/[ \t]#/);
  const plain = (commentAt === -1 ? trimmed : trimmed.slice(0, commentAt)).trimEnd();
  return plain.length === 0 ? undefined : plain;
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

function resolveInside(directory: string, filename: string): string {
  if (filename !== path.basename(filename)) {
    throw new Error(`filename must be a single path segment: ${filename}`);
  }
  const root = path.resolve(directory);
  const target = path.resolve(root, filename);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`refusing to write outside the vault: ${filename}`);
  }
  return target;
}
