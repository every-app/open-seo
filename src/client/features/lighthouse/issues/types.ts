import type { z } from "zod";
import type { getAuditLighthouseIssues } from "@/serverFunctions/lighthouse";
import {
  LIGHTHOUSE_CATEGORY_TABS,
  type LighthouseCategoryTab,
} from "@/shared/lighthouse";
import type { lighthouseAuditExportSchema } from "@/types/schemas/lighthouse";

export const categoryTabs = LIGHTHOUSE_CATEGORY_TABS;

export type CategoryTab = LighthouseCategoryTab;

export type ExportPayload = Omit<
  z.infer<typeof lighthouseAuditExportSchema>,
  "projectId" | "resultId"
>;

type LighthouseIssuesResponse = Awaited<
  ReturnType<typeof getAuditLighthouseIssues>
>;

export type LighthouseIssue = LighthouseIssuesResponse["issues"][number];
export type LighthouseScores = NonNullable<LighthouseIssuesResponse["scores"]>;
export type LighthouseMetrics = NonNullable<
  LighthouseIssuesResponse["metrics"]
>;
