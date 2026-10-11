# 08: Private channels and safe filenames

**What to build:** Posts from private channels (no public username) are saved too. `telegram` holds just the channel name, and `source` uses the private post link format (`t.me/c/<internal channel id>/<postId>`), so duplicates are still detected. Channel names with characters that are invalid in filenames or Obsidian links are sanitised in the filename only; `title` keeps the name verbatim. When the target filename is already taken by a note with a different `source`, the new note gets a numeric suffix instead of overwriting.

**Blocked by:** 01 (Tracer bullet — forwarded text post becomes a clipping note)

**Status:** done

- [x] A private channel forward creates a note whose `telegram` is the channel name without a link
- [x] Its `source` is a valid private post link built from the channel's internal ID and the post ID
- [x] Forwarding the same private post twice is detected as a duplicate (once ticket 02 is in place)
- [x] Characters invalid in filenames or Obsidian links (such as `/ \ : * ? " < > | # ^ [ ]`) are removed or replaced in the filename, while `title` keeps the original channel name
- [x] Two different posts from the same channel published in the same minute produce two notes, the second with a numeric suffix
- [x] No existing file is ever overwritten
