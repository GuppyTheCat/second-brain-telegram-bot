# 02: Deduplicate forwards by source

**What to build:** Forwarding a post that is already saved in the vault never creates a second note. The bot finds the existing clipping by its `source` link and replies that it's already saved, naming the existing note. Existing notes are looked up on demand by scanning root-level notes' frontmatter. There's no index or database, because the vault is also edited from other devices.

**Blocked by:** 01 (Tracer bullet — forwarded text post becomes a clipping note)

**Status:** done

- [x] Forwarding the same post twice leaves exactly one note in the vault
- [x] The second forward gets a reply saying the post is already saved, with the existing note's name
- [x] A clipping created outside the bot (e.g. an older note with the same `source`) is also detected as a duplicate
- [x] The existing note is not modified by a duplicate forward without a comment
- [x] Tests cover duplicate detection through the Inbox, including a pre-existing note seeded into the temp vault
