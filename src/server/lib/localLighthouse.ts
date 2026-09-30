import { z } from "zod";
import {
  buildStoredLighthouseIssues,
  buildStoredLighthouseMetrics,
  scoreToPercent,
  storedLighthousePayloadSchema,
  type RawLighthouseAudit,
  type RawLighthouseCategory,
  type StoredLighthousePayload,
} from "@/server/lib/lighthouseStoredPayload";

const responseSchema = z.object({
  lighthouseResult: z.object({
    requestedUrl: z.string().optional(),
    finalUrl: z.string().optional(),
    lighthouseVersion: z.string().optional(),
    categories: z.record(z.string(), z.custom<RawLighthouseCategory>()),
    audits: z.record(z.string(), z.custom<RawLighthouseAudit>()),
  }),
});

/** The private self-hosted runner returns a compact Lighthouse report. */
export async function fetchLocalLighthouse(input: {
  url: string;
  strategy: "mobile" | "desktop";
  runnerUrl: string;
}): Promise<StoredLighthousePayload> {
  const response = await fetch(new URL("/run", input.runnerUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: input.url, strategy: input.strategy }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) {
    throw new Error(`Local Lighthouse runner failed (${response.status})`);
  }
  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("Local Lighthouse runner returned an invalid report");
  }

  const report = parsed.data.lighthouseResult;
  const issueReport = buildStoredLighthouseIssues(report);
  const payload: StoredLighthousePayload = {
    version: 2,
    source: "local-lighthouse",
    hasIssueDetails: issueReport.hasIssueDetails,
    metadata: {
      requestedUrl: report.requestedUrl ?? input.url,
      finalUrl: report.finalUrl ?? input.url,
      strategy: input.strategy,
      fetchedAt: new Date().toISOString(),
      lighthouseVersion: report.lighthouseVersion ?? null,
      taskId: null,
      cost: 0,
    },
    scores: {
      performance: scoreToPercent(report.categories.performance?.score),
      accessibility: scoreToPercent(report.categories.accessibility?.score),
      "best-practices": scoreToPercent(
        report.categories["best-practices"]?.score,
      ),
      seo: scoreToPercent(report.categories.seo?.score),
    },
    metrics: buildStoredLighthouseMetrics(report),
    issues: issueReport.issues,
  };
  if (Object.values(payload.scores).every((score) => score == null)) {
    throw new Error("Local Lighthouse runner returned no scores");
  }
  return storedLighthousePayloadSchema.parse(payload);
}
