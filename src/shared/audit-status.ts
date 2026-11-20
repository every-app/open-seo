import type { PageFetchClass } from "./audit-fetch-class";

/**
 * How an audit run stands. `Refused` is an audit the site turned away before
 * the crawler read a page; `Failed` is reserved for faults on our side. A
 * crawl that stopped part way is `Completed` and carries a crawl-stop issue.
 */
export enum AuditStatus {
  Running = "running",
  Completed = "completed",
  Refused = "refused",
  Failed = "failed",
}

/** What turned the crawler away from an audit that read no page. */
export enum AuditRefusalReason {
  RateLimited = "rate_limited",
  BotProtection = "bot_protection",
}

/**
 * Why an audit read no page, from its page counts by fetch outcome; null when
 * it read one, or when nothing refused it (an empty or unreachable site).
 */
export function auditRefusalReason(
  pages: Record<PageFetchClass, number>,
): AuditRefusalReason | null {
  if (pages.ok > 0) return null;
  if (pages.rate_limited > 0) return AuditRefusalReason.RateLimited;
  if (pages.blocked > 0) return AuditRefusalReason.BotProtection;
  return null;
}
