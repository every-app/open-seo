# Release Notes

Release notes for SEOShark start from this fork's first tagged release. Notes for the upstream project this codebase was forked from are not carried here; see the upstream repository's releases for that history.

Each release gets one Markdown file in this folder named after its tag, for example `release-notes/v0.1.0.md`.

Typical flow:

1. Generate a draft with `pnpm -s release:notes`.
2. Copy the final edited notes into a versioned file in this folder.
3. After the release PR merges, publish with `pnpm release:publish`.
