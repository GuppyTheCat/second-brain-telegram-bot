# 01: Tracer bullet — forwarded text post becomes a clipping note

**What to build:** When I forward a text-only post from a public Telegram channel to the bot, a clipping note appears at the vault root and the bot replies with the note's name. This is the first end-to-end path through every layer of the bot, as described in the spec (`docs/spec.md`).

Scope of this slice:

- Project scaffold: TypeScript, pnpm, grammY, Vitest.
- Config loaded from environment variables: bot token, allowed user ID, optional proxy URL, vault path, attachments folder, timezone, comment window. Only the ones this slice uses need to be wired; the rest can come later.
- Bot shell:
  - long polling;
  - optional SOCKS proxy for Telegram traffic;
  - allowlist that silently drops updates from anyone but me;
  - edited messages ignored.
- The Inbox module (the single test seam), with its dependencies passed in:
  - vault store over the real filesystem, with atomic writes;
  - reply sink;
  - clock/timer.
  The media fetcher interface can be stubbed for now.
- Note rendering:
  - filename `YYYY-MM-DD HH-mm <Channel name>.md`, using the post's publication time in the configured timezone;
  - frontmatter in spec order: `categories`, `title`, `telegram`, `source`, `published`, `created`;
  - body is the post text as-is (no formatting conversion yet).
- Messages that aren't channel forwards and aren't plain text get "не поддерживается". Plain text (future comments) can be ignored or answered the same way until ticket 03.
- Test harness: helpers that build realistic Telegram message objects and run them through the Inbox against a temp vault directory with a fake clock.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Running the bot locally with a token and a temp vault path: forwarding a text post from a public channel creates exactly one note at the vault root
- [ ] The filename uses the original post's publication date and time in the configured timezone, followed by the channel name
- [ ] Frontmatter contains `categories` (Clippings, Posts), `title` (channel name), `telegram` (markdown link to the channel), `source` (post link), `published` and `created`, in that order, with no `author`, `topics`, `tags` or `comment`
- [ ] The body contains the post text
- [ ] The bot replies with the created note's name
- [ ] Forwards from users or groups, stickers and non-forwarded media get "не поддерживается" and write nothing
- [ ] Updates from a user other than the allowed one are ignored without a reply
- [ ] Edited messages are ignored
- [ ] When a proxy URL is set, Telegram traffic goes through it; when unset, the bot connects directly
- [ ] Notes are written atomically (no partially written file is ever visible under the final name)
- [ ] Vitest tests cover the plain post and unsupported-message scenarios through the Inbox only
