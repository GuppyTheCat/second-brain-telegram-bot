# 05: Telegram formatting rendered as Markdown

**What to build:** Saved posts keep their formatting. Telegram message entities are converted to Markdown in the note body, so the note reads like the original post and links hidden behind text aren't lost.

Mapping, per the spec:

- bold → `**`
- italic → `*`
- strikethrough → `~~`
- inline code → backticks
- pre → fenced block, with the language when given
- blockquote → `>` lines
- text link → `[text](url)`
- plain URLs, mentions and hashtags → kept as text
- underline and spoiler → plain text
- custom emoji → its fallback emoji character

**Blocked by:** 01 (Tracer bullet — forwarded text post becomes a clipping note)

**Status:** ready-for-agent

- [ ] Each entity type in the mapping renders as specified
- [ ] Hidden text links appear as markdown links with the original URL
- [ ] Nested and overlapping entities (e.g. a bold link, italic inside bold) render correctly
- [ ] Offsets are handled in UTF-16 code units, so text with emoji and other astral characters before an entity is converted correctly
- [ ] Captions of media posts get the same conversion (verifiable once ticket 06 lands; text posts are enough for this ticket)
- [ ] Tests assert on the full rendered note body through the Inbox
