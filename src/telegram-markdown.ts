export interface TelegramEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  language?: string;
}

type Kind = "bold" | "italic" | "strike" | "code" | "pre" | "link" | "quote";

interface Span {
  start: number;
  end: number;
  kind: Kind;
  url?: string;
  language?: string;
  fence?: string;
  pad?: boolean;
}

const KIND: Partial<Record<string, Kind>> = {
  bold: "bold",
  italic: "italic",
  strikethrough: "strike",
  code: "code",
  pre: "pre",
  text_link: "link",
  blockquote: "quote",
  expandable_blockquote: "quote",
};

const INLINE = new Set<Kind>(["bold", "italic", "strike", "link"]);

const RANK: Record<Kind, number> = {
  quote: 0,
  pre: 1,
  code: 2,
  link: 3,
  strike: 4,
  bold: 5,
  italic: 6,
};

export function telegramToMarkdown(text: string, entities?: readonly TelegramEntity[]): string {
  if (!entities || entities.length === 0) return text;
  const spans = buildSpans(text, entities);
  if (spans.length === 0) return text;
  return render(text, spans);
}

function buildSpans(text: string, entities: readonly TelegramEntity[]): Span[] {
  let spans = entities.flatMap((entity) => createSpans(text, entity));
  const pres = spans.filter((span) => span.kind === "pre");
  spans = clipAgainst(spans, pres, new Set(["code"]), "split");
  spans = clipAgainst(spans, pres, INLINE, "split");
  spans = clipAgainst(spans, pres, new Set(["quote"]), "wrap");
  spans = clipAgainst(
    spans,
    spans.filter((span) => span.kind === "code"),
    new Set<Kind>([...INLINE, "quote"]),
    "wrap",
  );
  spans = spans.flatMap((span) => (INLINE.has(span.kind) ? retrim(text, span) : [span]));
  return dedupe(spans.filter((span) => span.start < span.end));
}

function createSpans(text: string, entity: TelegramEntity): Span[] {
  const kind = KIND[entity.type];
  if (!kind) return [];
  const { offset, length } = entity;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length)) return [];
  if (offset < 0 || length <= 0 || offset >= text.length) return [];
  const end = Math.min(text.length, offset + length);
  if (end <= offset) return [];
  if (kind === "link" && !entity.url) return [];
  const span: Span = { start: offset, end, kind, url: entity.url, language: entity.language };
  if (!INLINE.has(kind)) return [span];
  return trimLines(text, span.start, span.end).map((piece) => ({ ...span, ...piece }));
}

function clipAgainst(
  spans: Span[],
  blockers: readonly Span[],
  kinds: ReadonlySet<Kind>,
  mode: "split" | "wrap",
): Span[] {
  let current = spans;
  for (const blocker of blockers) {
    const next: Span[] = [];
    for (const span of current) {
      if (span === blocker || !kinds.has(span.kind)) next.push(span);
      else next.push(...clipAround(span, blocker, mode));
    }
    current = next;
  }
  return current;
}

function clipAround(span: Span, block: Span, mode: "split" | "wrap"): Span[] {
  if (block.end <= span.start || block.start >= span.end) return [span];
  if (block.start <= span.start && block.end >= span.end) return [];
  if (mode === "wrap" && block.start > span.start && block.end < span.end) return [span];
  const parts: Span[] = [];
  if (block.start > span.start) parts.push({ ...span, end: block.start });
  if (block.end < span.end) parts.push({ ...span, start: block.end });
  return parts;
}

function retrim(text: string, span: Span): Span[] {
  return trimLines(text, span.start, span.end).map((piece) => ({ ...span, ...piece }));
}

function trimLines(text: string, start: number, end: number): { start: number; end: number }[] {
  const pieces: { start: number; end: number }[] = [];
  let index = start;
  while (index < end) {
    let lineEnd = index;
    while (lineEnd < end && text[lineEnd] !== "\n") lineEnd++;
    let from = index;
    let to = lineEnd;
    while (from < to && isSpace(text[from])) from++;
    while (to > from && isSpace(text[to - 1])) to--;
    if (from < to) pieces.push({ start: from, end: to });
    if (lineEnd >= end) break;
    index = lineEnd + 1;
  }
  return pieces;
}

function dedupe(spans: Span[]): Span[] {
  const unique: Span[] = [];
  for (const span of spans) {
    const seen = unique.some(
      (other) =>
        other.kind === span.kind &&
        other.start === span.start &&
        other.end === span.end &&
        other.url === span.url &&
        other.language === span.language,
    );
    if (!seen) unique.push(span);
  }
  return unique;
}

function render(text: string, spans: Span[]): string {
  const points = new Set<number>([0, text.length]);
  for (const span of spans) {
    points.add(span.start);
    points.add(span.end);
  }
  const cuts = [...points].sort((left, right) => left - right);
  const writer = new Writer();
  let open: Span[] = [];
  let skipNewline = false;

  for (let index = 0; index < cuts.length - 1; index++) {
    const pos = cuts[index] ?? 0;
    const next = cuts[index + 1] ?? text.length;
    const active = spans.filter((span) => span.start <= pos && pos < span.end).sort(outerFirst);
    skipNewline = reconcile(writer, open, active, text, skipNewline);
    open = active;
    skipNewline = emitText(writer, text.slice(pos, next), active, skipNewline);
  }
  reconcile(writer, open, [], text, skipNewline);
  return writer.out;
}

function outerFirst(left: Span, right: Span): number {
  if (left.start !== right.start) return left.start - right.start;
  if (left.end !== right.end) return right.end - left.end;
  return RANK[left.kind] - RANK[right.kind];
}

function reconcile(writer: Writer, prev: Span[], next: Span[], text: string, skipNewline: boolean): boolean {
  let shared = 0;
  while (shared < prev.length && shared < next.length && prev[shared] === next[shared]) shared++;
  const closing = prev.slice(shared).reverse();
  const opening = next.slice(shared);
  for (const span of closing) skipNewline = closeSpan(writer, span, text, skipNewline);
  const left = closing.at(-1);
  const right = opening[0];
  if (left && right) {
    const endChar = emphasisChar(left.kind);
    const startChar = emphasisChar(right.kind);
    // Adjacent runs of the same marker would merge (`****`), so the reopened span would not render.
    if (endChar && endChar === startChar) writer.write("\u200b");
  }
  for (const span of opening) openSpan(writer, span, text);
  return opening.length > 0 ? false : skipNewline;
}

function emitText(writer: Writer, chunk: string, active: readonly Span[], skipNewline: boolean): boolean {
  if (skipNewline) {
    if (chunk.startsWith("\n")) chunk = chunk.slice(1);
    skipNewline = false;
  }
  if (chunk.length === 0) return false;
  const raw = active.some((span) => span.kind === "code" || span.kind === "pre");
  const inLink = !raw && active.some((span) => span.kind === "link");
  writer.write(inLink ? chunk.replaceAll("[", "\\[").replaceAll("]", "\\]") : chunk);
  return false;
}

function openSpan(writer: Writer, span: Span, text: string): void {
  switch (span.kind) {
    case "bold":
      writer.write("**");
      return;
    case "italic":
      writer.write("*");
      return;
    case "strike":
      writer.write("~~");
      return;
    case "link":
      writer.write("[");
      return;
    case "code": {
      const content = text.slice(span.start, span.end);
      const fence = "`".repeat(longestBacktickRun(content) + 1);
      const pad = content.startsWith("`") || content.endsWith("`");
      span.fence = fence;
      span.pad = pad;
      writer.write(pad ? `${fence} ` : fence);
      return;
    }
    case "pre":
      openPre(writer, span, text);
      return;
    case "quote":
      if (!writer.atLineStart) writer.write("\n");
      writer.quoteDepth++;
      return;
  }
}

function closeSpan(writer: Writer, span: Span, text: string, skipNewline: boolean): boolean {
  switch (span.kind) {
    case "bold":
      writer.write("**");
      return skipNewline;
    case "italic":
      writer.write("*");
      return skipNewline;
    case "strike":
      writer.write("~~");
      return skipNewline;
    case "link":
      writer.write(`](${escapeUrl(span.url ?? "")})`);
      return skipNewline;
    case "code":
      writer.write(`${span.pad ? " " : ""}${span.fence ?? "`"}`);
      return skipNewline;
    case "pre":
      closePre(writer, span, text);
      return skipNewline;
    case "quote":
      if (!writer.atLineStart) {
        writer.write("\n");
        writer.quoteDepth--;
        return true;
      }
      writer.quoteDepth--;
      return skipNewline;
  }
}

function openPre(writer: Writer, span: Span, text: string): void {
  const content = text.slice(span.start, span.end);
  const fence = "`".repeat(Math.max(3, longestBacktickRun(content) + 1));
  span.fence = fence;
  if (!writer.atLineStart) writer.write("\n");
  writer.write(`${fence}${fenceLanguage(span.language)}`);
  writer.write("\n");
}

function closePre(writer: Writer, span: Span, text: string): void {
  if (!writer.atLineStart) writer.write("\n");
  writer.write(span.fence ?? "```");
  if (text.charAt(span.end) !== "\n") writer.write("\n");
}

function fenceLanguage(language: string | undefined): string {
  if (!language || /[\r\n`]/.test(language)) return "";
  return language;
}

function emphasisChar(kind: Kind): "*" | "~" | undefined {
  if (kind === "strike") return "~";
  if (kind === "bold" || kind === "italic") return "*";
  return undefined;
}

function escapeUrl(url: string): string {
  return url.replaceAll(" ", "%20").replaceAll("(", "%28").replaceAll(")", "%29");
}

function longestBacktickRun(content: string): number {
  let max = 0;
  let run = 0;
  for (let index = 0; index < content.length; index++) {
    if (content[index] === "`") {
      run++;
      if (run > max) max = run;
    } else {
      run = 0;
    }
  }
  return max;
}

function isSpace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\r" || char === "\f" || char === "\v";
}

class Writer {
  out = "";
  atLineStart = true;
  quoteDepth = 0;

  write(value: string): void {
    if (value.length === 0) return;
    let index = 0;
    while (index < value.length) {
      if (this.atLineStart && this.quoteDepth > 0) {
        this.out += "> ".repeat(this.quoteDepth);
        this.atLineStart = false;
      }
      const newline = value.indexOf("\n", index);
      if (newline === -1) {
        this.out += value.slice(index);
        this.atLineStart = false;
        return;
      }
      this.out += value.slice(index, newline);
      this.out += "\n";
      this.atLineStart = true;
      index = newline + 1;
    }
  }
}
