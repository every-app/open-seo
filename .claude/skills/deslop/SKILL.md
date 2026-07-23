---
name: deslop
description: Remove AI writing patterns from prose. Use this skill when writing, drafting, editing, reviewing, or revising any text to eliminate predictable AI tells, slop, and formulaic patterns. Trigger this skill whenever the user asks to "deslop", "de-AI", "make it sound human," "remove AI patterns," "remove AI tropes," "clean up AI writing," fix "slop," "deslop" text, or review prose for authenticity. Also use when the user asks you to write or draft anything and wants it to sound natural rather than AI-generated. Common use cases include scientific writing (manuscripts, abstracts, cover letters, grant narratives, discussion sections, peer review responses), blog posts, newsletters, memos, reports, and any other substantial prose.
---

# Deslop: Remove AI Writing Patterns from Prose

Strip predictable AI patterns from writing. Make prose sound like a specific human wrote it, not like a language model generated it.

## When to Apply

- Any request to "make it sound human" or "deslop" writing
- Any prose (articles, blog posts, essays, memos, newsletters, reports) or scientific writing (manuscripts, abstracts, cover letters, grant narratives, discussion sections, peer review responses) where the user wants it to sound natural rather than AI-generated
- Editing or revising existing text where the user wants it to sound natural rather than AI-generated
- Reviewing text for AI tells

## Core Rules

### 1. Cut filler phrases

Remove throat-clearing openers ("Here's the thing:"), emphasis crutches ("Let that sink in."), business jargon ("navigate the landscape"), and meta-commentary ("In this section, we'll explore..."). See [references/phrases.md](references/phrases.md) for the full catalog.

### 2. Break formulaic structures

Avoid binary contrasts ("Not X. Y."), negative listings ("Not a X. Not a Y. A Z."), dramatic fragmentation ("Speed. That's it. That's the tradeoff."), self-posed rhetorical questions ("The result? Devastating."), and anaphora/tricolon abuse. See [references/structures.md](references/structures.md) for patterns and fixes.

### 3. Eliminate AI tropes

Watch for the full catalog of AI writing tells: "quietly" and other magic adverbs, "delve" and its cousins, the "serves as" dodge, false ranges ("from X to Y" where the range is meaningless), superficial participle analyses ("highlighting its importance"), invented concept labels ("the supervision paradox"), grandiose stakes inflation, patronizing analogies, and false vulnerability. See [references/tropes.md](references/tropes.md) for the complete list with examples.

### 4. Use active voice with human subjects

Prefer active constructions with named actors. "The complaint becomes a fix" is wrong. "The team fixed it" is right. If no specific person fits, use "we" in scientific prose or "you" in blog posts.

### 5. Be specific

No vague declaratives ("The reasons are structural"). Name the specific thing. No lazy extremes ("every," "always," "never") doing vague work. No vague attributions ("Experts argue..."). If you cannot name the expert, you do not have a source.

In scientific writing, domain terminology is fine and expected. "Weighted interval score" is precise language, not jargon. The problem is business buzzwords ("leverage," "landscape," "ecosystem") and AI vocabulary tells ("delve," "tapestry," "nuanced") leaking into technical prose.

### 6. Match register to context

In blog posts and newsletters, put the reader in the room. "You" beats "People." Specifics beat abstractions. No narrator-from-a-distance voice.

In scientific writing, maintain appropriate formality. Use "we" for your own work, cite specific authors instead of "researchers have shown," and avoid both the distant narrator ("It has long been recognized that...") and the overly casual blog voice. State claims and back them with citations.

### 7. Vary rhythm

Mix sentence lengths. Two items beat three. End paragraphs differently. No em dashes. Do not stack short punchy fragments for manufactured emphasis. Do not write listicles disguised as prose ("The first wall... The second wall...").

### 8. Trust readers

State facts directly. Skip softening, justification, hand-holding. No "Let's break this down." No "Think of it as..." No pedagogical voice unless the audience genuinely needs it. No fractal summaries (telling the reader what you are about to say, saying it, then summarizing what you said).

### 9. Watch formatting tells

No bold-first bullets (every list item starting with a bolded keyword). No unicode arrows. No em dashes. No signposted conclusions ("In conclusion..."). No "Despite these challenges..." formulas. These are strong AI signals.

### 10. Do not dilute

One point per section. Do not restate the same argument in ten different ways across thousands of words. Do not beat a single metaphor to death. Do not stack historical analogies for false authority ("Apple didn't build Uber. Facebook didn't build Spotify...").

## Quick Checks

Run these before delivering any prose:

- Heavy use of adverbs or -ly words? Cut them.
- Any passive voice? Find the actor, make them the subject. 
- Inanimate thing doing a human verb? Name the person.
- Any "here's what/this/that" throat-clearing? Cut to the point.
- Any "not X, it's Y" contrasts? State Y directly.
- Any self-posed rhetorical question answered immediately? Fold into a statement.
- Three consecutive sentences match length? Break one.
- Paragraph ends with a punchy one-liner? Vary it.
- Em dash anywhere? Remove it. Use a comma or period or a parenthetical.
- Vague declarative ("The implications are significant")? Name the specific implication.
- Any sentence starting with What/When/Where/Which/Who/Why/How as a crutch? Restructure.
- Meta-joiners ("The rest of this essay...")? Delete.
- "It's worth noting" or similar filler transitions? Delete.
- Same metaphor used more than twice? Replace or cut repeats.
- "Despite these challenges..." formula? Rewrite.
- Bold-first bullet pattern? Remove bold leads.
- Tricolon (three-item list)? Use two items or one.

## Scoring

When reviewing text, rate 1-10 on each dimension:

| Dimension | Question |
|-----------|----------|
| Directness | Statements or announcements? |
| Rhythm | Varied or metronomic? |
| Trust | Respects reader intelligence? |
| Authenticity | Sounds like a specific human wrote it? |
| Density | Anything cuttable? |

Below 35/50: revise.

## Reference Files

Consult these for detailed catalogs when writing or editing:

- [references/phrases.md](references/phrases.md): Phrases to remove or replace (throat-clearing, emphasis crutches, business jargon, adverbs, meta-commentary, vague declaratives)
- [references/structures.md](references/structures.md): Structural patterns to avoid (binary contrasts, negative listings, dramatic fragmentation, rhetorical setups, false agency, passive voice, rhythm problems)
- [references/tropes.md](references/tropes.md): Full catalog of AI writing tropes (word choice, sentence structure, paragraph structure, tone, formatting, composition)
- [references/examples.md](references/examples.md): Before/after transformations showing how to fix common patterns

## Examples

See [references/examples.md](references/examples.md) for before/after transformations.

**Quick inline example (scientific writing):**

Before:
> "It's worth noting that these findings have important implications for how we navigate the challenges of forecast ensembling moving forward. Despite these challenges, this work contributes meaningfully to the growing body of literature, highlighting the need for continued evaluation."

After:
> "If individual model rankings are unstable across geography and time, ensemble methods that weight models by past performance may not improve on equal-weight approaches."

Changes: Replaced filler transition, vague declarative, "despite these challenges" formula, and superficial participle analysis with the specific implication.

**Quick inline example (blog post):**

Before:
> "Here's the thing: most bioinformatics pipelines break in production. Not because the code is bad. Because the data is bad. Let that sink in."

After:
> "Most bioinformatics pipelines break in production. The code runs fine. The data doesn't match the assumptions baked into it."

Changes: Removed opener, binary contrast, and emphasis crutch. Named the specific problem.
