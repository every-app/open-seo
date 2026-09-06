---
name: "OpenSEO"
description: "OpenSEO: two positions compared"
colors:
  canvas-dark: "#101316"
  shell-dark: "#171A1D"
  raised-dark: "#1D2125"
  ink-dark: "#E6E8EB"
  canvas-light: "#ECEDEF"
  shell-light: "#F8F9FB"
  raised-light: "#FBFCFE"
  ink-light: "#22252A"
  interaction-blue: "#047BF4"
  interaction-blue-light: "#255DA5"
  on-interactive-dark: "#101316"
  on-interactive-light: "#F4F7FD"
  brand-orange: "#EC4E02"
  success: "#029219"
  warning: "#DFA700"
  danger: "#E52222"
  info: "#1DB8CE"
  accent: "#19E5AD"
  accent-light: "#0A5841"
typography:
  display:
    fontFamily: "\"IBM Plex Sans\", ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "40px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  heading:
    fontFamily: "\"IBM Plex Sans\", ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "normal"
  body:
    fontFamily: "\"IBM Plex Sans\", ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "\"IBM Plex Sans\", ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0.04em"
  machine-text:
    fontFamily: "\"IBM Plex Mono\", ui-monospace, SFMono-Regular, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  0: "0px"
  1: "2px"
  2: "4px"
  3: "6px"
  4: "8px"
  5: "12px"
  6: "16px"
  7: "20px"
  8: "24px"
  9: "32px"
  10: "40px"
  11: "48px"
components:
  button-primary:
    backgroundColor: "{colors.interaction-blue}"
    textColor: "{colors.on-interactive-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "6px 16px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.interaction-blue}"
    textColor: "{colors.on-interactive-dark}"
  button-ghost:
    backgroundColor: "{colors.raised-dark}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.md}"
    padding: "6px 16px"
    height: "32px"
  field:
    backgroundColor: "{colors.shell-dark}"
    textColor: "{colors.ink-dark}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  status-badge:
    backgroundColor: "{colors.shell-dark}"
    textColor: "{colors.ink-dark}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
---
# Design: OpenSEO

## Overview

OpenSEO is an agent-ready SEO marketing and analysis platform: keyword research, rank
tracking, competitors, backlinks, site audits, and AI visibility, hosted or
self-hosted, with MCP and reusable agent skills. Marketers, builders, and agents use
it. Register: product. `OpenSEO` is the repository identity; no ByteDesk rename is
approved.

The creative north star is the Campaign Observatory: the shell frames clear search
evidence, comparisons, and agent collaboration without becoming a wall of
interchangeable analytics cards. The composition motif is two positions compared.

Personality: comfortable analytical density, calm crisp motion, balanced richness, and
an anthropomorphic search lens whose iris is a rising analysis graph as the icon
metaphor. Read after the shared foundation; this file names only what OpenSEO adds.

## Colors

The accent is `--bd-accent` resolved through `data-bd-product="openseo"`. It may mark
the project identity, the product mark, and the primary series in a comparison.
Interaction, focus, filtering, and agent activity stay on `--bd-interactive-blue`.
`--bd-brand-orange` is reserved for handoff and rare attention.

Data freshness carries a word beside its marker: fresh on `--bd-success`; cached,
stale, partial, and rate-limited on `--bd-warning`; failed, unauthenticated, and
unavailable on `--bd-danger`; queued and running on `--bd-info`. Rank change shows
direction and value in text, never color alone.

Richness defaults to balanced and the user may change it. Both themes ship as one
interface with identical geometry.

## Typography

IBM Plex Sans for every interface surface. Queries, URLs, ranks, dates, costs,
provider IDs, and agent event names, monospace in the source profile, are Sans at
medium weight and the small size. Rank, volume, cost, and date columns use tabular
figures so comparisons align.

No surface in OpenSEO uses monospace.

## Elevation

Evidence stays on the working plane, `--bd-bg-surface`. Agent plans and drill-down
detail rise one level to `--bd-bg-elevated` only while active. Comparison bars and
tables are not cards; hairlines separate them. Glass is sanctioned for the shell
perimeter only.

Density is comfortable, with whitespace around the next action. The breathing-room
floor holds at rest; no compaction mode is declared.

## Components

Signature components: research, rankings, competitors, backlinks, audits, AI
visibility, provider cost and consent, saved projects, agent chat and activity,
evidence citation, and export.

Data states: fresh, cached, stale, queued, running, partial, rate-limited,
unauthenticated, unavailable, and failed. AG-UI may carry agent events, but product
records and provider results remain canonical.

Composition rule: a search aperture aligning evidence, trend, and recommended action.
Both terms of every comparison are legible; the recommended action gets the space.

Storybook stories and HTML mockups cover every route and state in both themes, all
richness levels, responsive widths, keyboard and focus, reduced motion, empty
projects, permission and billing boundaries, long-running analysis, offline and
provider-unavailable states, and destructive project resets before adoption.

## Do's and Don'ts

### Do

- Give every chart a table or equivalent summary.
- Include direction and value on every rank change.
- Keep filters, agent activity, and evidence fully keyboard operable.
- Distinguish observed data, derived recommendation, queued agent work, and
  unavailable provider results in copy.

### Don't

- Never imply live data where a provider response is cached or pending.
- Never manufacture rankings, traffic, costs, competitor facts, or agent activity.
- No generic magnifier, globe, or marketing megaphone as the mark.
- No exceptions to the shared foundation.
- Generated art must never taper or fade a bar into the dark; that reads as a
  gradient, not a comparison.
