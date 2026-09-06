import { z } from "zod";
import { isValidDomainHost, researchScopeSchema } from "@/shared/researchScope";
import {
  DOMAIN_HISTORY_MAX_DOMAINS,
  DOMAIN_HISTORY_MIN_DATE,
} from "@/shared/domain-history";

/**
 * Extract and validate a bare hostname from user input that may be a full URL.
 * Strips protocol, www prefix, path, query-string, and hash.
 */
export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  // Ensure URL() can parse the input by adding a protocol if missing
  if (!/^[a-z]+:\/\//.test(d)) d = `https://${d}`;
  const { hostname } = new URL(d); // throws on truly invalid input
  return hostname.replace(/^www\./, "");
}

/** Zod field: accepts a bare domain or full URL, outputs a clean hostname. */
export const domainField = z
  .string()
  .min(1)
  .max(253)
  .transform((val, ctx) => {
    try {
      const hostname = normalizeDomain(val);
      if (!hostname.includes(".") || !isValidDomainHost(hostname)) {
        ctx.addIssue({
          code: "custom",
          message: "Enter a valid domain like example.com",
        });
        return z.NEVER;
      }
      return hostname;
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid domain like example.com",
      });
      return z.NEVER;
    }
  });

const DOMAIN_HISTORY_TARGET_ERROR =
  "Historical traffic supports domains and subdomains only; folder paths such as example.com/jp are not available from DataForSEO.";

export function normalizeDomainHistoryTarget(input: string): string {
  let value = input.trim().toLowerCase();
  if (!/^[a-z]+:\/\//.test(value)) value = `https://${value}`;
  const url = new URL(value);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(DOMAIN_HISTORY_TARGET_ERROR);
  }
  const hostname = url.hostname.replace(/^www\./, "");
  if (!hostname.includes(".") || !isValidDomainHost(hostname)) {
    throw new Error("Enter a valid domain like example.com");
  }
  return hostname;
}

export const domainHistoryTargetField = z
  .string()
  .min(1)
  .max(2048)
  .transform((value, ctx) => {
    try {
      return normalizeDomainHistoryTarget(value);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message:
          error instanceof Error ? error.message : DOMAIN_HISTORY_TARGET_ERROR,
      });
      return z.NEVER;
    }
  });

export const booleanSearchParamSchema = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true");

export const domainOverviewSchema = z.object({
  projectId: z.string().uuid(),
  domain: z.string().min(1, "Domain is required").max(2048),
  scope: researchScopeSchema.optional(),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).optional(),
});

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
    message: "Enter a valid date",
  });

export const domainHistoryRequestSchema = z
  .object({
    projectId: z.string().uuid(),
    domains: z
      .array(domainHistoryTargetField)
      .min(1)
      .max(DOMAIN_HISTORY_MAX_DOMAINS)
      .transform((domains) => [...new Set(domains)]),
    dateFrom: isoDateSchema,
    dateTo: isoDateSchema,
    locationCode: z.number().int().positive().optional(),
    languageCode: z.string().min(2).max(8).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.dateFrom < DOMAIN_HISTORY_MIN_DATE) {
      ctx.addIssue({
        code: "custom",
        path: ["dateFrom"],
        message: `Historical data starts at ${DOMAIN_HISTORY_MIN_DATE}`,
      });
    }
    if (value.dateFrom > value.dateTo) {
      ctx.addIssue({
        code: "custom",
        path: ["dateFrom"],
        message: "Start date must be before end date",
      });
    }
  });

/* ------------------------------------------------------------------ */
/*  URL search params schema for /p/$projectId/domain                  */
/* ------------------------------------------------------------------ */

const domainSortModes = ["rank", "traffic", "volume", "score", "cpc"] as const;
const domainSortOrders = ["asc", "desc"] as const;
const domainTabs = ["keywords", "pages"] as const;

export const domainKeywordSuggestionsSchema = z.object({
  projectId: z.string().uuid(),
  domain: z.string().min(1, "Domain is required").max(2048),
  scope: researchScopeSchema.optional(),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).optional(),
});

export const DOMAIN_KEYWORDS_PAGE_SIZES = [50, 100, 200] as const;
export const DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE = 100;
export const MAX_DATAFORSEO_FILTER_CONDITIONS = 8;

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

const domainKeywordsFiltersSchema = z.object({
  include: z.string().optional(),
  exclude: z.string().optional(),
  minTraffic: optionalNumber,
  maxTraffic: optionalNumber,
  minVol: optionalNumber,
  maxVol: optionalNumber,
  minCpc: optionalNumber,
  maxCpc: optionalNumber,
  minKd: optionalNumber,
  maxKd: optionalNumber,
  minRank: optionalNumber,
  maxRank: optionalNumber,
});

export type DomainKeywordsFilters = z.infer<typeof domainKeywordsFiltersSchema>;

export const domainKeywordsPageRequestSchema = z.object({
  projectId: z.string().uuid(),
  domain: z.string().min(1).max(2048),
  scope: researchScopeSchema.optional(),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z
    .number()
    .int()
    .refine((value) =>
      (DOMAIN_KEYWORDS_PAGE_SIZES as readonly number[]).includes(value),
    )
    .default(DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE),
  sortMode: z.enum(domainSortModes).default("traffic"),
  sortOrder: z.enum(domainSortOrders).default("desc"),
  filters: domainKeywordsFiltersSchema.default({}),
  search: z.string().optional(),
});

const domainPagesSortModes = ["traffic", "keywords"] as const;

export const domainPagesPageRequestSchema = z.object({
  projectId: z.string().uuid(),
  domain: z.string().min(1).max(2048),
  scope: researchScopeSchema.optional(),
  locationCode: z.number().int().positive().optional(),
  languageCode: z.string().min(2).max(8).optional(),
  page: z.number().int().positive().default(1),
  pageSize: z
    .number()
    .int()
    .refine((value) =>
      (DOMAIN_KEYWORDS_PAGE_SIZES as readonly number[]).includes(value),
    )
    .default(DEFAULT_DOMAIN_KEYWORDS_PAGE_SIZE),
  sortMode: z.enum(domainPagesSortModes).default("traffic"),
  sortOrder: z.enum(domainSortOrders).default("desc"),
  filters: domainKeywordsFiltersSchema.default({}),
  search: z.string().optional(),
});

const optionalSearchNumberParam = z.coerce.number().optional().catch(undefined);
const optionalSearchPositiveIntParam = z.coerce
  .number()
  .int()
  .positive()
  .optional()
  .catch(undefined);
const filterStringParam = z.string().optional();
const filterNumberParam = optionalSearchNumberParam;

export const domainSearchSchema = z.object({
  domain: z.string().optional(),
  scope: researchScopeSchema.optional().catch(undefined),
  /** Legacy param: pre-scope URLs encoded "Include subdomains" here. */
  subdomains: booleanSearchParamSchema.optional(),
  sort: z.enum(domainSortModes).optional(),
  order: z.enum(domainSortOrders).optional(),
  tab: z.enum(domainTabs).optional(),
  loc: optionalSearchPositiveIntParam,
  page: optionalSearchPositiveIntParam,
  size: z.coerce
    .number()
    .int()
    .refine((value) =>
      (DOMAIN_KEYWORDS_PAGE_SIZES as readonly number[]).includes(value),
    )
    .optional()
    .catch(undefined),
  include: filterStringParam,
  exclude: filterStringParam,
  minTraffic: filterNumberParam,
  maxTraffic: filterNumberParam,
  minVol: filterNumberParam,
  maxVol: filterNumberParam,
  minCpc: filterNumberParam,
  maxCpc: filterNumberParam,
  minKd: filterNumberParam,
  maxKd: filterNumberParam,
  minRank: filterNumberParam,
  maxRank: filterNumberParam,
  pInclude: filterStringParam,
  pExclude: filterStringParam,
  pMinTraffic: filterNumberParam,
  pMaxTraffic: filterNumberParam,
  pMinVol: filterNumberParam,
  pMaxVol: filterNumberParam,
});

export type DomainSearchParams = z.infer<typeof domainSearchSchema>;
