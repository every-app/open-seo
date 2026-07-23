---
name: openseo-review-web-content
description: Review or write copy for the OpenSEO marketing site (web/) — blog posts, library guides, feature pages, FAQs. Covers voice, deslop rules, directness, honest pricing framing, and verifying every product claim against the code. Use whenever adding or editing user-facing prose in web/content or web/src.
---

# OpenSEO Web Content Review

## Goal

Ship marketing copy that reads like a practitioner wrote it, answers questions directly, and never claims something the product doesn't do or a price it doesn't have.

Run this before merging any PR that adds or edits prose in:

- `web/content/blogs/` — blog posts
- `web/content/marketing/library/` — library guides (MDX)
- `web/src/routes/_marketing/` — page copy in TSX string literals and JSX text
- `web/src/lib/feature-pages.ts` — feature-page copy and FAQs
- `web/src/components/` — shared marketing components (CTAs, headers)

## Voice

The reader is an indie founder or SEO freelancer. Write like a practitioner explaining a workflow, not a content marketer selling one. Name things; don't sell them. Specifics beat abstractions ("status codes, titles, meta descriptions" beats "page-level technical signals").

Ben's own drafts are final copy, not a brief. Fill marked gaps and flag factual problems; do not rewrite his sentences into conversion copy.

Guides are tips first, product second. Mid-article product plugs get **deleted, not reworded** — the pitch belongs in the cost-question FAQ and the CTA, and the guide should read as useful without OpenSEO. Don't get into the weeds about OpenSEO inside a how-to.

## Deslop pass

The tells, in order of how often they appear:

1. **Em dashes.** Replace with a comma, colon, semicolon, period, or parenthetical. Exception: verbatim quotes (interview blockquotes) keep their original punctuation. Sweep with:
   `grep -rn "—" web/content web/src/routes/_marketing web/src/lib/feature-pages.ts web/src/components`
2. **"X, not Y" contrasts.** The balanced noun-phrase pivot ("The unit of SEO isn't the keyword; it's the cluster") is the AI smell, and density is the giveaway — budget at most one deliberate contrast per page, placed where the contrast is the actual point. Fix by stating what the thing IS with a concrete consequence, or replacing the aphorism with the reason. Instruction-form contrasts ("Copy the words, not your summary of them") are natural speech; keep them.
3. **Hype and stakes inflation.** "quietly fixes", "evil twin", "stark warning", "intent-matching machine", "the fix your rankings are waiting for". State the claim plainly.
4. **Throat-clearing.** "Here's the thing:", "The practical consequence:", announce-before-quote sentences, "everyone does it wrong" strawman openers. Cut to the point; let quotes land without a setup sentence.
5. **Filler adverbs and intensifiers.** actually, really, dramatically, exactly, "In other words".

Not slop — leave alone: functional `→` arrows (`cluster → URL → status`), bold step labels in numbered how-tos, en dashes in number ranges (5–15), and accurate one-word claims like "Ungated" for a genuinely ungated PDF.

## Directness pass (FAQs especially)

- The first words answer the question. Yes/no questions open with "Yes", "No", "Not quite", or "Not unlimited" — never bury the verdict mid-sentence.
- Banned hedges: "is designed to", "can be paired with", "adds context that can inform", "is useful for teams that", "keeps X organized so it can inform Y". If a sentence survives with the hedge deleted, the hedge was filler; if it doesn't, the sentence had no content.
- No two FAQs on a page may share an answer. If two questions want the same answer, one of them gets the concrete version (the actual workflow or numbers) or gets cut.
- Vague nouns get replaced by their referents: "technical signals" → the list of checks; "visibility metrics" → the metric names.

## Product grounding pass

Every capability claim gets verified against code, not memory. Canonical sources:

- MCP claims → `src/server/mcp/tools/` (one file per tool; if there's no file, the tool doesn't exist)
- Site audit checks and free limits → `src/shared/audit-limits.ts` (`FREE_MAX_AUDIT_PAGES`) and `src/server/features/audit/`
- Keyword data fields → `src/server/features/keywords/services/research/research-data.ts`. Known gotcha: intent labels come from DataForSEO Labs only; the Google Ads fallback (used for non-Labs countries) returns intent "unknown", so never claim intent "on every keyword".
- GSC capabilities → `src/server/features/gsc/` and `src/server/mcp/tools/search-console-tools.ts`
- Feature inventory → `web/src/lib/feature-pages.ts` workflows sections (already reviewed copy; reuse its concrete lists)

Attribution rule: the free discovery surfaces in the guides — autocomplete, People Also Ask, "related searches" — are **Google's**, and conversations and Search Console data are **the user's**. Say so explicitly ("Google's autocomplete", "your Search Console"). OpenSEO's role is the paid-data half: validating and expanding with volume, difficulty, and SERP data. Copy that lists those surfaces without attribution reads as OpenSEO features; that's a bug. Known absences that have shipped as overclaims before: OpenSEO does **not** harvest autocomplete or People Also Ask (of those surfaces only Search Console is integrated), and never claim it "wraps" workflows it doesn't.

UI-affordance rule: before copy instructs the reader to click, sort, or filter something ("sort by word count"), confirm that control exists in the client code. Known past miss: the keyword research table has no word-count column.

Claims about named third parties (a customer, an interviewee's employer, a competitor) need a source or softening — "legally-mandated" about a specific company is a legal claim, not copy. And when a post is adapted from a source (podcast, talk), spot-check quotes against the source for quiet edits, like a competitor's name being scrubbed.

## Pricing framing

OpenSEO is not free and copy must never imply it is. The canonical framing:

> Quality SEO data is difficult to get, which is why SaaS tools run $100/month and up. OpenSEO is the most affordable option, starting at $10/month, and you can start for free.

Rules:

- Use the full framing once per page (the main pricing-adjacent FAQ); shorter variants elsewhere ("you can start for free; paid plans start at $10/month") so the identical paragraph doesn't repeat across pages.
- "Is X free?" questions get an honest verdict first: "Not unlimited", or "For smaller sites, yes" when a real free limit covers it (e.g. audits up to `FREE_MAX_AUDIT_PAGES` pages). "Open source" is true but is not an answer to "is it free".
- Self-hosting is free software, not free data: self-hosters bring their own DataForSEO account.
- Free-tier facts (verify against `src/shared/billing.ts` and the pricing page before repeating): signup is card-free with a small trial-credit grant ($0.50 at time of writing); top-ups are paid-plan only; keyword research is credit-metered, so "the clustering pass is free" is only true for keywords already researched.
- Verify any number ($10/month, page limits, credit amounts) against code or the live pricing page before shipping it.
- FAQ answers on marketing pages also ship inside FAQPage JSON-LD — a false claim there is served to Google as structured data, which makes FAQ accuracy the highest-stakes copy on the page.

## External contributions (consultants, guest authors)

Extra checks when the content comes from outside the team:

- **Outbound links are currency.** Every external link gets justified: who owns the domain, is there an undisclosed relationship, does the anchor deserve a dofollow editorial link from openseo.so? A link to a third-party SEO agency with no stated connection is a red flag. Attribution links should point at the specific article, not a homepage.
- **Bylines must render.** If frontmatter carries an `author`, confirm the site actually displays it — a guest post publishing as first-party editorial while linking the author's own properties edges into Google's guest-post link-spam territory.
- **Self-promotion in assets.** Check PDFs and images for the contributor's own branding; decide deliberately whether it stays.
- **Binary assets get inspected**, not waved through: `strings` over PDFs for embedded links, screenshots checked against their captions.

## Beyond the prose

- **Sitemap:** `web/scripts/generate-sitemap.js` uses a hardcoded `STATIC_PATHS` list and only scans `content/blogs` and `content/docs` — new marketing/library pages must be added explicitly or they're invisible to crawlers. Verify by building and grepping the sitemap output.
- **Screenshots:** must show real product output that reproduces the article's own example (capture via the app, seeded through the MCP if needed), the caption/alt text must match what's visible, and theme should be consistent across a page's image set.

## Review workflow

1. Inventory the changed prose files (`git diff main... --stat`).
2. Run the deslop greps and read every changed file in full — patterns cluster, so one hit means more nearby.
3. For each finding, propose exact old → new replacements; verify each against the file before applying (subagent proposals included).
4. Verify every product/pricing claim against the code paths above.
5. Validate: `npm --prefix web run types:check`, and prettier on any touched TSX/TS (`npx prettier --write` in `web/`). Prettier failures in files you didn't touch are pre-existing; leave them.
