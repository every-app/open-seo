---
name: merge-ready
description: Get a branch ready for the maintainer's final review: review it for security, simplicity, and billing abuse, fix what's real, get checks passing, and open or update the PR. Use whenever the user says a feature, fix, or branch should be "merge ready", asks to get changes ready for review, or appends this to a build request ("build X and make it merge-ready").
metadata:
  internal: true
---

Get this branch ready for the maintainer's final review. If you were also asked to build something, build it first.

Fetch and merge `origin/main` if the branch is behind. Then review everything on the branch against it, including uncommitted and untracked files. Make sure you understand every product decision and change in functionality.

Is it secure?

Is it as simple as it can be? What can be deleted or simplified given the end state of the branch? Did an unlikely edge case lead to overengineering? We prefer to delete code.

Does it use APIs and SDKs (TanStack, DataForSEO, Autumn, Cloudflare) idiomatically? Watch for code that reinvents what they already do, works around limits they don't have, or pays for more than it needs. Check the docs only when something looks off.

Is there a significant way to abuse billing, like getting credits, paid features, or provider calls without paying? Ignore small leaks nobody would bother exploiting.

Beyond that, review it however you think best. Work out which parts could do the most damage if they're wrong and spend your time there. `docs/maintainers/review-guidelines.md` lists the repo's invariants and the things that look wrong but are intentional.

Fix what's real. Commit as you go. Get `pnpm ci:check` and `pnpm test` passing locally, then push. Those local runs stand in for CI, so don't wait for GitHub CI to finish.

Open or update the PR against `main` with a high-level description: what changed and why, what to look at first, and anything you left for the maintainer's judgment. No per-file changelog.

Never merge. The maintainer reviews last.
