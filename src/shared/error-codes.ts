import { z } from "zod";

const ERROR_CODES = [
  "UNAUTHENTICATED",
  "AUTH_CONFIG_MISSING",
  "PAYMENT_REQUIRED",
  "FORBIDDEN",
  "NOT_FOUND",
  "AUDIT_CAPACITY_REACHED",
  "VALIDATION_ERROR",
  "CRAWL_TARGET_BLOCKED",
  "BACKLINKS_NOT_ENABLED",
  "BACKLINKS_BILLING_ISSUE",
  "RATE_LIMITED",
  "CONFLICT",
  "INTERNAL_ERROR",
] as const;

export const errorCodeSchema = z.enum(ERROR_CODES);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export function isErrorCode(value: string): value is ErrorCode {
  return errorCodeSchema.safeParse(value).success;
}
