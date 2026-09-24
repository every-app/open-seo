# Maintainers

This document covers maintainer-only workflow notes that do not belong in the public project README.

## Release updates

GitHub Releases are the main user-facing update channel for SEOShark.

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
- `--to <ref>`: end at a specific ref, default is `main` when `origin` is `bizztor/seoshark` and `HEAD` otherwise
- `--draft <tag>`: create a GitHub draft release for that tag using the generated notes
- `--repo <owner/repo>`: override the GitHub repo (defaults to the `origin` remote)
- `--help`: show help

The generator:

- uses commits since the latest semver tag by default
- filters out maintenance-only commits like `chore:`, `ci:`, `test:`, `build:`, and `release:`
- groups the remaining changes into short user-facing sections
- can create a draft GitHub release when `--draft` is provided

Store finalized notes in `release-notes/` as versioned Markdown files such as `release-notes/v0.1.0.md`. The folder starts empty: release notes begin with this fork's first tagged release.

Recommended release flow:

```sh
pnpm -s release:notes
# edit and save the final copy in release-notes/v0.1.0.md, bump package.json, open a "release: v0.1.0" PR
# after merge:
pnpm release:publish
```

`pnpm release:publish` reads the version from `package.json` and publishes the matching `release-notes/v<version>.md` as a GitHub release on `bizztor/seoshark`. The `release-notes` skill in `.agents/skills/` walks through the whole flow.

For now, prefer patch releases while the project is still in rapid early development unless there is a clear reason to cut a minor or major release.

## OpenCode slash command

For convenience inside OpenCode, use:

```text
/release-notes
```

The command definition lives at `.opencode/command/release-notes.md` and forwards any extra arguments to the same generator script.
