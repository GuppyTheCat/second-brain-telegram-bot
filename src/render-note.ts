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

export function renderClipping(input: ClippingInput): RenderedClipping {
  const published = formatZoned(input.publishedUnix, input.timezone);
  const created = formatZoned(input.createdUnix, input.timezone);
  const noteName = `${published.date} ${published.hour}-${published.minute} ${input.title}`;
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
