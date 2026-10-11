# 04: Append a comment to an already-saved post

**What to build:** When I forward an already-saved post together with a comment, the bot doesn't create a new note. It appends the new comment to the existing note's `comment` on a new line, creating the property if the note didn't have one. The rest of the note (other frontmatter, body, manual edits like `topics`) stays untouched. The reply says the post was already saved and that the comment was added.

**Blocked by:** 02 (Deduplicate forwards by source), 03 (Comment sent with a forward)

**Status:** done

- [x] Duplicate forward + comment on a note without `comment` adds the property with the comment text
- [x] Duplicate forward + comment on a note that already has `comment` keeps the old text and adds the new comment on a new line
- [x] Other frontmatter properties, their order and the note body are byte-for-byte unchanged apart from `comment`
- [x] Works on notes created outside the bot (e.g. with `topics` or `author` filled manually)
- [x] The reply names the existing note and states that the comment was appended
- [x] A batch comment covering one new and one already-saved post creates the new note with `comment` and appends to the existing one
