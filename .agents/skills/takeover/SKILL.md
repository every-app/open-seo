---
name: takeover
description: Take over a public (every-app/open-seo) PR, or a branch or agent thread, and finish it in the private repo while keeping the original contributors' credit in the merged commit. Use when the user asks to take over, finish, adopt, or land someone else's PR, or when triage decides a contributor's PR should ship.
metadata:
  internal: true
---

Finish the original goal and keep the contributor's name on it. Don't defend their implementation just because it exists, and don't throw it away just because you'd have written it differently.

## Read it

- Read the PR, its review comments, the linked issue, and any later corrections from the maintainer.
- Treat the handoff as context, not proof. Reproduce the bug or confirm the need yourself. If the user problem isn't real, stop and say so.
- Check whether `main` already fixed it (`git log origin/main -S<symbol>`, recent commits touching the same files). If it did, skip to "Close the loop" and credit them anyway when their PR shaped the fix.

## Bring it in

Public PRs come from forks. Read the build-executable surface before you install or run anything: `package.json`, the lockfile, `vite.config*`, `scripts/`, `patches/`, `.npmrc` (see "Public-mirror PRs" in `docs/maintainers/preview-deployments.md`).

```sh
git fetch https://github.com/every-app/open-seo.git pull/<n>/head
git checkout -b takeover-<n> FETCH_HEAD
git merge origin/main   # or rebase if their history is a mess
```

- Keep their commits. Their authorship is the credit: when the private PR is squashed, GitHub adds every commit author on the branch as `Co-authored-by`.
- Put your fixes in separate commits on top.
- If you replace their code rather than build on it, or several PRs fixed the same thing, add a commit whose message ends with a trailer per contributor. Use their verified noreply address, never a guessed email:

  ```sh
  id=$(gh api users/<login> --jq .id)
  # Co-authored-by: <Name or login> <$id+<login>@users.noreply.github.com>
  ```

- Only credit people whose work actually shaped what ships.

## Finish it

Then follow `merge-ready`: simplify, verify the real failure (not just green mocks), get `pnpm ci:check` and `pnpm test` passing, and open the private PR. In the description:

- First line: `Takes over every-app/open-seo#<n> by @<login>.` (one line per PR if several).
- Say what you kept, what you changed, and why.
- Under Extra context, list the expected `Co-authored-by` lines so the maintainer can check them in the squash dialog before merging.

Never merge, and never close or comment on the public PR, without the maintainer's go.

## Close the loop

After the maintainer merges and public `main` has synced, with their go, comment on the public PR in two or three sentences: thank them, link the commit on every-app/open-seo, and say briefly what changed from their version and why. Then close it.

## Report

What you inherited, what you changed, how you verified it, who is credited and how, and any decision left for the maintainer.
