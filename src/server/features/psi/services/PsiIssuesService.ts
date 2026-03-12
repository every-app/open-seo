import { sortBy } from "remeda";
import { z } from "zod";
import { jsonCodec } from "@/shared/json";

const PSI_CATEGORIES = [
  "performance",
  "accessibility",
  "best-practices",
  "seo",
] as const;

export type PsiIssueCategory = (typeof PSI_CATEGORIES)[number];

type PsiIssue = {
  category: PsiIssueCategory;
  auditKey: string;
  title: string;
  description: string;
  score: number | null;
  scoreDisplayMode: string | null;
  displayValue: string | null;
  impactMs: number | null;
  impactBytes: number | null;
  severity: "critical" | "warning" | "info";
  items: string[];
};

type LighthouseAudit = {
  title?: string;
  description?: string;
  score?: number | null;
  scoreDisplayMode?: string;
  displayValue?: string;
  details?: {
    overallSavingsMs?: number;
    overallSavingsBytes?: number;
    items?: Array<Record<string, unknown>>;
  };
};

type LighthouseCategory = {
  auditRefs?: Array<{
    id?: string;
  }>;
};

const lighthouseAuditSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  score: z.number().nullable().optional(),
  scoreDisplayMode: z.string().optional(),
  displayValue: z.string().optional(),
  details: z
    .object({
      overallSavingsMs: z.number().optional(),
      overallSavingsBytes: z.number().optional(),
      items: z.array(z.record(z.string(), z.unknown())).optional(),
    })
    .optional(),
});

const lighthouseCategorySchema = z.object({
  auditRefs: z
    .array(
      z.object({
        id: z.string().optional(),
      }),
    )
    .optional(),
});

const psiPayloadSchema = z.object({
  lighthouseResult: z
    .object({
      audits: z
        .record(z.string(), lighthouseAuditSchema)
        .optional()
        .default({}),
      categories: z
        .record(z.string(), lighthouseCategorySchema)
        .optional()
        .default({}),
    })
    .optional()
    .default({
      audits: {},
      categories: {},
    }),
});

const psiPayloadCodec = jsonCodec(psiPayloadSchema);

function normalizeScore(score: number | null | undefined): number | null {
  if (score == null || Number.isNaN(score)) return null;
  return Math.round(score * 100);
}

function compactItem(item: Record<string, unknown>): string {
  const preferredKeys = [
    "url",
    "source",
    "nodeLabel",
    "snippet",
    "totalBytes",
    "wastedBytes",
    "wastedMs",
    "label",
    "value",
  ];

  const output: Record<string, unknown> = {};
  for (const key of preferredKeys) {
    if (item[key] != null) {
      output[key] = item[key];
    }
  }

  if (Object.keys(output).length === 0) {
    for (const [key, value] of Object.entries(item).slice(0, 6)) {
      output[key] = value;
    }
  }

  return JSON.stringify(output);
}

function getSeverity(input: {
  score: number | null;
  impactMs: number | null;
  impactBytes: number | null;
}): "critical" | "warning" | "info" {
  if ((input.impactMs ?? 0) >= 300 || (input.impactBytes ?? 0) >= 150_000) {
    return "critical";
  }

  if (input.score != null && input.score < 50) {
    return "critical";
  }

  if ((input.impactMs ?? 0) >= 100 || (input.impactBytes ?? 0) >= 50_000) {
    return "warning";
  }

  if (input.score != null && input.score < 90) {
    return "warning";
  }

  return "info";
}

function parseIssues(
  payloadJson: string,
  categoryFilter?: PsiIssueCategory,
): PsiIssue[] {
  const parsedPayload = psiPayloadCodec.safeParse(payloadJson);
  if (!parsedPayload.success) {
    throw new Error("Invalid Lighthouse payload JSON");
  }

  const audits: Record<string, LighthouseAudit> =
    parsedPayload.data.lighthouseResult.audits;
  const categories: Record<string, LighthouseCategory> =
    parsedPayload.data.lighthouseResult.categories;

  const issues: PsiIssue[] = [];

  for (const category of PSI_CATEGORIES) {
    if (categoryFilter && category !== categoryFilter) continue;

    const refs = categories[category]?.auditRefs ?? [];
    for (const ref of refs) {
      const auditKey = ref.id;
      if (!auditKey) continue;

      const audit = audits[auditKey];
      if (!audit) continue;

      const score = normalizeScore(audit.score);
      const displayMode = audit.scoreDisplayMode ?? null;

      const isPass =
        (score != null && score >= 90) ||
        displayMode === "notApplicable" ||
        displayMode === "informative" ||
        displayMode === "manual";

      if (isPass) continue;

      const impactMs =
        typeof audit.details?.overallSavingsMs === "number"
          ? audit.details.overallSavingsMs
          : null;
      const impactBytes =
        typeof audit.details?.overallSavingsBytes === "number"
          ? audit.details.overallSavingsBytes
          : null;

      const items = Array.isArray(audit.details?.items)
        ? audit.details.items.slice(0, 10).map(compactItem)
        : [];

      issues.push({
        category,
        auditKey,
        title: audit.title ?? auditKey,
        description: audit.description ?? "",
        score,
        scoreDisplayMode: displayMode,
        displayValue: audit.displayValue ?? null,
        impactMs,
        impactBytes,
        severity: getSeverity({ score, impactMs, impactBytes }),
        items,
      });
    }
  }

  return sortBy(
    issues,
    [
      (issue) => (issue.impactMs ?? 0) * 1000 + (issue.impactBytes ?? 0),
      "desc",
    ],
    [(issue) => issue.score ?? 100, "asc"],
  );
}

export const PsiIssuesService = {
  parseIssues,
} as const;
