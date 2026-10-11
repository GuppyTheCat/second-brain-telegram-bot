import { telegramToMarkdown, type TelegramEntity } from "./telegram-markdown.js";
import { formatYamlScalar } from "./yaml.js";

export interface ClippingInput {
  title: string;
  username?: string;
  channelId: number;
  postId: number;
  publishedUnix: number;
  createdUnix: number;
  text: string;
  entities?: readonly TelegramEntity[];
  timezone: string;
  comment?: string;
  mediaLines?: readonly string[];
}

export interface RenderedClipping {
  filename: string;
  noteName: string;
  content: string;
  source: string;
}

const MAX_FILENAME_BYTES = 200;
const FILENAME_INVALID = /[\\/:*?"<>|#^\[\]\p{Cc}]/gu;

export function renderClipping(input: ClippingInput): RenderedClipping {
  const published = formatZoned(input.publishedUnix, input.timezone);
  const created = formatZoned(input.createdUnix, input.timezone);
  const prefix = `${published.date} ${published.hour}-${published.minute} `;
  const noteName = `${prefix}${filenameChannel(prefix, input.title)}`;
  const username = input.username && input.username.length > 0 ? input.username : undefined;
  const telegram = username ? `[${username}](https://t.me/${username})` : input.title;
  const source = username
    ? `https://t.me/${username}/${input.postId}`
    : `https://t.me/c/${privateChannelId(input.channelId)}/${input.postId}`;
  const markdown = telegramToMarkdown(input.text, input.entities);
  const body = noteBody(markdown, input.mediaLines ?? []);
  const content = [
    "---",
    "categories:",
    '  - "[[Clippings]]"',
    '  - "[[Posts]]"',
    `title: ${formatYamlScalar(input.title)}`,
    `telegram: ${formatYamlScalar(telegram)}`,
    `source: ${formatYamlScalar(source)}`,
    `published: ${published.date}`,
    `created: ${created.date}`,
    ...formatComment(input.comment),
    "---",
    body,
  ].join("\n");

  return {
    filename: `${noteName}.md`,
    noteName,
    content,
    source,
  };
}

function noteBody(markdown: string, mediaLines: readonly string[]): string {
  if (mediaLines.length === 0) {
    return markdown.endsWith("\n") ? markdown : `${markdown}\n`;
  }
  const embeds = `${mediaLines.join("\n")}\n`;
  if (markdown.length === 0) return embeds;
  const text = markdown.endsWith("\n") ? markdown : `${markdown}\n`;
  return `${text}\n${embeds}`;
}

function formatComment(comment: string | undefined): string[] {
  if (comment === undefined) return [];
  if (!comment.includes("\n")) return [`comment: ${formatYamlScalar(comment)}`];
  return ["comment: |-", ...comment.split("\n").map((line) => `  ${line}`)];
}

function filenameChannel(prefix: string, title: string): string {
  const budget = MAX_FILENAME_BYTES - utf8Length(prefix) - utf8Length(".md");
  const capped = capUtf8(sanitizeChannelTitle(title), budget);
  return capped.length === 0 ? "Telegram" : capped;
}

function sanitizeChannelTitle(title: string): string {
  const cleaned = title
    .replace(FILENAME_INVALID, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[.\s]+$/u, "")
    .trim();
  return cleaned.length === 0 ? "Telegram" : cleaned;
}

function capUtf8(value: string, maxBytes: number): string {
  if (maxBytes <= 0 || utf8Length(value) <= maxBytes) return maxBytes <= 0 ? "" : value;
  let out = "";
  let used = 0;
  for (const char of value) {
    const size = utf8Length(char);
    if (used + size > maxBytes) break;
    out += char;
    used += size;
  }
  return out.replace(/[.\s]+$/u, "").trim();
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

function privateChannelId(channelId: number): string {
  const raw = String(channelId);
  if (raw.startsWith("-100")) return raw.slice(4);
  return raw.replace(/^-/, "");
}

function formatZoned(unixSeconds: number, timeZone: string): { date: string; hour: string; minute: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(unixSeconds * 1000));

  const read = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) throw new Error(`missing date part: ${type}`);
    return value;
  };

  let hour = read("hour");
  if (hour === "24") hour = "00";

  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    hour: hour.padStart(2, "0"),
    minute: read("minute").padStart(2, "0"),
  };
}
