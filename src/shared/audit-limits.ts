// Per-audit page bounds. Shared so the launch form, the input schema, and the
// server-side tier gate all read the same numbers and can't drift apart.
export const MIN_AUDIT_PAGES = 10;
export const DEFAULT_AUDIT_PAGES = 50;
export const FREE_MAX_AUDIT_PAGES = 50;
export const PAID_MAX_AUDIT_PAGES = 10_000;
// A hosted rendered audit's credit hold is an Autumn lock, which lasts at most
// 24 hours. Its crawl stops after this long, so the audit still settles
// against the lock with time to spare for Lighthouse and finalization.
export const RENDERED_CRAWL_TIME_LIMIT_HOURS = 22;
