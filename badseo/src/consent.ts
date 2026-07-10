// Versioned, canonical consent copy shared by the browser UI and the
// operator-side consent ledger. Never edit an existing version in place: bump
// `noticeVersion` when the wording, vendor, or purpose materially changes so a
// stored record continues to prove exactly what a visitor saw.

export const CONSENT_SCHEMA_VERSION = 1;
export const CONSENT_STORAGE_VERSION = 2;
export const CONSENT_STORAGE_KEY = "badseo:analytics-consent:v2";
export const LEGACY_CONSENT_STORAGE_KEYS = [
  "badseo:analytics-consent:v1",
] as const;

export const CONSENT_RETENTION_DAYS = 400;
// Keep operator-side evidence long enough to cover the 400-day browser grant
// plus the configured 14-month GA4 event-retention window. This is separate
// from the shorter browser preference and should be revisited with counsel if
// either downstream retention or the legal evidence requirement changes.
export const CONSENT_EVIDENCE_RETENTION_DAYS = 830;
export const CONSENT_EVIDENCE_RETENTION_SECONDS =
  CONSENT_EVIDENCE_RETENTION_DAYS * 24 * 60 * 60;

export const ANALYTICS_CONSENT_NOTICE = {
  noticeVersion: "2026-07-10.2",
  privacyPolicyVersion: "2026-07-10",
  site: "https://badseo.dev",
  category: "Analytics / optional",
  title: "Help us see which broken pages people use.",
  description:
    "If accepted, Google Analytics, provided by Google, sets cookies to measure visits, page use, and outbound clicks. It stays off unless you accept.",
  provider: "Google Analytics 4 (Google LLC)",
  purpose: "Measure visits, page use, and outbound links on badseo.dev.",
  choices: {
    reject: "Reject",
    accept: "Accept analytics",
  },
  privacyUrl: "/privacy",
  privacyLinkLabel: "Privacy details",
} as const;
