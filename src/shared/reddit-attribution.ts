import { z } from "zod";

export const redditAttributionSchema = z.object({
  clickId: z.string().trim().min(1).max(256).optional(),
  uuid: z.string().trim().min(1).max(256).optional(),
  landingPage: z.string().trim().min(1).max(2048).optional(),
  referrer: z.string().trim().max(2048).optional(),
  utmSource: z.string().trim().min(1).max(256).optional(),
  utmMedium: z.string().trim().min(1).max(256).optional(),
  utmCampaign: z.string().trim().min(1).max(256).optional(),
  utmTerm: z.string().trim().min(1).max(256).optional(),
  utmContent: z.string().trim().min(1).max(256).optional(),
});

export type RedditAttributionInput = z.infer<typeof redditAttributionSchema>;

export function hasRedditAttribution(input: RedditAttributionInput) {
  return Boolean(
    input.clickId ||
    input.uuid ||
    input.utmSource?.toLowerCase() === "reddit" ||
    input.referrer?.toLowerCase().includes("reddit."),
  );
}
