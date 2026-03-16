import { z } from "zod";

const backlinksRowSchema = z.object({
  domainFrom: z.string().nullable(),
  urlFrom: z.string().nullable(),
  urlTo: z.string().nullable(),
  anchor: z.string().nullable(),
  itemType: z.string().nullable(),
  isDofollow: z.boolean().nullable(),
  relAttributes: z.array(z.string()),
  rank: z.number().nullable(),
  domainFromRank: z.number().nullable(),
  pageFromRank: z.number().nullable(),
  spamScore: z.number().nullable(),
  firstSeen: z.string().nullable(),
  lastSeen: z.string().nullable(),
  isLost: z.boolean(),
  isBroken: z.boolean(),
  linksCount: z.number().nullable(),
});

export const referringDomainRowSchema = z.object({
  domain: z.string().nullable(),
  backlinks: z.number().nullable(),
  referringPages: z.number().nullable(),
  rank: z.number().nullable(),
  spamScore: z.number().nullable(),
  firstSeen: z.string().nullable(),
  brokenBacklinks: z.number().nullable(),
  brokenPages: z.number().nullable(),
});

export const topPageRowSchema = z.object({
  page: z.string().nullable(),
  backlinks: z.number().nullable(),
  referringDomains: z.number().nullable(),
  rank: z.number().nullable(),
  brokenBacklinks: z.number().nullable(),
});

const backlinksTrendRowSchema = z.object({
  date: z.string(),
  backlinks: z.number().nullable(),
  referringDomains: z.number().nullable(),
  rank: z.number().nullable(),
});

const backlinksNewLostTrendRowSchema = z.object({
  date: z.string(),
  newBacklinks: z.number().nullable(),
  lostBacklinks: z.number().nullable(),
  newReferringDomains: z.number().nullable(),
  lostReferringDomains: z.number().nullable(),
});

export const backlinksOverviewSchema = z.object({
  target: z.string(),
  displayTarget: z.string(),
  scope: z.enum(["domain", "page"]),
  includeSubdomains: z.boolean(),
  includeIndirectLinks: z.boolean(),
  excludeInternalBacklinks: z.boolean(),
  status: z.enum(["live", "lost", "all"]),
  summary: z.object({
    rank: z.number().nullable(),
    backlinks: z.number().nullable(),
    referringPages: z.number().nullable(),
    referringDomains: z.number().nullable(),
    brokenBacklinks: z.number().nullable(),
    brokenPages: z.number().nullable(),
    backlinksSpamScore: z.number().nullable(),
    targetSpamScore: z.number().nullable(),
    newBacklinks: z.number().nullable(),
    lostBacklinks: z.number().nullable(),
    newReferringDomains: z.number().nullable(),
    lostReferringDomains: z.number().nullable(),
  }),
  backlinks: z.array(backlinksRowSchema),
  referringDomains: z.array(referringDomainRowSchema),
  topPages: z.array(topPageRowSchema),
  trends: z.array(backlinksTrendRowSchema),
  newLostTrends: z.array(backlinksNewLostTrendRowSchema),
  fetchedAt: z.string(),
});

export type BacklinksOverviewResult = z.infer<typeof backlinksOverviewSchema>;
