import { AppError } from "@/server/lib/errors";
import {
  createOnPageConnectSession,
  pollOnPageConnectSession,
  createContentScan,
  getContentScanJob,
  getContentScanReport,
  isOnPageConfigured,
  OnPageApiError,
  onPageReportSchema,
  verifyOnPageConnection,
  type OnPageReport,
} from "@/server/lib/onpage/client";
import type { ContentScanRegion } from "@/shared/content-optimization";
import { ContentScanRepository } from "../repositories/ContentScanRepository";
import { OnPageConnectionRepository } from "../repositories/OnPageConnectionRepository";

/**
 * Content optimization scans via the operator's On-Page.ai account. Scan jobs
 * run on the provider side; every started scan gets a history row so reports
 * survive navigation, and completed reports are stored so reopening one costs
 * nothing. Shared by the server functions and the MCP tools so both stay in
 * lockstep.
 */

type ContentScanView =
  | { status: "completed"; report: OnPageReport; pageCategory: string | null }
  | {
      status: "queued" | "waiting" | "running" | "processing";
      progress: number | null;
    }
  | {
      status: "failed" | "cancelled";
      error: { code: string | null; message: string | null } | null;
    };

function toAppError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if (error instanceof OnPageApiError) {
    if (error.status === 401) {
      throw new AppError("AUTH_CONFIG_MISSING", error.message);
    }
    if (error.status === 402) {
      throw new AppError("INSUFFICIENT_CREDITS", error.message);
    }
    if (error.status === 429) {
      throw new AppError("RATE_LIMITED", error.message);
    }
    throw new AppError("UPSTREAM_UNAVAILABLE", error.message);
  }
  throw error;
}

function parseStoredReport(raw: string): OnPageReport | null {
  try {
    const parsed = onPageReportSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const ContentOptimizationService = {
  async connectionStatus(): Promise<{
    enabled: boolean;
    configured: boolean;
    ok: boolean;
    message?: string;
  }> {
    const { enabled } = await OnPageConnectionRepository.getState();
    if (!(await isOnPageConfigured())) {
      return { enabled, configured: false, ok: false };
    }
    const verified = await verifyOnPageConnection();
    return {
      enabled,
      configured: true,
      ok: verified.ok,
      message: verified.message,
    };
  },

  /**
   * Deployment-wide feature switch. Disabled hides the sidebar item and the
   * page, and the MCP tools answer with a clear disabled message, so an
   * operator who doesn't want the module never sees it again.
   */
  async isModuleEnabled(): Promise<boolean> {
    return (await OnPageConnectionRepository.getState()).enabled;
  },

  async setModuleEnabled(enabled: boolean): Promise<{ enabled: boolean }> {
    await OnPageConnectionRepository.setEnabled(enabled);
    return { enabled };
  },

  async startConnect() {
    try {
      const session = await createOnPageConnectSession();
      return {
        code: session.code,
        pollSecret: session.poll_secret,
        activateUrl: session.activate_url,
        pollIntervalS: session.poll_interval_s,
        expiresInS: session.expires_in_s,
      };
    } catch (error) {
      toAppError(error);
    }
  },

  async pollConnect(input: { code: string; pollSecret: string }) {
    try {
      const result = await pollOnPageConnectSession(input);
      if (result.status === "approved" && result.apiKey) {
        await OnPageConnectionRepository.saveApiKey(result.apiKey);
        return { status: "connected" as const };
      }
      return { status: result.status };
    } catch (error) {
      toAppError(error);
    }
  },

  async startScan(input: {
    projectId: string;
    url: string;
    keyword: string;
    region?: ContentScanRegion;
  }): Promise<{ jobId: string }> {
    try {
      const { jobId } = await createContentScan({
        url: input.url,
        keyword: input.keyword,
        region: input.region,
      });
      await ContentScanRepository.insertPending({
        projectId: input.projectId,
        jobId,
        url: input.url,
        keyword: input.keyword,
        region: input.region ?? "US",
      });
      return { jobId };
    } catch (error) {
      toAppError(error);
    }
  },

  async listHistory(projectId: string) {
    return ContentScanRepository.listForProject(projectId);
  },

  async deleteScan(projectId: string, jobId: string): Promise<void> {
    await ContentScanRepository.deleteForProject(projectId, jobId);
  },

  /**
   * One call the client can poll: stored report first (free), then provider
   * job status, fetching and persisting the report the moment the job
   * completes.
   */
  async getView(projectId: string, jobId: string): Promise<ContentScanView> {
    const stored = await ContentScanRepository.getForProjectByJobId(
      projectId,
      jobId,
    );
    if (stored?.report) {
      const report = parseStoredReport(stored.report);
      if (report) {
        return {
          status: "completed",
          report,
          pageCategory: pageCategoryOf(report, stored.pageCategory),
        };
      }
    }

    try {
      const job = await getContentScanJob(jobId);
      if (job.status === "failed" || job.status === "cancelled") {
        return {
          status: job.status,
          error: job.error
            ? {
                code: job.error.code ?? null,
                message: job.error.message ?? null,
              }
            : null,
        };
      }
      if (job.status !== "completed") {
        return { status: job.status, progress: job.progress ?? null };
      }

      const report = await getContentScanReport(jobId);
      if (stored) {
        await ContentScanRepository.saveReport({
          jobId,
          score: report.on_page_optimization.score,
          grade: report.on_page_optimization.grade,
          report: JSON.stringify(report),
        });
      }
      return {
        status: "completed",
        report,
        pageCategory: pageCategoryOf(report, stored?.pageCategory ?? null),
      };
    } catch (error) {
      toAppError(error);
    }
  },
};

/**
 * The scan report carries the page's own category since the API exposed
 * `topic_and_classification.your_page`; the stored column covers reports
 * saved before that (which came from a separate classify job).
 */
function pageCategoryOf(
  report: OnPageReport,
  storedCategory: string | null,
): string | null {
  return report.topic_and_classification.your_page?.category ?? storedCategory;
}
