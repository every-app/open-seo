import { z } from "zod";

function isTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// A user-chosen run time for scheduled checks, in their own timezone. It only
// picks where the next_check_at anchor starts; the
// anchor is UTC and advances in fixed steps, so the timezone is not stored.
export const scheduleTimeSchema = z.object({
  weekday: z
    .number()
    .int()
    .min(0)
    .max(6)
    .optional()
    .describe(
      "Day of week, 0 = Sunday. Required for weekly schedules, ignored by the others.",
    ),
  hour: z.number().int().min(0).max(23).describe("Hour, 0-23."),
  minute: z.number().int().min(0).max(59).describe("Minute, 0-59."),
  timeZone: z
    .string()
    .refine(isTimeZone, "Unknown IANA timezone")
    .optional()
    .describe(
      'IANA timezone the weekday, hour, and minute are in, e.g. "America/New_York". Defaults to UTC.',
    ),
});
