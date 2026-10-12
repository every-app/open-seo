import { z } from "zod";
import { describe, expect, it } from "vitest";
import { buildLighthouseExportFile } from "@/server/lib/lighthousePayload";

const issue = (category: string, auditKey: string) => ({
  category,
  auditKey,
  title: auditKey,
  description: "",
  score: 0,
  scoreDisplayMode: "binary",
  displayValue: null,
  impactMs: null,
  impactBytes: null,
  severity: "critical",
  items: [],
});

const metric = { score: null, displayValue: null, numericValue: null };

const storedPayloadJson = JSON.stringify({
  version: 2,
  source: "dataforseo-lighthouse",
  hasIssueDetails: true,
  metadata: {
    requestedUrl: "https://example.com/",
    finalUrl: "https://example.com/",
    strategy: "mobile",
    fetchedAt: "2026-03-23T19:27:33.000Z",
    lighthouseVersion: null,
    taskId: null,
    cost: null,
  },
  scores: { performance: 89, accessibility: 93, "best-practices": 92, seo: 91 },
  metrics: {
    firstContentfulPaint: metric,
    largestContentfulPaint: metric,
    totalBlockingTime: metric,
    cumulativeLayoutShift: metric,
    speedIndex: metric,
    timeToInteractive: metric,
    interactionToNextPaint: metric,
    serverResponseTime: metric,
  },
  issues: [
    issue("performance", "unused-javascript"),
    issue("accessibility", "color-contrast"),
  ],
});

const issuesExportSchema = z.object({
  resultId: z.string(),
  category: z.string(),
  issues: z.array(z.object({ auditKey: z.string() })),
});

describe("buildLighthouseExportFile", () => {
  it.each([
    {
      mode: "issues" as const,
      category: undefined,
      filename: "-issues.json",
      exportedCategory: "all",
      auditKeys: ["unused-javascript", "color-contrast"],
    },
    {
      mode: "category" as const,
      category: "accessibility" as const,
      filename: "-accessibility-issues.json",
      exportedCategory: "accessibility",
      auditKeys: ["color-contrast"],
    },
  ])(
    "exports only the issues for $mode mode",
    ({ mode, category, filename, exportedCategory, auditKeys }) => {
      const exported = buildLighthouseExportFile({
        idField: "resultId",
        idValue: "result-1",
        finalUrl: "https://example.com/",
        strategy: "mobile",
        createdAt: "2026-03-23T19:27:33.000Z",
        payloadJson: storedPayloadJson,
        mode,
        category,
      });

      const content = issuesExportSchema.parse(JSON.parse(exported.content));
      expect(exported.filename).toContain(filename);
      expect(content.resultId).toBe("result-1");
      expect(content.category).toBe(exportedCategory);
      expect(content.issues.map((entry) => entry.auditKey)).toEqual(auditKeys);
      expect(exported.content).not.toContain("timeToInteractive");
    },
  );
});
