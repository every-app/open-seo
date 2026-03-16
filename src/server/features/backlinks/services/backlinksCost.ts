import { z } from "zod";

export type BacklinksApiCallCost = {
  endpoint: string;
  path: string[];
  costUsd: number;
  resultCount: number | null;
  rowsReturned: number;
};

export type BacklinksCostSummary = {
  provider: "dataforseo";
  currency: "USD";
  fromCache: boolean;
  totalCostUsd: number;
  calls: BacklinksApiCallCost[];
};

export const backlinksCostSummarySchema = z.object({
  provider: z.literal("dataforseo"),
  currency: z.literal("USD"),
  fromCache: z.boolean(),
  totalCostUsd: z.number(),
  calls: z.array(
    z.object({
      endpoint: z.string(),
      path: z.array(z.string()),
      costUsd: z.number(),
      resultCount: z.number().nullable(),
      rowsReturned: z.number(),
    }),
  ),
});

export function summarizeBacklinksCosts(
  calls: BacklinksApiCallCost[],
  fromCache: boolean,
): BacklinksCostSummary {
  return {
    provider: "dataforseo",
    currency: "USD",
    fromCache,
    totalCostUsd: roundUsd(calls.reduce((sum, call) => sum + call.costUsd, 0)),
    calls,
  };
}

function roundUsd(value: number) {
  return Math.round(value * 100000) / 100000;
}
