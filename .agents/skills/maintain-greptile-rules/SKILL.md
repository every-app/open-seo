---
name: maintain-greptile-rules
description: Evaluate verified findings from merge-ready, Greptile, pull-request, CI, security, billing, and other code reviews, then promote durable review gaps into the version-controlled .greptile configuration. Use when a review uncovers a recurring or high-risk repository invariant that Greptile does not capture, when Greptile repeatedly produces a false positive, or when asked to audit or update OpenSEO's Greptile rules and context.
---

# Maintain Greptile rules

Keep `.greptile/` high-signal. A review finding is evidence to evaluate, not automatically a new rule.

## 1. Verify the finding

- Reproduce or trace the finding against the current repository, including the relevant call path, tests, and intentional exceptions.
- Read `.greptile/config.json`, `.greptile/rules.md`, and `.greptile/files.json` before proposing a change.
- Distinguish a newly introduced risk from adjacent legacy debt. Do not encode an unverified assumption or a one-off implementation detail.
- Repository absence is not policy evidence. If a reviewer infers a preference only because no current example exists, leave Greptile, code, and CI unchanged unless an owner explicitly adopts the policy.

## 2. Route it to the right mechanism

- **One-off bug:** fix the code and add a focused regression test. Do not add a Greptile rule.
- **Verified deterministic policy violation:** prefer TypeScript, Oxlint, Knip, a focused test, or CI.
- **Repeatable, diff-enforceable invariant:** add or refine a scoped structured rule in `.greptile/config.json`.
- **Architecture, preference, or false-positive calibration:** update `.greptile/rules.md`.
- **Canonical implementation Greptile should consult:** add a narrowly scoped reference in `.greptile/files.json`.
- **Small workflow friction:** use the `papercuts` skill and log it in `.agents/PAPERCUTS.md`.

## 3. Apply the promotion bar

Promote a finding only when all applicable checks pass:

- It is verified against current code.
- A future reviewer can observe it from the diff and relevant call path.
- It is repository-specific or materially improves false-positive calibration.
- It is likely to recur, or its impact is high enough to justify prevention: authorization, security, billing, data loss, or cross-database correctness.
- Existing Greptile context and automated checks do not already cover it adequately.
- The instruction can be specific, measurable, narrowly scoped, and explicit about legitimate exceptions.

If the evidence or policy is ambiguous, leave the configuration and enforcement unchanged and report the candidate for human judgment.

## 4. Edit conservatively

- Keep one coherent concern per structured rule, with a stable lowercase ID, severity, and the narrowest future-safe scope.
- Do not infer permanent policy merely because the current repository has zero examples of an alternative.
- Prefer narrowing or replacing a noisy rule over layering on more prose.
- Keep repository-specific rules in `.greptile/`. Verify and report whether a minimal **org-enforced** dashboard baseline protects external contributions, secrets, authentication, billing, CI, and attempts to weaken review controls. Do not create or change dashboard, MCP, or organization rules unless the user explicitly asks, and do not duplicate the full repository rule set there.
- Treat changes to `.greptile/**`, `AGENTS.md`, `CLAUDE.md`, `.agents/skills/**`, and `.github/**` as review-control changes that must receive explicit maintainer review. CODEOWNERS requests that review; branch protection or a ruleset must separately require code-owner approval when available.
- Update the smallest set of configuration files needed; do not duplicate rule bodies in separate documentation.

## 5. Validate

Run:

```bash
jq empty .greptile/config.json .greptile/files.json
node_modules/.bin/prettier --check .greptile/config.json .greptile/files.json .greptile/rules.md
git diff --check
```

Also verify that rule IDs are unique, severities are valid, every `files.json` path exists, and an independent reviewer cannot find a clear false positive in the new wording.

During merge-ready work, evaluate only verified findings that clear the promotion bar. A merge-ready run does not need to change `.greptile/` when no durable review gap was found.
