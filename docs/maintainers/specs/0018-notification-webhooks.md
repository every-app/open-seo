# Notification webhooks (Slack / Teams)

## Status

Proposed. Rank position alerts are the first rule type; the same channel store can later cover GSC digests and audit summaries from the public roadmap.

## What it does

- Each project can save one or more **notification channels**: a display name, platform (`slack` or `teams`), and an incoming webhook URL.
- Webhook URLs are validated against an HTTPS host allowlist, encrypted at rest with `BETTER_AUTH_SECRET`, and never returned to the browser after save.
- **Rules** attach a channel to a rank-tracking alert: optional single tracker or all trackers in the project, a minimum position change (per keyword and device, comparing the latest completed run to the previous one), and an optional “weekly summary” ping after a **weekly scheduled** check completes even when nothing crossed the threshold.
- When a rank check run completes successfully, the app evaluates matching rules once per run (deduped in `notification_deliveries`) and POSTs plain-text (Slack) or MessageCard (Teams) payloads to the webhook.

## How it works

**UI.** Project sidebar → Notifications. Connect channel, send test, add rules, enable/disable or delete.

**Delivery.** `RankCheckWorkflow` finalization calls `notifyRankCheckComplete`, which loads snapshots for the finished run and the prior completed run, computes movement, and sends through `postNotificationWebhook`. Failures are logged and do not fail the rank check.

**Security.** Only allowlisted webhook hosts; no automatic redirect following on outbound POST; 10s timeout. Project-scoped server functions gate every read and write.

## Alternatives considered

- **Loops email first:** matches the public roadmap’s email reports but heavier (templates, hosted-only). Webhooks ship faster and fit agency Slack workflows; email can reuse the same rule engine later.
- **Rules only inside Rank Tracking:** rank alerts are the first consumer, but GSC and audit alerts are easier to discover under a shared Notifications page.

## Not in scope (initial PR)

- Per-user notification preferences, email delivery, digest PDFs, MCP management of rules, org-wide channels shared across projects without explicit per-project setup.
