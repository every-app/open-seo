# Maintainer documentation

Shared, versioned documentation for people maintaining OpenSEO. Put engineering decisions, development workflows, and useful maintenance notes here.

User-facing documentation belongs in the rest of `docs/` or `web/content/docs/`. This directory is not published to the documentation site, but its contents are tracked in the repository and must not contain secrets.

`review-guidelines.md` is the shared context for code reviewers, human and agent: hard invariants plus the false-positive controls that keep reviewers from flagging intentional behavior.

Create documents when they will help future maintenance or when explicitly requested. Keep task status, PR review notes, and validation results in the PR description. Log repository friction in `.agents/PAPERCUTS.md`.
