---
name: openseo-review-web-content
description: Write and review content for the OpenSEO website (web/) — blog posts, guides, feature pages, FAQs. Distills the philosophy for on-brand, useful, accurate content. Use whenever adding or editing user-facing prose in web/content or web/src.
metadata:
  internal: true
---

# OpenSEO Web Content

Everything we publish must be traceable to what the product actually does and costs, and must read like a practitioner wrote it. The reader's interest comes first: teach something they can act on, and answer straight — including when the honest answer is "no" or "it costs money."

## Principles

1. **Traceable truth.** Every capability claim, price, and screenshot is verifiable against the code, the fact sheet (`src/server/features/onboarding/openseo-fact-sheet.md`), or the live product. If you can't point to where it's true, it doesn't ship.
2. **Lead with the real answer.** "No," "not unlimited," and "it costs money" are complete answers. Hedging that lets a reader infer something more flattering than the truth is a way of misleading them.
3. **Honest pricing, with its reasoning.** Quality SEO data is expensive everywhere — that's why the big suites run $100/month and up. OpenSEO is the affordable option: $10/month, free to start. Never simply "free."
4. **Sound like a person.** Fix AI tells by restating the underlying claim plainly, not by polishing the flourish. The [deslop skill](../deslop/SKILL.md) is the reference for what to hunt and how to fix it.
5. **Reader-first altitude.** Guides teach actionable SEO that stands on its own — not product documentation, not generic filler. Credit free resources to their real owners (Google's autocomplete, the reader's own Search Console).
6. **One bar, whole surface.** When a standard improves, sweep everything to it — all the FAQs, all the pages — not just the instance that got noticed.

## Questions to ask while reviewing

- If a reader trusted every claim and screenshot, then opened OpenSEO right now, where would reality not match?
- Does each answer open with the real answer, or quietly steer toward a more flattering inference?
- Read the sharpest line aloud: would a person say it that way?
- Is anything called free that actually costs credits?
- Is this teaching the reader something useful on its own, or drifting into product docs or padding?
- Does every link, image, and example on the page earn its place for the reader?

## Facts to verify, not remember

Check these against code before repeating any of them — they change: pricing and credits (`src/shared/billing.ts`, the pricing page), free-plan limits (`src/shared/audit-limits.ts`), MCP capabilities (`src/server/mcp/tools/` — one file per tool), and any UI affordance copy tells the reader to use (the column, sort, or filter must exist in the client code).

## Process

Spawn subagents to run the review passes (voice/deslop, claims accuracy, directness) and have them return exact old → new proposals rather than editing directly. Do not accept their proposals blindly: verify each one against the actual file, and each factual claim against the code, before applying — subagent rewrites can introduce their own awkwardness or errors, and a proposal that mismatches the file means it reviewed stale text. After applying, sweep the changed surface yourself (patterns cluster — one em dash or hedge usually has neighbors), then run `npm --prefix web run types:check` and prettier on touched TS/TSX.
