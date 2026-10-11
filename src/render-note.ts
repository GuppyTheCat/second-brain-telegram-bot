import { formatYamlScalar } from "./yaml.js";

export interface ClippingInput {
  title: string;
  username?: string;
  channelId: number;
  postId: number;
  publishedUnix: number;
  createdUnix: number;
  text: string;
  timezone: string;
}

export interface RenderedClipping {
  filename: string;
  noteName: string;
  content: string;
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
  const body = input.text.endsWith("\n") ? input.text : `${input.text}\n`;
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
    "---",
    body,
  ].join("\n");

  return {
    filename: `${noteName}.md`,
    noteName,
    content,
  };
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
