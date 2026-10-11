# 06: Posts with a single media file

**What to build:** When a forwarded post contains a photo, video, animation, document, audio or voice message, the bot downloads the file into the vault's attachments folder and embeds it inline in the note. Media-only posts (no caption) still produce a valid note. When a file can't be downloaded, the note is still created: it gets a "media not downloaded" line with a link to the post, and the reply mentions the problem. This applies to files over the Bot API's 20 MB limit and to other download failures.

This slice introduces the production media fetcher (Bot API file download through the same optional proxy) and its fake for tests.

**Blocked by:** 01 (Tracer bullet — forwarded text post becomes a clipping note)

**Status:** done

- [x] A photo post saves the largest available photo size into the attachments folder and embeds it as `![[…]]` after the caption text
- [x] Video, animation, document, audio and voice posts are saved and embedded the same way, with correct file extensions
- [x] Attachment filenames derive from the note's filename plus an index; a collision with an existing file gets a numeric suffix
- [x] A media-only post creates a note whose body contains just the embed
- [x] A file over 20 MB is not downloaded; the note contains a "media not downloaded" line with the post link, and the reply mentions it
- [x] Any other download failure behaves the same way as the size limit, and the reply mentions the failure
- [x] Media downloads go through the proxy when one is configured
- [x] Tests use a fake media fetcher returning bytes, "too large" or "failed" per file
