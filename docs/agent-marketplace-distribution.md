# Agent marketplace distribution

Agent marketplaces are a discovery and activation channel alongside search,
citations, referrals, and direct integrations. OpenSEO tracks the state of each
listing without treating a submission, clone, or install as customer adoption.

## What OpenSEO records

Each project has a standard row for:

- OpenAI
- Claude hosted marketplace
- Claude community directory
- Grok
- Cursor
- MCP Directory
- skills.sh

A listing moves through an explicit lifecycle: not started, preparing,
submitted, in review, published, rejected, or paused. The record also keeps the
package version, listing or submission URL, relevant dates, last verification,
the exact provider-reported status, and operator notes. The normalized lifecycle
supports comparison across providers without erasing provider language such as
OpenAI's `pending` status.

Claude is intentionally represented twice. A publisher-controlled GitHub
marketplace can already be published while Anthropic's reviewed community
directory remains unsubmitted or in review.

Evidence is stored as dated snapshots rather than overwritten totals. A
snapshot may record views, unique viewers, clones, unique cloners, installs,
OAuth starts and completions, activated accounts, and qualified outcomes.

## Interpretation rule

The useful funnel is:

`listing view -> install or clone -> connection -> first source -> first useful result -> qualified activation`

Early stages show discovery or intent. They do not prove an outside user, a
successful run, or customer value. For example, repository clone traffic may
include maintainers, CI, qualification runs, security scanners, and mirrors.
OpenSEO preserves the raw number while leaving attribution to the operator's
verified sources.

## Implementation boundary

The first slice is deliberately manual and provider-neutral:

1. Maintain truthful directory state.
2. Record dated evidence snapshots.
3. Compare discovery signals with downstream activation.

Provider-specific scrapers, submission automation, publishing, OAuth telemetry
joins, and product analytics imports are later integrations. They should write
through the same listing and snapshot model rather than create parallel tables.

## Suggested next integrations

1. Import bounded GitHub traffic and release-download snapshots.
2. Add source tags at each marketplace-to-product handoff.
3. Import OAuth completion and activated-account totals from a privacy-safe
   aggregate endpoint.
4. Add freshness warnings when a listing has not been verified recently.
5. Add a comparison view that highlights where discovery fails to reach a first
   useful result.
