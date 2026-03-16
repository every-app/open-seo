---
description: draft GitHub release notes for the current branch or a tag range
subtask: true
---

Draft user-facing release notes for this repository.

Rules:

- Check `package.json` first. If the branch has not already bumped the version, update the `version` field before drafting release notes.
- Prefer a patch version bump for now, since the project is still in rapid early development. Only choose a minor or major bump when the existing version change in `package.json` already does so or the user explicitly asks for it.
- Treat an existing version change in `package.json` as the source of truth and do not overwrite it.
- Use the generated notes as the source of truth; do not invent features or fixes.
- Keep the tone concise and user-facing.
- Call out missing context if a commit subject is too vague.
- If the user passes arguments, forward them to the generator unchanged.

## Package version

@package.json

## Generated notes

!`pnpm release:notes -- $ARGUMENTS`

After reviewing the generated notes:

- confirm the `package.json` version matches the intended release tag when one is provided
- tighten wording only when it improves clarity
- preserve the existing section structure unless there is a strong reason to merge sections
- suggest a `gh release create` command if the user wants to publish next
