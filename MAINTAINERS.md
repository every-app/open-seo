# Maintainers

This document covers maintainer-only workflow notes that do not belong in the public project README.

## Release updates

GitHub Releases are the main user-facing update channel for OpenSEO.

- Ask interested users to watch the repo and enable release notifications.
- Do not treat stars as a contact list; GitHub does not expose a way to message stargazers directly.

## Release notes workflow

Generate notes from commits since the latest semver tag:

```sh
pnpm release:notes
```

Useful variants:

```sh
pnpm release:notes -- --from v0.0.1 --to HEAD
pnpm release:notes -- --draft v0.0.2
```

Supported inputs:

- `--from <tag>`: start changelog generation from a specific tag
- `--to <ref>`: end at a specific ref, default is `HEAD`
- `--draft <tag>`: create a GitHub draft release for that tag using the generated notes
- `--repo <owner/repo>`: override the GitHub repo
- `--help`: show help

The generator:

- uses commits since the latest semver tag by default
- filters out maintenance-only commits like `chore:`, `ci:`, `test:`, `build:`, and `release:`
- groups the remaining changes into short user-facing sections
- can create a draft GitHub release when `--draft` is provided

Store finalized notes in `release-notes/` as versioned Markdown files such as `release-notes/v0.0.2.md`.

Recommended release flow:

```sh
pnpm -s release:notes
# edit and save the final copy in release-notes/v0.0.2.md
gh release create v0.0.2 --target main --title v0.0.2 --notes-file release-notes/v0.0.2.md
```

For now, prefer patch releases while the project is still in rapid early development unless there is a clear reason to cut a minor or major release.

## OpenCode slash command

For convenience inside OpenCode, use:

```text
/release-notes
```

The command definition lives at `.opencode/command/release-notes.md` and forwards any extra arguments to the same generator script.
