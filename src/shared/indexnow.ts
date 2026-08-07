export const INDEXNOW_API_URL = "https://api.indexnow.org/indexnow";
export const INDEXNOW_BATCH_LIMIT = 10_000;
export const INDEXNOW_QUEUE_BATCH_SIZE = 100;
export const INDEXNOW_MAX_ATTEMPTS = 3;
export const INDEXNOW_RETRY_DELAYS_MS = [250, 1_000] as const;

export const INDEXNOW_EVENT_TYPES = [
  "submitted",
  "verified",
  "failed",
  "expired",
] as const;
export type IndexingEventType = (typeof INDEXNOW_EVENT_TYPES)[number];

export const INDEXNOW_EVENT_STATUSES = ["pending", "success", "error"] as const;
export type IndexingEventStatus = (typeof INDEXNOW_EVENT_STATUSES)[number];
