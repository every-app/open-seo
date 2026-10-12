---
name: deslop
description: Remove AI writing patterns from prose so it reads like a person wrote it. Use when writing, editing, or reviewing user-facing text (blog posts, docs, marketing copy, PR descriptions), or when asked to "deslop", "de-AI", or "make it sound human".
metadata:
  internal: true
---

# Deslop

Make prose sound like a specific person wrote it. Fix each tell by stating the underlying claim plainly, not by swapping in a new flourish.

## Cut or rewrite

- Filler: throat-clearing ("Here's the thing:"), emphasis crutches ("Let that sink in."), meta-commentary ("In this section, we'll explore..."), "It's worth noting," and business jargon ("navigate the landscape," "leverage").
- Staged contrasts like "Not X. Y." or "It's not X, it's Y." State Y.
- Manufactured rhythm: dramatic fragments ("Speed. That's it."), rhetorical questions answered right away ("The result? Devastating."), three-part phrasing that exists only for cadence ("fast, simple, and powerful"), and paragraphs that end on a one-liner restating the paragraph.
- AI vocabulary: "delve," "tapestry," "quietly," "serves as," "highlighting its importance," invented concept labels ("the supervision paradox"), and inflated stakes.
- Vagueness: declaratives that name nothing ("The reasons are structural"), "experts argue" with no name, and "every," "always" or "never" doing vague work.
- False agency, where a thing does a person's verb ("the complaint becomes a fix"). Name who did it.
- Signposting: announcing what you're about to say, then summarizing what you said. "In conclusion." "Despite these challenges."
- Formatting tells: em dashes, unicode arrows, and lists where every item opens with a bolded keyword.

## Keep

Specifics (names, numbers, examples), "you" for the reader in blog posts, varied sentence length, and short plain lines that carry information. Keep bullet points and numbered steps for actions and instructions; don't fold them back into paragraphs. When editing someone else's writing, keep their voice.

## Example

Before: "Here's the thing: most pipelines break in production. Not because the code is bad. Because the data is bad. Let that sink in."

After: "Most pipelines break in production. The code runs fine. The data doesn't match the assumptions baked into it."

Adapted from [stephenturner/skill-deslop](https://github.com/stephenturner/skill-deslop) (MIT, see LICENSE).
