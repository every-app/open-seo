# Agent guidance

## Engineering principles

- Prefer simple, readable, flat code with minimal indirection.
- Search for existing implementations and installed libraries before creating new helpers or abstractions.
- Abstract when it prevents meaningful drift and makes the result simpler to maintain. Avoid speculative or one-use abstraction layers.
- Keep product data normalized and relationships explicit. Do not encode relational data in JSON or text merely to avoid joins.
- For new application-backed backend functionality, default to: TanStack server function → service → repository.
- Keep schema changes, queries, and mutations compatible with both SQLite and Postgres.
- Use idiomatic TypeScript. Use Zod to validate untrusted data and narrow runtime values at trust boundaries.
- Prefer established project helpers and libraries over hand-rolled implementations.
- Every length is `rem`, never `px`: Tailwind arbitrary values (`text-[0.6875rem]`, `max-w-[20rem]`, `shadow-[0_0.5rem_2rem_…]`, `backdrop-blur-[1.25rem]`, `rounded-[1.25rem]`), stylesheets and inline styles alike. Convert px by dividing by 16. SVG attributes such as `viewBox` and `stroke` stay unitless.
- Prefer idiomatic TanStack Query, Router, and Form patterns for server state, routing, and submitted forms.

## Documentation audience

- `docs/` and `web/content/docs/` are public, user-facing documentation. Write only material that helps users understand, use, or self-host the product.
- Do not put internal working notes, content briefs, drafts, asset-sourcing notes, implementation logs, or agent handoffs in those directories.
- Use `maintainer-docs/` for engineering decisions, development workflows, and maintenance notes that should be shared and versioned. This directory is tracked in Git but is not part of the user-facing documentation site. Create notes only when requested or useful for future maintenance; never include secrets.
- Keep PR review and validation details in the PR description. Continue using the dedicated papercut log for repository friction.

## Log papercuts

When small, non-blocking repository friction occurs—a retried tool call, confusing setup step, flaky command, stale cache, misleading error, or non-obvious gotcha—use the `papercuts` skill and append it to `.agents/PAPERCUTS.md` in the moment. Continue the current task. Real bugs and tracked work are not papercuts, and sensitive data must never be logged.

Do not mine an entire session for papercuts or start a broad cleanup unless the user explicitly asks.

## Preserve review learnings

After a merge-ready or other code review verifies a finding, use `maintain-greptile-rules` only when the finding exposes a recurring or high-risk repository invariant that existing `.greptile/` context and automated checks do not capture. Do not promote one-off bugs or preferences into permanent review rules.

Changes to `.greptile/**`, `AGENTS.md`, `CLAUDE.md`, `.agents/skills/**`, and `.github/**` alter the review control plane and must receive explicit maintainer review. CODEOWNERS requests that review; where repository settings allow, enable GitHub's requirement for code-owner approval. Repository-specific rules live in `.greptile/`; maintainers should configure or retain a minimal org-enforced Greptile baseline for external-contribution, secret, authentication, billing, CI, and rule-tampering risks. Agents should report an unverified or missing baseline and must not mutate dashboard or organization rules without explicit user authorization.
