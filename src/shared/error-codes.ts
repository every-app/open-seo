export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "AUTH_CONFIG_MISSING",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CRAWL_TARGET_BLOCKED",
  "RATE_LIMITED",
  "CONFLICT",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}
