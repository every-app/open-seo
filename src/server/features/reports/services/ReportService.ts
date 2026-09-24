import { brand } from "@/shared/brand";
import { ReportRepository } from "@/server/features/reports/repositories/ReportRepository";
import { sharesEnabled } from "@/server/features/reports/shareAccess";
import { AppError } from "@/server/lib/errors";
import { captureServerEvent } from "@/server/lib/posthog";
import { formatCount } from "@/shared/format";
import { mintShareToken } from "@/shared/report-share";
import {
  REPORT_MAX_BYTES_PER_ORG,
  REPORT_MAX_HTML_BYTES,
  REPORT_MAX_PER_PROJECT,
  REPORT_MAX_SUMMARY_CHARS,
  REPORT_MAX_TITLE_CHARS,
  type ReportMetadata,
} from "@/types/schemas/reports";

// Reports: the HTML documents agents write for a project. Every caller (server
// function, MCP tool, SAM) comes through here, so the caps and the refusal copy
// exist once. Authorization is NOT done here — the caller has already
// authorized `projectId` (ensureUserMiddleware for server functions,
// withMcpProjectAuth for MCP tools) and every query is scoped to it.

// The over-size refusal prints the actual size and the limit side by side, so
// they must never round to the same number: 499,900 bytes reading "500 KB; the
// limit is 500 KB" tells the agent to shrink by nothing. Round the actual size
// up and the limit down.
const kbUp = (bytes: number) => `${formatCount(Math.ceil(bytes / 1000))} KB`;
const kbDown = (bytes: number) => `${formatCount(Math.floor(bytes / 1000))} KB`;
const mb = (bytes: number) =>
  `${formatCount(Math.round(bytes / 1_000_000))} MB`;

const htmlBytes = (html: string) => new TextEncoder().encode(html).length;

type SaveReportParams = {
  projectId: string;
  /** The project's organization, for the workspace-wide storage ceiling. */
  organizationId: string;
  reportId?: string;
  title: string;
  summary: string;
  html: string;
  skill?: string;
  /** Validated against the project by the caller, not here. */
  templateId?: string;
  /** Client label, stamped by the server. Never taken from the model. */
  createdBy: string;
  /** From the authenticated context, and nowhere else. */
  createdByUserId: string;
};

/**
 * Create-or-update in one call. Everything is validated before anything is
 * written, so a rejected save leaves the stored report untouched — there is no
 * version history, and a half-written overwrite is unrecoverable.
 */
export async function saveReport(params: SaveReportParams): Promise<{
  reportId: string;
  title: string;
  created: boolean;
  htmlBytes: number;
}> {
  const { projectId, title, summary, html } = params;

  if (title.length > REPORT_MAX_TITLE_CHARS) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Title is ${formatCount(title.length)} characters; the limit is ${formatCount(REPORT_MAX_TITLE_CHARS)}. Shorten it and save again.`,
    );
  }
  if (summary.length > REPORT_MAX_SUMMARY_CHARS) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Summary is ${formatCount(summary.length)} characters; the limit is ${formatCount(REPORT_MAX_SUMMARY_CHARS)}. Shorten it and save again.`,
    );
  }
  // UTF-8 bytes, not code units: a `.length` check understates multi-byte
  // content and is what actually reaches the column and the worker's heap.
  const sizeBytes = htmlBytes(html);
  if (sizeBytes > REPORT_MAX_HTML_BYTES) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Report is ${kbUp(sizeBytes)}; the limit is ${kbDown(REPORT_MAX_HTML_BYTES)}. Inlined images are the usual cause. Remove them and save again.`,
    );
  }
  // The cheap structural check, not an HTML parser: models have stopped
  // mid-document with no error, and update-in-place would silently destroy the
  // previous good report.
  const trimmed = html.trim().toLowerCase();
  if (!trimmed.includes("<html") || !trimmed.endsWith("</html>")) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The HTML has no closing </html>; the model stopped early. On Codex, escape backticks and ${.",
    );
  }

  const existing = params.reportId
    ? await ReportRepository.getReport(projectId, params.reportId)
    : null;
  if (params.reportId && !existing) {
    throw new AppError(
      "NOT_FOUND",
      `No report ${params.reportId} in this project. Call list_reports, or omit reportId to create a new one.`,
    );
  }

  // Titles are unique within a project, which the skills state as a contract
  // and which keeps the duplicate pointer below unambiguous. A rename has to
  // clear the same bar as a create.
  const clash = await ReportRepository.findReportByTitle(projectId, title);
  if (clash && clash.id !== existing?.id) {
    throw new AppError(
      "VALIDATION_ERROR",
      // A same-title save without a reportId is almost always an agent that
      // forgot to list first; point it at the id it should have reused.
      `A report titled '${clash.title}' exists (id ${clash.id}). Pass reportId to update it, or change the title.`,
    );
  }

  if (!existing) {
    // Plain read-then-write: concurrent saves can both pass at 99, so a project
    // may briefly hold a few more than the cap. That is accepted — this is a
    // storage guardrail, not an invariant, and the next save refuses.
    const total = await ReportRepository.countReports(projectId);
    if (total >= REPORT_MAX_PER_PROJECT) {
      throw new AppError(
        "VALIDATION_ERROR",
        `This project has ${formatCount(REPORT_MAX_PER_PROJECT)} reports, the limit. Delete one from the Reports page.`,
      );
    }
  }

  // The workspace-wide ceiling, checked on updates as well as creates: projects
  // are unlimited, so the per-project cap on its own bounds nothing, and an
  // update that grows a report is the other way to add bytes.
  const orgBytes = await ReportRepository.sumReportBytesForOrganization(
    params.organizationId,
  );
  if (
    orgBytes - (existing?.sizeBytes ?? 0) + sizeBytes >
    REPORT_MAX_BYTES_PER_ORG
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `This organization is storing ${mb(orgBytes)} of reports, the limit. Delete reports you no longer need from the Reports page.`,
    );
  }

  if (existing) {
    await ReportRepository.updateReportContent({
      reportId: existing.id,
      projectId,
      title,
      summary,
      html,
      // An update that omits the slug keeps the stored one: `skill` is
      // optional on save_report, and clearing it would drop the report out of
      // the list's Type column for no reason the caller asked for.
      skill: params.skill ?? existing.skill,
      // Same rule for the template the report was written from.
      templateId: params.templateId ?? existing.templateId,
      sizeBytes,
    });
    return {
      reportId: existing.id,
      title,
      created: false,
      htmlBytes: sizeBytes,
    };
  }

  const id = crypto.randomUUID();
  await ReportRepository.insertReport({
    id,
    projectId,
    title,
    summary,
    html,
    skill: params.skill ?? null,
    templateId: params.templateId ?? null,
    createdBy: params.createdBy,
    createdByUserId: params.createdByUserId,
    sizeBytes,
  });
  return { reportId: id, title, created: true, htmlBytes: sizeBytes };
}

/** Metadata only, newest update first. `remaining` is the room left under the cap. */
async function listReports(params: {
  projectId: string;
  limit: number;
  offset: number;
}): Promise<{
  reports: ReportMetadata[];
  totalCount: number;
  remaining: number;
}> {
  const [rows, totalCount] = await Promise.all([
    ReportRepository.listReports(params),
    ReportRepository.countReports(params.projectId),
  ]);
  return {
    reports: rows,
    totalCount,
    remaining: Math.max(0, REPORT_MAX_PER_PROJECT - totalCount),
  };
}

export async function getReport(
  projectId: string,
  reportId: string,
): Promise<ReportMetadata> {
  const report = await ReportRepository.getReport(projectId, reportId);
  if (!report) throw notFound(reportId);
  return report;
}

/** The only reader of the `html` column, and it reads the metadata with it. */
async function getReportWithHtml(
  projectId: string,
  reportId: string,
): Promise<{ report: ReportMetadata; html: string }> {
  const row = await ReportRepository.getReportWithHtml(projectId, reportId);
  if (!row) throw notFound(reportId);
  const { html, ...report } = row;
  return { report, html };
}

export async function deleteReport(
  projectId: string,
  reportId: string,
): Promise<void> {
  const deleted = await ReportRepository.deleteReport(projectId, reportId);
  if (!deleted) throw notFound(reportId);
}

type ShareParams = {
  projectId: string;
  reportId: string;
  /** From the authenticated context — the telemetry identity, nothing else. */
  userId: string;
  organizationId: string;
};

/**
 * Mints the public link, or returns the existing one. Idempotent on purpose:
 * the modal's toggle can be flipped twice by a double click or a retried
 * mutation, and a second mint would silently break the link the user just
 * copied.
 */
async function shareReport(params: ShareParams): Promise<ReportMetadata> {
  // Refused here rather than only hidden in the UI: the server is the trust
  // boundary. A token minted on a self-hosted deployment is a link that
  // silently does nothing, and the user would have copied it believing otherwise.
  if (!(await sharesEnabled())) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Sharing is only available on hosted ${brand.name}.`,
    );
  }

  const report = await getReport(params.projectId, params.reportId);
  if (report.shareToken) return report;

  const shareToken = mintShareToken();
  const sharedAt = new Date().toISOString();
  await ReportRepository.setShareToken(params.projectId, params.reportId, {
    shareToken,
    sharedAt,
  });
  await captureServerEvent({
    distinctId: params.userId,
    event: "report:shared",
    organizationId: params.organizationId,
    properties: {
      project_id: params.projectId,
      report_id: params.reportId,
      skill: report.skill,
      source: "app",
    },
  });
  return { ...report, shareToken, sharedAt };
}

/** Revokes the link by nulling the token. A second call is a no-op. */
async function unshareReport(params: ShareParams): Promise<ReportMetadata> {
  const report = await getReport(params.projectId, params.reportId);
  if (!report.shareToken) return report;

  await ReportRepository.setShareToken(params.projectId, params.reportId, null);
  await captureServerEvent({
    distinctId: params.userId,
    event: "report:unshared",
    organizationId: params.organizationId,
    properties: {
      project_id: params.projectId,
      report_id: params.reportId,
      skill: report.skill,
      source: "app",
    },
  });
  return { ...report, shareToken: null, sharedAt: null };
}

// Shared by the reads and the delete, where `reportId` is a required argument —
// so no "omit reportId" hint here; that one belongs to save_report, which has
// its own message above.
function notFound(reportId: string) {
  return new AppError(
    "NOT_FOUND",
    `No report ${reportId} in this project. Call list_reports to see what exists.`,
  );
}

export const ReportService = {
  saveReport,
  listReports,
  getReport,
  getReportWithHtml,
  deleteReport,
  shareReport,
  unshareReport,
} as const;
