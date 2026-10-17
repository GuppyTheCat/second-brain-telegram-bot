import { access, link, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ExistingNote {
  filename: string;
  noteName: string;
}

export interface DailyJournalEntry {
  /** `YYYY-MM-DD`, also the daily-note filename. */
  date: string;
  /** English heading, for example `Saturday, October 17th, 2026`. */
  heading: string;
  /** `### HH:mm` followed by the entry body. */
  entry: string;
}

export interface VaultStore {
  createNote(filename: string, content: string): Promise<void>;
  chooseNoteFilename(filename: string): Promise<string>;
  findBySource(source: string): Promise<ExistingNote | undefined>;
  appendDailyJournal(entry: DailyJournalEntry): Promise<void>;
  saveAttachment(directory: string, filename: string, bytes: Uint8Array): Promise<string>;
}

export function createVaultStore(root: string): VaultStore {
  return {
    async createNote(filename, content) {
      assertSegment(filename);
      await exclusiveWrite(root, filename, content);
    },
    async chooseNoteFilename(filename) {
      return freeNoteFilename(root, filename);
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
    async appendDailyJournal(entry) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
        throw new Error(`daily note date must be YYYY-MM-DD: ${entry.date}`);
      }
      const relative = path.join("Periodic", "Daily", `${entry.date}.md`);
      const target = resolveInside(root, relative);
      let content: string;
      try {
        content = await readFile(target, "utf8");
      } catch (error) {
        if (!isEnoent(error)) throw error;
        try {
          await exclusiveWrite(root, relative, dailySkeleton(entry));
          return;
        } catch (createError) {
          if (!isEexist(createError)) throw createError;
          content = await readFile(target, "utf8");
        }
      }
      await atomicWrite(root, relative, insertJournalEntry(content, entry.entry));
    },
    async saveAttachment(directory, filename, bytes) {
      assertSegment(directory);
      assertSegment(filename);
      const chosen = await chooseAttachmentName(root, directory, filename);
      await atomicWrite(root, path.join(directory, chosen), bytes);
      return chosen;
    },
  };
}

function dailySkeleton(entry: DailyJournalEntry): string {
  return `---
categories:
  - "[[Journal]]"
created: ${entry.date}
tags:
  - daily
---

# ${entry.heading}

## Notes
![[Daily.base]]

## Journal
${entry.entry}

---

![[tasks-default.base#Today]]

---

![[tasks-default.base#Past tasks]]

---
![[Daily Note - Inbox]]
`;
}

function insertJournalEntry(content: string, entry: string): string {
  const nl = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const entryLines = entry.split(/\r?\n/);
  const journalAt = lines.findIndex((line) => line === "## Journal");
  if (journalAt !== -1) {
    const divider = sectionDivider(lines, journalAt + 1);
    const section = lines.slice(journalAt + 1, divider);
    while (section.length > 0 && section.at(-1) === "") section.pop();
    const next = section.length === 0 ? entryLines : [...section, "", ...entryLines];
    return [...lines.slice(0, journalAt + 1), ...next, "", ...lines.slice(divider)].join(nl) + nl;
  }
  const divider = sectionDivider(lines, frontmatterEnd(lines));
  return [...lines.slice(0, divider), "## Journal", ...entryLines, "", ...lines.slice(divider)].join(nl) + nl;
}

// A `---` inside journal or notes text is stored as sent. The section ends at a rule
// whose next non-blank line is an embed, or at the end of the file.
function sectionDivider(lines: readonly string[], from: number): number {
  for (let index = from; index < lines.length; index++) {
    if (lines[index] !== "---") continue;
    if (closesSection(lines, index)) return index;
  }
  return lines.length;
}

function closesSection(lines: readonly string[], divider: number): boolean {
  for (let index = divider + 1; index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined || line.length === 0) continue;
    return line.startsWith("![[");
  }
  return true;
}

function frontmatterEnd(lines: readonly string[]): number {
  if (lines[0] !== "---") return 0;
  for (let index = 1; index < lines.length; index++) {
    if (lines[index] === "---") return index + 1;
  }
  return 0;
}

function assertSegment(name: string): void {
  if (name.length === 0 || name === "." || name === ".." || name !== path.basename(name)) {
    throw new Error(`filename must be a single path segment: ${name}`);
  }
}

async function freeNoteFilename(root: string, filename: string): Promise<string> {
  assertSegment(filename);
  if (!filename.endsWith(".md")) throw new Error(`note filename must end with .md: ${filename}`);
  const stem = filename.slice(0, -".md".length);
  for (let attempt = 1; attempt <= 1000; attempt++) {
    const candidate = attempt === 1 ? filename : `${stem} ${attempt}.md`;
    assertSegment(candidate);
    try {
      await access(path.join(root, candidate));
    } catch (error) {
      if (isEnoent(error)) return candidate;
      throw error;
    }
  }
  throw new Error(`no free note name for ${filename}`);
}

async function chooseAttachmentName(root: string, directory: string, filename: string): Promise<string> {
  const folder = path.join(root, directory);
  const extension = path.extname(filename);
  const stem = filename.slice(0, filename.length - extension.length);
  for (let attempt = 1; attempt <= 1000; attempt++) {
    const candidate = attempt === 1 ? filename : `${stem}-${attempt}${extension}`;
    try {
      await access(path.join(folder, candidate));
    } catch (error) {
      if (isEnoent(error)) return candidate;
      throw error;
    }
  }
  throw new Error(`no free attachment name for ${filename}`);
}

function isEnoent(error: unknown): boolean {
  return isFsError(error, "ENOENT");
}

function isEexist(error: unknown): boolean {
  return isFsError(error, "EEXIST");
}

function isFsError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function isRootNote(name: string): boolean {
  return name.endsWith(".md") && !name.startsWith(".syncthing.");
}

async function atomicWrite(root: string, relativePath: string, data: string | Uint8Array): Promise<void> {
  const target = resolveInside(root, relativePath);
  const temporary = await writeTemporary(target, data);
  await rename(temporary, target);
}

// link fails with EEXIST instead of replacing a note that appeared after the name was chosen.
async function exclusiveWrite(root: string, relativePath: string, data: string | Uint8Array): Promise<void> {
  const target = resolveInside(root, relativePath);
  const temporary = await writeTemporary(target, data);
  try {
    await link(temporary, target);
  } catch (error) {
    await unlink(temporary);
    throw error;
  }
  await unlink(temporary);
}

async function writeTemporary(target: string, data: string | Uint8Array): Promise<string> {
  const directory = path.dirname(target);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.syncthing.${path.basename(target)}.tmp`);
  await writeFile(temporary, data);
  return temporary;
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

function resolveInside(rootDir: string, relativePath: string): string {
  if (relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new Error(`refusing to write outside the vault: ${relativePath}`);
  }
  const root = path.resolve(rootDir);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`refusing to write outside the vault: ${relativePath}`);
  }
  return target;
}
