import { z } from "zod";

// SDK-free response schemas shared between the lazily loaded DataForSEO
// section fetcher (backlinks.ts) and the eagerly-loaded RankParse provider
// (rankparse/backlinks.ts). Keep this module free of dataforseo-client and
// section-file imports — it must be safe to evaluate in the eager isolate
// startup graph (see vite-plugin-lean-worker-bundle.ts's EAGER_DENYLIST).

// DataForSEO ships both the misspelled (`*_reffering_*`) and corrected keys; we
// accept both via passthrough so callers can read whichever is present.
export const backlinksSummaryItemSchema = z
  .object({
    target: z.string().optional(),
    rank: z.number().nullable().optional(),
    backlinks: z.number().nullable().optional(),
    referring_pages: z.number().nullable().optional(),
    referring_domains: z.number().nullable().optional(),
    broken_backlinks: z.number().nullable().optional(),
    broken_pages: z.number().nullable().optional(),
    new_backlinks: z.number().nullable().optional(),
    lost_backlinks: z.number().nullable().optional(),
    new_reffering_domains: z.number().nullable().optional(),
    lost_reffering_domains: z.number().nullable().optional(),
    new_referring_domains: z.number().nullable().optional(),
    lost_referring_domains: z.number().nullable().optional(),
    backlinks_spam_score: z.number().nullable().optional(),
    info: z
      .object({ target_spam_score: z.number().nullable().optional() })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export const backlinksItemSchema = z
  .object({
    domain_from: z.string().nullable().optional(),
    url_from: z.string().nullable().optional(),
    url_to: z.string().nullable().optional(),
    anchor: z.string().nullable().optional(),
    item_type: z.string().nullable().optional(),
    dofollow: z.boolean().nullable().optional(),
    rank: z.number().nullable().optional(),
    domain_from_rank: z.number().nullable().optional(),
    page_from_rank: z.number().nullable().optional(),
    backlinks_spam_score: z.number().nullable().optional(),
    backlink_spam_score: z.number().nullable().optional(),
    first_seen: z.string().nullable().optional(),
    last_visited: z.string().nullable().optional(),
    lost_date: z.string().nullable().optional(),
    is_new: z.boolean().nullable().optional(),
    is_lost: z.boolean().nullable().optional(),
    is_broken: z.boolean().nullable().optional(),
    links_count: z.number().nullable().optional(),
    rel_attributes: z.array(z.string()).nullable().optional(),
    attributes: z.array(z.string()).nullable().optional(),
  })
  .passthrough();

export const referringDomainItemSchema = z
  .object({
    domain: z.string().nullable().optional(),
    backlinks: z.number().nullable().optional(),
    referring_pages: z.number().nullable().optional(),
    rank: z.number().nullable().optional(),
    first_seen: z.string().nullable().optional(),
    broken_backlinks: z.number().nullable().optional(),
    broken_pages: z.number().nullable().optional(),
    backlinks_spam_score: z.number().nullable().optional(),
    target_spam_score: z.number().nullable().optional(),
  })
  .passthrough();

export const domainPageSummaryItemSchema = z
  .object({
    page: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    backlinks: z.number().nullable().optional(),
    referring_domains: z.number().nullable().optional(),
    rank: z.number().nullable().optional(),
    broken_backlinks: z.number().nullable().optional(),
  })
  .passthrough();

export const backlinksHistoryItemSchema = z
  .object({
    date: z.string().nullable().optional(),
    rank: z.number().nullable().optional(),
    backlinks: z.number().nullable().optional(),
    referring_domains: z.number().nullable().optional(),
    new_backlinks: z.number().nullable().optional(),
    lost_backlinks: z.number().nullable().optional(),
    new_reffering_domains: z.number().nullable().optional(),
    lost_reffering_domains: z.number().nullable().optional(),
    new_referring_domains: z.number().nullable().optional(),
    lost_referring_domains: z.number().nullable().optional(),
  })
  .passthrough();

export type BacklinksSummaryItem = z.infer<typeof backlinksSummaryItemSchema>;
export type BacklinksItem = z.infer<typeof backlinksItemSchema>;
export type ReferringDomainItem = z.infer<typeof referringDomainItemSchema>;
export type DomainPageSummaryItem = z.infer<typeof domainPageSummaryItemSchema>;
export type BacklinksHistoryItem = z.infer<typeof backlinksHistoryItemSchema>;
