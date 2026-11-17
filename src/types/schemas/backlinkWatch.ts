import { z } from "zod";
import {
  DEFAULT_IMPORTANT_MIN_DOMAIN_RANK,
  DEFAULT_MAX_ROWS,
  DEFAULT_SINCE_DAYS,
  MAX_ROWS,
  MAX_SINCE_DAYS,
} from "@/server/features/backlink-watch/backlinkWatchThresholds";

export const backlinkWatchInputSchema = z.object({
  sinceDays: z
    .number()
    .int()
    .min(1)
    .max(MAX_SINCE_DAYS)
    .default(DEFAULT_SINCE_DAYS)
    .describe(
      `How many days back to look, default ${DEFAULT_SINCE_DAYS}, maximum ${MAX_SINCE_DAYS}.`,
    ),
  opportunities: z
    .enum(["new", "all", "off"])
    .default("new")
    .describe(
      'Competitor link opportunities. "new" (default): sites that started linking to a saved competitor in the window. "all": the top opportunities regardless of date. "off": skip them.',
    ),
  maxRows: z
    .number()
    .int()
    .min(1)
    .max(MAX_ROWS)
    .default(DEFAULT_MAX_ROWS)
    .describe(
      `Rows per list, default ${DEFAULT_MAX_ROWS}, maximum ${MAX_ROWS}. Counts in summary are always complete.`,
    ),
  importantMinDomainRank: z
    .number()
    .int()
    .min(0)
    .max(100)
    .default(DEFAULT_IMPORTANT_MIN_DOMAIN_RANK)
    .describe(
      `A lost link is important when it is dofollow, not spam, and its linking domain rank (0 to 100) is at least this, default ${DEFAULT_IMPORTANT_MIN_DOMAIN_RANK}.`,
    ),
});

const linkSchema = z.looseObject({
  domainFrom: z.string().nullable(),
  urlFrom: z.string().nullable(),
  urlTo: z.string().nullable(),
  anchor: z.string().nullable(),
  isDofollow: z.boolean().nullable(),
  domainRank: z.number().nullable(),
  spamScore: z.number().nullable(),
  firstSeen: z.string().nullable(),
  lostDate: z.string().nullable(),
});

const lostLinkSchema = linkSchema.extend({ important: z.boolean() });

const opportunitySchema = z.looseObject({
  domain: z.string(),
  competitors: z.array(z.string()),
  competitorCount: z.number(),
  domainRank: z.number().nullable(),
  spamScore: z.number().nullable(),
  /** Latest date a saved competitor first got a link from this domain. */
  firstSeen: z.string().nullable(),
});

export const backlinkWatchOutputSchema = z.looseObject({
  domain: z.string(),
  window: z.looseObject({
    startDate: z.string(),
    endDate: z.string(),
    sinceDays: z.number(),
  }),
  spamThreshold: z.number(),
  importantMinDomainRank: z.number(),
  summary: z.looseObject({
    gainedCount: z.number(),
    lostCount: z.number(),
    importantLostCount: z.number(),
    opportunityCount: z.number(),
    spamCount: z.number(),
    /** True when the spam count hit DataForSEO's single-page limit. */
    spamCountIsLowerBound: z.boolean(),
  }),
  gained: z.array(linkSchema),
  lost: z.array(lostLinkSchema),
  opportunities: z.array(opportunitySchema),
  spam: z.looseObject({
    topDomains: z.array(
      z.looseObject({ domain: z.string(), spamScore: z.number().nullable() }),
    ),
  }),
  competitors: z.array(z.string()),
  notes: z.array(z.string()),
});

export type BacklinkWatchInput = z.infer<typeof backlinkWatchInputSchema>;
export type BacklinkWatchResult = z.infer<typeof backlinkWatchOutputSchema>;
export type BacklinkWatchLink = z.infer<typeof linkSchema>;
export type BacklinkWatchLostLink = z.infer<typeof lostLinkSchema>;
export type BacklinkWatchOpportunity = z.infer<typeof opportunitySchema>;
