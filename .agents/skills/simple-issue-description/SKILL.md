---
name: simple-issue-description
description: Turn a rough bug report, feature request, support note, or pull request into a short, plain-language issue focused on the problem and desired behavior. Use when a contributor asks to simplify an issue, explain what a PR is for, create the corresponding issue for a PR, remove implementation detail from a report, or invokes /simple-issue-description.
---

# Simple Issue Description

Write an issue a maintainer can understand in under a minute. Focus on what someone experiences and what should happen instead.

## Workflow

1. Read the supplied notes, conversation, issue, PR description, or diff. In a PR, also check for spec, design doc, or README changes — they often state the intent better than the description does.
2. Identify the concrete problem. State who or what is affected when the source makes that clear.
3. Describe the desired behavior without prescribing an implementation.
4. Keep only context that helps someone understand or reproduce the problem.
5. If the source is a PR or diff, describe the problem the change tries to solve, not the files or code it changes.
6. Draft the issue immediately unless the problem and desired behavior cannot be determined. In that case, ask one short clarifying question.

One issue per problem. If the source bundles unrelated problems, draft the issue for the most significant one, list the others in a line each, and tell the contributor to split them into separate issues and separate pull requests.

If the source adds a capability instead of fixing a misbehavior, do not stage the absence as a bug. Describe what a user cannot do today and the full user experience of the feature: who uses it, from where, and what they see.

Do not invent user impact, reproduction steps, or certainty that the source does not support. If the source only shows cleanup, refactoring, or a possible code smell, say that no concrete problem is clear instead of manufacturing an issue — this rule wins over step 6. Reply with two or three sentences: what the source shows, and what evidence would make it issue-worthy.

If the source fixes a security weakness that is not already public, do not draft a public issue describing it. Suggest reporting it privately to the maintainer instead.

## Writing rules

- Use plain language and short sentences.
- Keep the issue under 200 words unless it is clear that more is necessary to describe the reproduction steps or a large feature.
- Lead with behavior, not code, architecture, or the proposed fix. A one-sentence plain-language cause is fine when the symptom cannot be understood without it.
- Keep technical details only when they are necessary to reproduce or understand the problem. Limits and defaults that make the symptom make sense (batch sizes, quotas, caps) count as necessary.
- Preserve useful evidence such as error messages, screenshots, links, and documentation references.
- Do not mention that AI wrote or reviewed the issue.
- Avoid filler, praise, roadmap language, and exhaustive edge cases.
- Use the contributor's level of certainty. Do not present a guess as a confirmed bug; write "can" or "appears to" when the source describes a risk rather than an observed failure.

## Output format

The first line is the issue title — when filing on GitHub, put it in the title field instead of repeating it in the body. For a missing capability, title the outcome ("Flag pages with no structured data") rather than a fake bug ("Audits never mention structured data").

Omit the **Extra context** section when there is nothing useful to add. Constraints and scope notes belong there, including what is not affected when a maintainer would reasonably worry that it is.

```markdown
# <Short title describing the problem or desired outcome>

## TL;DR

<In one or two sentences, explain what happens now and what should happen instead.>

## What is happening?

<Describe the current behavior in plain language. Include a concrete example when available.>

## What should happen?

<Describe the desired behavior without proposing how to build it.>

## Extra context

<Optional reproduction steps, error text, screenshots, links, or constraints.>
```

## Example

```markdown
# The chat jumps away from messages I am reading

## TL;DR

When I scroll up to read an older message, a new response moves me back to the bottom of the chat. The chat should stay where I left it until I choose to return to the latest message.

## What is happening?

New responses automatically scroll the chat to the bottom, even when I am reading earlier messages.

## What should happen?

Keep my current scroll position and show that a new message is available.
```
