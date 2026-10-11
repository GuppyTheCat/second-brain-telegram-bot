# 03: Comment sent with a forward

**What to build:** When I type a comment in the same forward action, Telegram delivers it as a plain text message just before the forwarded post(s). The bot attaches that comment to the post(s) and stores it in the note's `comment` property, so I can later find clippings by why I saved them.

Behaviour, per the spec's comment grouping rules:

- A comment opens a pending window (configurable, around 3 seconds). Every channel forward arriving while the window is open gets the comment, and each forward extends the window.
- If the window closes with no forward, the bot replies "комментарий без поста — не сохранил" and writes nothing.
- A new comment replaces a pending one. If the replaced comment never got attached to a post, it's rejected with the same reply.
- A forward with no pending comment is saved without `comment`.

**Blocked by:** 01 (Tracer bullet — forwarded text post becomes a clipping note)

**Status:** done

- [x] A comment followed by a forward produces a note whose `comment` holds the comment text
- [x] A multi-line comment is stored as a YAML block scalar and round-trips intact
- [x] One comment followed by several forwards (including from different channels) gives every resulting note the same `comment`
- [x] A comment with no forward within the window gets "комментарий без поста — не сохранил" and creates no file
- [x] A second comment sent before any forward replaces the first, and the first is reported as not saved
- [x] A forward without a preceding comment has no `comment` property at all
- [x] Tests drive the window with the fake clock, never with real sleeps
