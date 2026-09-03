import type { getClarityInsights } from "@/serverFunctions/clarity";

export type ClarityInsightsData = Extract<
  Awaited<ReturnType<typeof getClarityInsights>>,
  { connected: true }
>;

export type ClarityPageInsight =
  ClarityInsightsData["pageInsights"]["rows"][number];
