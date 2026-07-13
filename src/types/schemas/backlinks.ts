import { z } from "zod";

export const backlinksTabSchema = z.enum(["backlinks", "domains", "pages"]);
export const backlinksTargetScopeSchema = z.enum(["domain", "page"]);
const DEFAULT_BACKLINKS_SPAM_THRESHOLD = 40;

function normalizeBacklinksSpamThreshold(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_BACKLINKS_SPAM_THRESHOLD;
  }

  return Math.min(100, Math.max(0, Math.trunc(value)));
}

export type BacklinksSpamFilterOptions = {
  hideSpam?: boolean;
  spamThreshold?: number;
};

export function normalizeBacklinksSpamFilterOptions(
  options?: BacklinksSpamFilterOptions,
) {
  const hideSpam = options?.hideSpam ?? true;

  return {
    hideSpam,
    spamThreshold: hideSpam
      ? normalizeBacklinksSpamThreshold(
          options?.spamThreshold ?? DEFAULT_BACKLINKS_SPAM_THRESHOLD,
        )
      : undefined,
  };
}
export const backlinksLookupSchema = z.object({
  target: z.string().min(1, "Target is required").max(2048),
  scope: backlinksTargetScopeSchema.optional(),
});

export const backlinksOverviewInputSchema = backlinksLookupSchema.extend({
  projectId: z.string().min(1),
});

/* ------------------------------------------------------------------ */
/*  Paginated tab requests                                             */
/* ------------------------------------------------------------------ */

export const BACKLINKS_PAGE_SIZES = [50, 100, 200] as const;
export const DEFAULT_BACKLINKS_PAGE_SIZE = 100;

const optionalNumber = z
  .union([
    z.number(),
    z.string().transform((value, ctx) => {
      const trimmed = value.trim();
      if (trimmed === "") return undefined;
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) {
        ctx.addIssue({ code: "custom", message: "Invalid number" });
        return z.NEVER;
      }
      return parsed;
    }),
  ])
  .optional();

export const backlinksRowsFiltersSchema = z.object({
  include: z.string().optional(),
  exclude: z.string().optional(),
  minDomainRank: optionalNumber,
  maxDomainRank: optionalNumber,
  minLinkAuthority: optionalNumber,
  maxLinkAuthority: optionalNumber,
  minSpamScore: optionalNumber,
  maxSpamScore: optionalNumber,
  linkType: z.enum(["dofollow", "nofollow"]).optional(),
  hideLost: z.boolean().optional(),
  hideBroken: z.boolean().optional(),
  /** Exact-match on the linking domain; used to expand one domain's links. */
  domainFrom: z.string().max(255).optional(),
});

/**
 * DataForSEO result grouping for the backlinks list: `one_per_domain` returns
 * each referring domain's strongest link (the default, denoised view);
 * `as_is` returns every individual backlink.
 */
export const backlinksRowsModeSchema = z.enum(["one_per_domain", "as_is"]);

export const referringDomainsFiltersSchema = z.object({
  include: z.string().optional(),
  exclude: z.string().optional(),
  minBacklinks: optionalNumber,
  maxBacklinks: optionalNumber,
  minRank: optionalNumber,
  maxRank: optionalNumber,
  minSpamScore: optionalNumber,
  maxSpamScore: optionalNumber,
});

export const topPagesFiltersSchema = z.object({
  include: z.string().optional(),
  exclude: z.string().optional(),
  minBacklinks: optionalNumber,
  maxBacklinks: optionalNumber,
  minReferringDomains: optionalNumber,
  maxReferringDomains: optionalNumber,
  minRank: optionalNumber,
  maxRank: optionalNumber,
});

export const backlinksSortOrderSchema = z.enum(["asc", "desc"]);
// Sort field names double as table column ids on the client; the server maps
// them to DataForSEO field names.
export const backlinksRowsSortFieldSchema = z.enum([
  "rank",
  "domainRank",
  "spamScore",
  "firstSeen",
]);
export const referringDomainsSortFieldSchema = z.enum([
  "domain",
  "backlinks",
  "referringPages",
  "rank",
  "spamScore",
  "firstSeen",
  "brokenBacklinks",
]);
export const topPagesSortFieldSchema = z.enum([
  "backlinks",
  "referringDomains",
  "rank",
  "brokenBacklinks",
]);

/** Single source for each tab's default sort, shared by the request-schema
 * defaults and the client's header indicators / query fallbacks. */
export const BACKLINKS_DEFAULT_SORT = {
  backlinks: { field: "rank", order: "desc" },
  domains: { field: "backlinks", order: "desc" },
  pages: { field: "backlinks", order: "desc" },
} as const satisfies Record<
  z.infer<typeof backlinksTabSchema>,
  { field: string; order: z.infer<typeof backlinksSortOrderSchema> }
>;

const backlinksPageRequestBase = backlinksLookupSchema.extend({
  projectId: z.string().min(1),
  page: z.number().int().positive().default(1),
  pageSize: z
    .number()
    .int()
    .refine((value) =>
      (BACKLINKS_PAGE_SIZES as readonly number[]).includes(value),
    )
    .default(DEFAULT_BACKLINKS_PAGE_SIZE),
  sortOrder: backlinksSortOrderSchema.default("desc"),
});

export const backlinksRowsPageRequestSchema = backlinksPageRequestBase.extend({
  sortField: backlinksRowsSortFieldSchema.default(
    BACKLINKS_DEFAULT_SORT.backlinks.field,
  ),
  filters: backlinksRowsFiltersSchema.default({}),
  mode: backlinksRowsModeSchema.default("one_per_domain"),
});

export const referringDomainsPageRequestSchema =
  backlinksPageRequestBase.extend({
    sortField: referringDomainsSortFieldSchema.default(
      BACKLINKS_DEFAULT_SORT.domains.field,
    ),
    filters: referringDomainsFiltersSchema.default({}),
  });

export const topPagesPageRequestSchema = backlinksPageRequestBase.extend({
  sortField: topPagesSortFieldSchema.default(
    BACKLINKS_DEFAULT_SORT.pages.field,
  ),
  filters: topPagesFiltersSchema.default({}),
});

export const backlinksSearchSchema = z.object({
  target: z.string().optional(),
  scope: backlinksTargetScopeSchema.optional(),
  tab: backlinksTabSchema.optional(),
  page: z.coerce.number().int().positive().optional().catch(undefined),
  size: z.coerce
    .number()
    .int()
    .refine((value) =>
      (BACKLINKS_PAGE_SIZES as readonly number[]).includes(value),
    )
    .optional()
    .catch(undefined),
  // Sort column id for the active tab; validated against the tab's sort-field
  // enum when building the request, so a mismatched value falls back to the
  // tab's default sort.
  sort: z.string().optional().catch(undefined),
  order: backlinksSortOrderSchema.optional().catch(undefined),
  // Backlinks tab only: "all" shows every link; default is one per domain.
  view: z.literal("all").optional().catch(undefined),
});

export type BacklinksLookupInput = z.infer<typeof backlinksLookupSchema>;
export type BacklinksTab = z.infer<typeof backlinksTabSchema>;
export type BacklinksTargetScope = z.infer<typeof backlinksTargetScopeSchema>;
export type BacklinksSortOrder = z.infer<typeof backlinksSortOrderSchema>;
export type BacklinksRowsSortField = z.infer<
  typeof backlinksRowsSortFieldSchema
>;
export type ReferringDomainsSortField = z.infer<
  typeof referringDomainsSortFieldSchema
>;
export type TopPagesSortField = z.infer<typeof topPagesSortFieldSchema>;
export type BacklinksRowsFilters = z.infer<typeof backlinksRowsFiltersSchema>;
export type ReferringDomainsFilters = z.infer<
  typeof referringDomainsFiltersSchema
>;
export type TopPagesFilters = z.infer<typeof topPagesFiltersSchema>;
export type BacklinksRowsPageInput = z.infer<
  typeof backlinksRowsPageRequestSchema
>;
export type ReferringDomainsPageInput = z.infer<
  typeof referringDomainsPageRequestSchema
>;
export type TopPagesPageInput = z.infer<typeof topPagesPageRequestSchema>;
