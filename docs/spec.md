# Second Brain Telegram Bot — Spec

## Problem Statement

I read many Telegram channels and regularly find posts worth keeping in my Obsidian vault (Second Brain). Today, saving a post means copying its text by hand, recreating the frontmatter my clipping notes use, downloading media, and remembering which channel and post it came from. The Telegram Sync Obsidian plugin I tried could not produce my clipping format (no channel link, wikilinks instead of inline media previews, wrong title and filename) and only runs inside Obsidian on a device.

I also lose the reason I saved a post. When I forward something, I usually have an intent ("try this config", "turn this into a note about DR"), but nothing records that intent next to the post, so I can't find "posts I meant to do something with" later.

## Solution

A personal Telegram bot, built with grammY and running on my server (elven-fortress), that writes directly into the vault folder that Syncthing already syncs to all my devices.

I forward a channel post to the bot and a clipping note appears at the vault root, in the same format as my existing Telegram clippings, with media downloaded and embedded inline. Plain text I send, and those forwards, also land in the day's journal as one entry when they arrive inside a short window. A forward is recorded there as a post callout that links the clipping. Forwarding a post that is already saved never creates a duplicate. The bot replies with the note name when a clipping is saved, and with the journal time when the entry is written. Only I can use the bot.

## User Stories

1. As the vault owner, I want to forward a channel post to the bot, so that it is saved as a clipping note without manual copying.
2. As the vault owner, I want the note to be created at the vault root, so that it follows the vault's minimum-folders convention.
3. As the vault owner, I want the filename to be `YYYY-MM-DD HH-mm <Channel name>`, so that new clippings match the existing Telegram clippings.
4. As the vault owner, I want the date and time in the filename to be the original post's publication time, so that the filename reflects when the content was published, not when I forwarded it.
5. As the vault owner, I want publication times rendered in my timezone (Europe/Moscow), so that filenames match how I perceive time.
6. As the vault owner, I want the note's `title` to be the channel name only, so that titles are clean and consistent.
7. As the vault owner, I want the note's `categories` to be Clippings and Posts, so that it shows up in my existing Clippings and Posts views.
8. As the vault owner, I want the `telegram` property to hold a markdown link to the channel, so that I can open the channel and filter clippings by channel.
9. As the vault owner, I want the `source` property to hold the direct link to the post, so that I can open the original and so that duplicates can be detected.
10. As the vault owner, I want `published` to be the post's date and `created` to be the forward date, so that both dates are queryable in Bases.
11. As the vault owner, I want `author` and `topics` left empty and no `#telegram` tag added, so that I fill topics myself and the format matches my current conventions.
12. As the vault owner, I want the post text in the note body, so that I can read and search it in Obsidian.
13. As the vault owner, I want Telegram formatting (bold, italic, strikethrough, code, pre blocks, quotes, links, hidden text links) converted to Markdown, so that the note reads like the original post and hidden links aren't lost.
14. As the vault owner, I want photos, videos, animations, documents, audio and voice messages downloaded into the vault's attachments folder, so that media lives in the vault and syncs with it.
15. As the vault owner, I want downloaded media embedded inline in the note, so that I see it while reading, not as a bare link.
16. As the vault owner, I want an album (several media in one post) saved as one note with all its media, so that one post equals one note.
17. As the vault owner, I want a file larger than the Bot API download limit (20 MB) to be replaced by a "media not downloaded" line with a link to the post, so that the note is still created and I know where to find the media.
18. As the vault owner, I want a post with media but no text to still produce a valid note, so that image-only posts can be saved.
19. As the vault owner, I want plain text I send to be saved in that day's journal, so that a thought is kept even when I don't forward a post.
20. As the vault owner, I want text and channel forwards that arrive inside a short window to become one journal entry, in arrival order, so that a thought and the post it refers to stay together.
21. As the vault owner, I want the entry written when the window closes, under a `### HH:mm` heading from the first part's time, so that one burst becomes one entry.
22. As the vault owner, I want a channel forward recorded in the journal as a `> [!post]` wikilink to the clipping, so that the daily note points at the post.
23. As the vault owner, I want the clipping itself to have no `comment` property, so that the intent lives in the journal.
24. As the vault owner, I want a message that arrives after the window to start another journal entry, so that later thoughts stay separate.
25. As the vault owner, I want forwarding an already-saved post to never create a second note, so that my vault has no duplicates.
26. As the vault owner, I want a duplicate forward to still add a journal callout pointing at the existing note, so that the daily note records that I forwarded it again.
27. As the vault owner, I want the bot to reply with the saved note's name, so that I get immediate confirmation.
28. As the vault owner, I want a distinct reply when a post was already saved, so that I understand why no new note appeared.
29. As the vault owner, I want messages that aren't plain text or channel post forwards (forwards from users or groups, stickers, my own media) to be answered with "не поддерживается", so that I know the bot ignored them on purpose.
30. As the vault owner, I want forwards from private channels (no public username) to be supported, so that I can save posts from channels I'm subscribed to privately.
31. As the vault owner, I want a private channel's `telegram` property to contain just the channel name and its `source` to use the private post link format, so that the note is still informative and deduplicable.
32. As the vault owner, I want two different posts that would get the same filename to both be saved under distinct filenames, so that no note is overwritten.
33. As the vault owner, I want channel names containing characters that are invalid in filenames or Obsidian links to be sanitised in the filename (but kept intact in `title`), so that notes are always creatable and linkable.
34. As the vault owner, I want only my Telegram account to be able to use the bot, so that nobody else can write into my vault.
35. As the vault owner, I want messages from other users ignored silently, so that the bot doesn't reveal itself to strangers.
36. As the vault owner, I want the bot to reach Telegram through a SOCKS proxy when one is configured, so that it works from a server where Telegram is blocked.
37. As the vault owner, I want the bot to use long polling, so that it needs no public URL, TLS or reverse proxy setup.
38. As the vault owner, I want notes and attachments written atomically, so that Syncthing never syncs a half-written file.
39. As the vault owner, I want files created with the same owner as Syncthing's data, so that Syncthing can sync and later modify them without permission errors.
40. As the vault owner, I want the bot to run as a Docker Compose service that restarts automatically, so that it survives crashes and server reboots like my other services.
41. As the vault owner, I want all configuration (bot token, allowed user ID, proxy URL, vault path, timezone, comment window) passed through environment variables, so that secrets stay out of the repository.
42. As the vault owner, I want the bot to log what it saved and any errors, so that I can troubleshoot on the server.
43. As the vault owner, I want a failed media download (other than the size limit) to still produce the note with a "media not downloaded" line and an error mention in the reply, so that the post isn't lost because of one file.
44. As the vault owner, I want edited messages to be ignored, so that editing my comment in the chat doesn't create surprises in the vault.

## Implementation Decisions

**Stack and runtime**

- TypeScript on Node.js, pnpm, grammY. Same overall shape as my existing Housekeeper Bot on the same server.
- Long polling, no webhooks.
- Optional SOCKS proxy for all Telegram traffic (both Bot API calls and file downloads), via a SOCKS proxy agent passed into grammY's client fetch configuration. No proxy when the proxy URL is unset.
- Updates are processed sequentially; there's a single user, so throughput isn't a concern.
- Deployed with Docker Compose on elven-fortress. The Syncthing-managed vault folder is bind-mounted into the container. The container process runs with the UID/GID that owns the Syncthing data.
- Repository is hosted on my Gitea (`blackmage/second-brain-telegram-bot`).

**Configuration (environment)**

- Bot token.
- Allowed Telegram user ID (a single numeric ID).
- Proxy URL (optional).
- Vault path (the mounted vault root).
- Attachments folder name inside the vault (default `Attachments`).
- Timezone (default `Europe/Moscow`).
- Comment window in milliseconds (default around 3000).
- Album window in milliseconds (default around 1500). Each new part of a media group restarts it.

**Modules**

- **Inbox** — the one deep module and the single test seam. It receives Telegram messages one by one in arrival order and is told when time passes. It decides what each message means (plain text, channel forward, album part, unsupported), groups text and forwards into one journal entry and album parts into one post, and drives everything else: rendering, deduplication, writing, replies. Its interface is roughly: create an inbox with its dependencies (vault store, media fetcher, reply sink, clock/timer), then feed it messages. Everything else in the repo is either a dependency of the Inbox or thin wiring around it.
- **Note rendering** — internal to the Inbox. Turns a grouped post (channel info, post id, dates, text with entities, media references) into a filename and note content. Covers Telegram-entity-to-Markdown conversion, filename sanitisation and frontmatter layout. It does not write a `comment` property.
- **Vault store** — a dependency of the Inbox backed by the real filesystem. Operations: find an existing clipping by `source`, create a note under a unique filename, append a journal entry to `Periodic/Daily/YYYY-MM-DD.md`, save an attachment under a unique filename. Writes are atomic (temp file in the same directory with a name Syncthing ignores, then rename).
- **Media fetcher** — a dependency of the Inbox. Given a Telegram file reference, returns the bytes and a suggested extension, or a typed failure: "too large" (over 20 MB) or "failed". The production version uses the Bot API through the proxy.
- **Reply sink** — a dependency of the Inbox that sends a text reply to the chat.
- **Bot shell** — grammY bot setup, the allowlist middleware (silently drops updates from anyone else), ignoring edited messages, proxy agent and config loading. It feeds messages into the Inbox and wires production dependencies.

**Message classification**

- A *channel forward* is a message whose forward origin is of type "channel". Every other forward origin (user, hidden user, chat/group) is unsupported.
- *Plain text* is a message with no forward origin and string `text`. It joins the journal.
- Anything else (stickers, non-forwarded media, forwards from people or groups) is unsupported and gets "не поддерживается".

**Journal grouping**

- Plain text and channel forwards share one journal buffer. Anything that arrives while the gap stays inside the comment window (`COMMENT_WINDOW_MS`, default 3000) is the same entry, in arrival order. Each new text or forward restarts the window. The heading uses the first part's time.
- The bot writes the entry once, when the window closes, into `Periodic/Daily/YYYY-MM-DD.md` (date and `### HH:mm` from the message time in the configured timezone), then replies once with `YYYY-MM-DD HH:mm`.
- Text stays as sent. A channel forward is recorded as a two-line callout: `> [!post]` and `> [[note name]]`. The clipping is saved immediately, with no `comment`, and its reply (the note name, or «уже сохранено») is separate from the journal reply.
- A duplicate forward still adds that callout, pointing at the existing note.
- A missing daily note is created from the daily template skeleton (frontmatter, English heading such as `Saturday, October 17th, 2026`, `## Notes`, `## Journal`, the task embeds) without the "Add some notes here..." placeholder. The entry goes under `## Journal`. An existing file gets the entry at the end of `## Journal`, before the `---` that follows that section. If `## Journal` is missing, the section is added before the first `---` after the frontmatter.
- An album is one clipping and one callout, added when the album note is saved. The journal timer does not flush while that album is still open.
- Pending state is in memory only; a restart drops an open journal entry. That's acceptable.

**Album grouping**

- Messages from the same chat with the same media group ID are buffered for the album window (each new part restarts it) and saved as one post: one note, all media in `forward_origin.message_id` order, captions joined in that order with a blank line. The post's link and filename use the lowest message ID and its publication date. The journal does not flush while the album is open. When the note is saved, one callout joins the open journal entry and the journal window is armed.

**Note format**

- Location: vault root.
- Filename: `YYYY-MM-DD HH-mm <Channel name>.md`, using the original post date in the configured timezone. The channel name is stripped of characters that are invalid in filenames or Obsidian links. If a file with that name already exists (for a different source), a numeric suffix is added.
- Frontmatter, in this order:
  - `categories`: list of `"[[Clippings]]"` and `"[[Posts]]"`.
  - `title`: channel name, verbatim.
  - `telegram`: `"[username](https://t.me/username)"` for public channels; channel name only for private channels.
  - `source`: `https://t.me/<username>/<postId>` for public channels; `https://t.me/c/<internal channel id>/<postId>` for private channels.
  - `published`: original post date (`YYYY-MM-DD`).
  - `created`: forward date (`YYYY-MM-DD`).
- No `author`, `topics`, `tags` or `comment` written. The bot does not produce a `comment` property.
- Body: post text converted to Markdown, followed by media embeds (`![[<attachment file>]]`). Media over the limit or failed downloads become a line saying the media wasn't downloaded, with a link to the post.

**Telegram entity → Markdown**

- bold → `**`, italic → `*`, strikethrough → `~~`, inline code → backticks, pre → fenced block with language when given, blockquote → `>` lines, text link → `[text](url)`, plain URLs, mentions and hashtags kept as text, underline and spoiler kept as plain text, custom emoji → its fallback emoji character.
- Entity offsets are in UTF-16 code units, the same as JavaScript strings. Nested and overlapping entities must render correctly.

**Attachments**

- Saved into the configured attachments folder, named after the note's filename plus an index (and the correct extension). A numeric suffix is added on collision.
- For photos, the largest available size is downloaded.

**Deduplication**

- Before creating a note, the Inbox asks the vault store for an existing note whose `source` equals the post link. Root-level notes are scanned on demand; there's no persistent index or database, because the vault is the source of truth and is also edited from other devices.
- On a match: no new note and no media download. The reply names the existing note. The journal still records a callout to that note.

**Daily journal**

- Location: `Periodic/Daily/YYYY-MM-DD.md`.
- A new file uses the vault's daily-note skeleton. Later entries in the same day are inserted at the end of `## Journal`.
- Parts of one entry are joined with a newline. Separate entries are separated by a blank line.

**Replies (Russian)**

- Saved: the note name.
- Already saved: «уже сохранено» plus the existing note name.
- Journal entry written: `YYYY-MM-DD HH:mm` from the first part, in the configured timezone.
- Media problems: the note name plus a short mention of which media weren't downloaded.
- Unsupported: "не поддерживается".

## Testing Decisions

- **One seam: the Inbox.** Tests feed it realistic Telegram message objects (channel forwards, private channel forwards, album parts, plain text, unsupported messages) and assert on observable results only: files that exist in the vault folder (names and full contents) and replies sent. Tests never assert on internal rendering helpers, classification functions or call sequences.
- **Dependencies in tests:**
  - Vault store: the real filesystem implementation over a fresh temporary directory per test. This also covers atomic writes, collision suffixes and frontmatter appends for real.
  - Media fetcher: a fake that returns fixed bytes, "too large" or "failed" per file reference.
  - Reply sink: a recorder.
  - Clock/timer: a controllable fake, so journal and album windows are advanced explicitly instead of slept.
- **Scenarios covered:**
  - Plain post.
  - Plain text written to the daily note after the journal window, including two texts in one entry and a later message as a second entry.
  - A forward alone, and text followed by a forward, as a journal entry with a post callout. The clipping has no `comment`.
  - A duplicate forward still adds a callout to the existing note.
  - Album, with and without a caption, adding one journal callout.
  - Media-only post.
  - Oversized and failed media.
  - Duplicate forward, leaving the clipping unchanged.
  - Private channel.
  - Filename collision and channel name sanitisation.
  - Formatting conversion, including nested entities, hidden links and emoji/UTF-16 offsets.
  - Unsupported messages.
- **Not tested automatically:** the bot shell (grammY wiring, allowlist middleware, proxy) and Docker deployment. These are verified manually on the server by forwarding real posts.
- **Test runner:** Vitest.
- **Prior art:** none. This repo is new, and Housekeeper Bot has no tests. The format reference is the vault's existing Telegram clippings (e.g. the Denis Sexy IT note from 2026-03-31).

## Out of Scope

- Filling `author` or `topics`, automatically or via AI.
- Forwards from users, groups or hidden accounts; links and web pages beyond the text that was sent.
- Adding or editing a comment later by replying to a saved post.
- Undo/delete from the chat.
- Files over 20 MB (no local Bot API server).
- Polls, link preview cards, location, contacts and other non-media message types beyond their text.
- Bulk import of a whole channel (tracked separately in the vault).
- Vault-side changes. These are done in the vault, not in this repo: adding `comment` to the clipping type, a `comment` column in the daily Base, a "clippings with comment" view in the Clippings Base, and removing the Telegram Sync plugin and its template.
- Committing to the vault's git repository. Syncthing handles distribution; commits happen from my workstation.
- Webhooks, multi-user support, persistent state or a database.

## Further Notes

- The source of truth for these decisions is the vault task "2026-05-04 Telegram → Second Brain (clippings)" (now titled "Telegram-бот для клиппингов в Second Brain"). It was clarified in a grilling session on 2026-10-11. Target date: 2026-10-31.
- The server's vault copy is also used by a Cursor agent worker. The bot creates clipping notes and appends journal entries to the daily note, so conflicts with other writers are unlikely.
- Housekeeper Bot on the same host already proves the proxy + Docker Compose + long polling setup. Reuse its deployment pattern rather than inventing a new one.
- Existing Telegram clippings created before the bot (about 83 notes) are left as they are; some use `author` wikilinks and a `#telegram` tag.
