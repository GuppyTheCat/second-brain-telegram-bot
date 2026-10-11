# 07: Albums saved as one note

**What to build:** A post with several media (an album) arrives as several messages sharing a media group ID. The bot buffers them briefly and saves them as one note with all media embedded in order. The text is taken from whichever part carries the caption. The post link uses the first message ID of the group. A comment sent together with an album is attached to that single note.

**Blocked by:** 03 (Comment sent with a forward), 06 (Posts with a single media file)

**Status:** done

- [x] An album of N media creates exactly one note with N embeds in original order
- [x] The caption is used as the note text no matter which part of the album carries it
- [x] An album without any caption produces a note with only the embeds
- [x] `source` points to the album's first message
- [x] A comment followed by an album gives the album's note the comment, without the album timing out the comment window
- [x] Some album media failing to download still creates the note, with "media not downloaded" lines for the failed items
- [x] Forwarding an already-saved album is detected as a duplicate (no new note, no downloads)
- [x] Tests drive album buffering with the fake clock
