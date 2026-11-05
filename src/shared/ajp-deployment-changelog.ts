/**
 * All Jigsaw Puzzles self-host deployment history.
 *
 * Update this file on every production deploy. The version label in Settings
 * comes from package.json (upstream OpenSEO release number); this log records
 * what we merged from every-app/open-seo and what we changed on the fork.
 */

export type DeploymentChangelogSection = {
  title: string;
  items: string[];
};

export type DeploymentChangelogEntry = {
  /** Matches package.json after deploy (upstream integration version). */
  version: string;
  deployedOn: string;
  pullRequest?: { number: number; url: string };
  mergeCommit?: string;
  upstream: {
    label: string;
    compareUrl?: string;
    sections: DeploymentChangelogSection[];
  };
  forkChanges: string[];
  operations?: string[];
  openFollowUps?: string[];
};

export const AJP_DEPLOYMENT_CHANGELOG_INTRO = {
  versionLabel:
    "The version number is the upstream OpenSEO release we integrated (from package.json). It is not a separate AJP-only semver.",
  forkRepo: "https://github.com/alljigsawpuzzles/open-seo",
  upstreamRepo: "https://github.com/every-app/open-seo/releases",
};

/** Newest first. */
export const AJP_DEPLOYMENT_CHANGELOG: DeploymentChangelogEntry[] = [
  {
    version: "0.1.24",
    deployedOn: "2026-11-04",
    pullRequest: {
      number: 27,
      url: "https://github.com/alljigsawpuzzles/open-seo/pull/27",
    },
    mergeCommit: "6db472ccaa34e323170d8ed94a45e516f422496b",
    upstream: {
      label: "OpenSEO v0.1.21 through v0.1.24",
      compareUrl:
        "https://github.com/every-app/open-seo/compare/v0.1.20...v0.1.24",
      sections: [
        {
          title: "v0.1.21",
          items: [
            "Local SEO (beta): Maps visibility around a business (optional GOOGLE_MAPS_API_KEY — not set on AJP).",
            "Site audit crawl progress logging; AI visibility saves answers with null characters in sources.",
          ],
        },
        {
          title: "v0.1.22",
          items: [
            "Clears AI visibility and rank runs stuck 12+ hours so new checks are not blocked.",
            "Docker workflow freeze fixes and Local SEO on Docker (not AJP Workers deploy path).",
          ],
        },
        {
          title: "v0.1.23",
          items: [
            "Import keyword lists; GSC Discover and News; striking-distance queries to rank tracker; MCP get_rank_history.",
            "Permanently delete archived projects; hosted self-serve account deletion (replaces operator GDPR erasure upstream).",
            "OPENROUTER_BASE_URL and OPENROUTER_MODEL for OpenAI-compatible endpoints.",
            "Rank checks: google.com/goto resolution, clearer partial/failed messaging, provider timeout as outage.",
            "Brand Lookup uses project market; Norwegian keyword research; backlink trailing-slash fix.",
            "Rendered audits can read some pages blocked by non-HTML 403 responses.",
          ],
        },
        {
          title: "v0.1.24",
          items: [
            "Filter tracked prompts by branded / non-branded; show competitors named in AI answers.",
            "Prompt Explorer and new projects default to project country.",
          ],
        },
      ],
    },
    forkChanges: [
      "Merged audit/crawler conflicts with AJP fetch diagnostics and render fallback retained.",
      "DataForSEO-only prompt research and OpenRouter gate bypass unchanged.",
      "Settings deployment log and self-host About/changelog preserved; hosted delete-account UI from upstream (inactive on cloudflare_access).",
    ],
    operations: [
      "D1 migration 0063 (account_deletion_requests) allowlisted; ledger 62→63; 0055 still skipped.",
      "Worker pair activated via publish-v24.mjs (publication artifact under ~/openseo-release-review/v0.1.24-publication-*).",
    ],
    openFollowUps: [
      "Shopify crawler signature save/reliability.",
      "Rank check cost estimate / notification delivery (see notifications deploy entry when live).",
    ],
  },
  {
    version: "0.1.24",
    deployedOn: "2026-11-05",
    mergeCommit: "PLACEHOLDER_PR31",
    upstream: {
      label: "Fork-only notification UX",
      sections: [
        {
          title: "Rank alert formatting",
          items: [
            "Teams Adaptive Card: green ▲ improved / red ▼ dropped rank movement.",
            "Slack rank alerts use Block Kit (header, fields, per-keyword sections, tracker button).",
          ],
        },
      ],
    },
    forkChanges: ["Shared rank trend helpers aligned with rank-tracking matrix UI."],
    operations: [
      "No D1 change; Worker pair via publish-notifications.mjs.",
    ],
  },
  {
    version: "0.1.24",
    deployedOn: "2026-11-05",
    mergeCommit: "5ba13eb5aa2aeab9e18015ed28023761b76d2f73",
    upstream: {
      label: "Fork-only notification UX",
      sections: [
        {
          title: "Teams Adaptive Card rank alerts",
          items: [
            "Teams rank alerts use Adaptive Card layout (readable keyword rows).",
            "Sample rank alert button sends fixed preview data without a live rank check.",
          ],
        },
      ],
    },
    forkChanges: [
      "Shared rank notification content builder for Slack text and Teams cards.",
    ],
    operations: [
      "No D1 change; Worker pair via publish-notifications.mjs — app 8ed77e53-…, audit 95561881-… (artifact ~/openseo-release-review/notifications-publication-2026-11-05T12-52-59-305Z).",
    ],
  },
  {
    version: "0.1.24",
    deployedOn: "2026-11-04",
    mergeCommit: "b7a96038daa754d139905264074b011e2bae848b",
    upstream: {
      label: "Fork-only feature (not an upstream OpenSEO release)",
      sections: [
        {
          title: "Notification webhooks",
          items: [
            "Project Notifications page: Slack and Microsoft Teams incoming webhooks (encrypted at rest).",
            "Rank tracking alert rules (position change threshold, optional weekly summary on scheduled weekly checks).",
            "Spec: docs/maintainers/specs/0018-notification-webhooks.md.",
          ],
        },
      ],
    },
    forkChanges: [
      "Merged from codex/notifications-rebase-0.1.24; SQLite migration 0064 / Postgres 0042.",
      "Vite dev server binds 127.0.0.1 for Cursor remote SSH port forwarding.",
    ],
    operations: [
      "D1 migration 0064 allowlisted; notification tables on prod; ledger row 0064_spicy_black_queen (execute --file + ledger insert); 0055 still skipped.",
      "Worker pair activated via publish-notifications.mjs — app c04703e8-…, audit 4d2f8c43-… (artifact ~/openseo-release-review/notifications-publication-2026-11-04T17-25-46-887Z).",
    ],
    openFollowUps: [
      "Upstream issue/PR to every-app/open-seo when ready.",
      "Validate rank-triggered alerts on production trackers.",
    ],
  },
  {
    version: "0.1.20",
    deployedOn: "2026-10-29",
    pullRequest: {
      number: 24,
      url: "https://github.com/alljigsawpuzzles/open-seo/pull/24",
    },
    upstream: {
      label: "OpenSEO v0.1.20",
      compareUrl:
        "https://github.com/every-app/open-seo/compare/v0.1.19...v0.1.20",
      sections: [
        {
          title: "What's new",
          items: ["Charts use colorblind-friendly colours."],
        },
        {
          title: "Fixed",
          items: [
            "MCP sign-in on the new Docker self-host layout.",
            "Gemini answers in Prompt Explorer.",
            "Late AI visibility answers attach to their scheduled run.",
            "MCP AI visibility setup opens the tracker instead of repeating setup.",
            "Rank checks show “double-checking results” at the end instead of looking stuck.",
          ],
        },
      ],
    },
    forkChanges: [
      "Merged MCP tracker-ready Prompt Research behaviour with existing manual/DataForSEO-only self-host setup (no OpenRouter required).",
      "Cloudflare Access production auth unchanged; OpenRouter gate bypass and crawler/AI fork paths retained.",
    ],
    operations: ["Worker pair deploy only — no new D1 migrations after 0062."],
    openFollowUps: [
      "Shopify crawler signature save/reliability.",
      "Rank check cost estimate and alert accuracy (progress copy improved upstream).",
    ],
  },
  {
    version: "0.1.19",
    deployedOn: "2026-10-27",
    pullRequest: {
      number: 22,
      url: "https://github.com/alljigsawpuzzles/open-seo/pull/22",
    },
    mergeCommit: "083904674f8b17fa5b2662ffe507c8b39e73eca9",
    upstream: {
      label: "OpenSEO v0.1.15 through v0.1.19 (single integration deploy)",
      compareUrl:
        "https://github.com/every-app/open-seo/compare/v0.1.14...v0.1.19",
      sections: [
        {
          title: "v0.1.15",
          items: [
            "MCP tools to pick Search Console and GA4 properties; disconnect agents in Settings.",
            "Manual rank check retries keywords that have never ranked.",
            "Prompt Tracking country and engine picker; MCP OAuth and date-range fixes.",
          ],
        },
        {
          title: "v0.1.16",
          items: [
            "Shopify site audits continue when individual pages are refused.",
            "Dashboard scan works without a configured renderer (Docker-friendly).",
            "CJK/thin-content and Cloudflare email-link audit fixes.",
          ],
        },
        {
          title: "v0.1.17",
          items: [
            "Self-host email/password accounts and team invites (upstream default for new installs).",
            "New Docker self-host layout (we stayed on Cloudflare Workers).",
          ],
        },
        {
          title: "v0.1.18",
          items: [
            "Every App gateway auth mode.",
            "AI visibility setup asks for OpenRouter before starting (see fork bypass below).",
          ],
        },
        {
          title: "v0.1.19",
          items: [
            "JavaScript-rendered audits no longer capped at 1,000 pages in one credit hold.",
            "MCP sign-in fix for password self-hosts; MCP rank keywords show volume, difficulty, CPC.",
          ],
        },
      ],
    },
    forkChanges: [
      "Production auth remains Cloudflare Access (not upstream password default).",
      "OpenRouterKeyGate bypass when prompt generation is unavailable — staff DataForSEO-only Prompt Research / Explorer / Tracking stay reachable without an OpenRouter key.",
      "Crawler fetch diagnostics, rejection details, and readable initial HTML when optional rendering fails — merged with upstream Shopify refuse/render-throttle behavior.",
      "DataForSEO-only prompt research fallback retained from earlier fork work.",
    ],
    operations: [
      "D1 migrations 0060–0062 applied; migration 0055 still skipped.",
      "Workers activated as a pair; cron schedules paused and restored.",
    ],
    openFollowUps: [
      "Shopify crawler signature save/reliability (operational, not fixed by this release).",
      "Rank check progress-at-100%-during-retries, self-host cost estimate, and alert accuracy (Oct 2026 investigation).",
    ],
  },
  {
    version: "0.1.14",
    deployedOn: "2026-10-20",
    pullRequest: {
      number: 21,
      url: "https://github.com/alljigsawpuzzles/open-seo/pull/21",
    },
    mergeCommit: "ff093c2febffff3830bc1dc22e3b19a7fde3d889",
    upstream: {
      label: "OpenSEO v0.1.14",
      compareUrl:
        "https://github.com/every-app/open-seo/compare/v0.1.13...v0.1.14",
      sections: [
        {
          title: "Official release",
          items: [
            "IndexNow submissions (Settings → Integrations and MCP).",
            "Rank trackers per language; title/meta length shows flagged text.",
            "Ranked keywords no longer marked Not found after one bad SERP page.",
            "Prompt Research disambiguation; dashboard backlinks spam filter.",
          ],
        },
      ],
    },
    forkChanges: [
      "Public app pages: /about/, /privacy, and Google Search Console verification HTML (Access bypass for those paths only).",
      "Dedicated CRAWLER_ACCESS_SECRET on app and audit Workers (auth secret removed from audit worker).",
      "Crawler diagnostics and Shopify throttling merged with fork fetch/render fallback behavior.",
      "DataForSEO-only Prompt Research when OPENROUTER_API_KEY is unset on self-host.",
      "Six merge conflicts resolved preserving fork crawl telemetry and HTML fallback.",
    ],
    operations: [
      "D1 migrations 0056–0059 applied; migration 0055 deliberately skipped.",
      "Obsolete audit_pages JSON columns retained (0055 cleanup deferred).",
    ],
    openFollowUps: [
      "Shopify signature re-save under current crawler key.",
      "IndexNow verification file and live submission activation.",
    ],
  },
  {
    version: "Pre-0.1.14 fork",
    deployedOn: "2026-10-15",
    upstream: {
      label: "Fork maintenance before upstream v0.1.14 integration",
      sections: [
        {
          title: "Context",
          items: [
            "Internal self-host on Cloudflare Workers for All Jigsaw Puzzles staff.",
            "Earlier integration work (e.g. AI visibility manual setup, crawler hardening) landed on fork main before the v0.1.14 release merge.",
          ],
        },
      ],
    },
    forkChanges: [
      "Self-host compatibility paths for AI prompt research without OpenRouter.",
      "Signed crawl / Shopify investigation tooling and audit workflow diagnostics.",
      "Production Cloudflare Access; no generic db:migrate:prod without an explicit allowlist.",
    ],
    operations: [
      "See private handover notes under openseo-handover/2026-10-27/ for evidence before v0.1.14.",
    ],
  },
];
