import type { APIRequestContext } from "@playwright/test";
import { check } from "./checks";
import {
  callTool,
  describeResult,
  structured,
  type McpCallResult,
  type ToolCall,
} from "./mcp";
import {
  reportSchema,
  reportsSchema,
  savedKeywordsSchema,
  templatesSchema,
} from "./schemas";
import { INTRUDER, reportHtml, type SeededData, type Tenant } from "./tenants";

/**
 * The read/change/delete/export surface, all pointed at B's project. The
 * project gate answers a project outside the bound organization with
 * NOT_FOUND (ProjectService.getProjectForOrganization treats it as
 * nonexistent), so the error text is not asserted: isError plus the leak scan
 * is the invariant.
 */
export function foreignProjectCalls(b: Tenant, seeded: SeededData): ToolCall[] {
  const projectId = b.projectId;
  return [
    { name: "get_project_context", arguments: { projectId } },
    {
      name: "update_project_context",
      arguments: {
        projectId,
        updates: [{ section: "current_goal", content: INTRUDER }],
      },
    },
    { name: "list_saved_keywords", arguments: { projectId } },
    { name: "save_keywords", arguments: { projectId, keywords: [INTRUDER] } },
    {
      name: "remove_saved_keywords",
      arguments: { projectId, savedKeywordIds: seeded.keywordIds },
    },
    { name: "list_reports", arguments: { projectId } },
    { name: "get_report", arguments: { projectId, reportId: seeded.reportId } },
    {
      name: "save_report",
      arguments: {
        projectId,
        title: INTRUDER,
        summary: INTRUDER,
        html: reportHtml(INTRUDER, INTRUDER),
      },
    },
    {
      name: "set_report_sharing",
      arguments: { projectId, reportId: seeded.reportId, public: true },
    },
    {
      name: "delete_report",
      arguments: { projectId, reportId: seeded.reportId },
    },
    { name: "list_report_templates", arguments: { projectId } },
    {
      name: "save_report_template",
      arguments: {
        projectId,
        name: INTRUDER,
        description: INTRUDER,
        instructions: INTRUDER,
      },
    },
    {
      name: "delete_report_template",
      arguments: { projectId, templateId: seeded.templateId },
    },
    { name: "export_ai_visibility_data", arguments: { projectId } },
    { name: "get_audit_status", arguments: { projectId } },
  ];
}

/**
 * A's own project with B's resource ids: every lookup must stay inside A's
 * project. remove_saved_keywords is not here because it ignores foreign ids by
 * contract (no error); the spec asserts "deleted nothing" for it separately.
 */
export function foreignResourceCalls(
  a: Tenant,
  seeded: SeededData,
): ToolCall[] {
  const projectId = a.projectId;
  const { reportId, templateId } = seeded;
  return [
    { name: "get_report", arguments: { projectId, reportId } },
    {
      name: "set_report_sharing",
      arguments: { projectId, reportId, public: true },
    },
    { name: "delete_report", arguments: { projectId, reportId } },
    {
      name: "save_report",
      arguments: {
        projectId,
        reportId,
        title: INTRUDER,
        summary: INTRUDER,
        html: reportHtml(INTRUDER, INTRUDER),
      },
    },
    { name: "delete_report_template", arguments: { projectId, templateId } },
    {
      name: "save_report_template",
      arguments: {
        projectId,
        templateId,
        name: INTRUDER,
        description: INTRUDER,
        instructions: INTRUDER,
      },
    },
    { name: "get_audit_status", arguments: { projectId, auditId: reportId } },
  ];
}

/**
 * B's identifiers that appear in a response although the caller never sent
 * them. An echo of a caller-supplied id (NOT_FOUND messages repeat the id they
 * were given) tells the caller nothing it did not already know, so supplied
 * values are excluded.
 */
export function leaked(
  result: McpCallResult,
  call: ToolCall,
  seeded: SeededData,
) {
  const supplied = JSON.stringify(call.arguments ?? {}).toLowerCase();
  const body = result.body.toLowerCase();
  return seeded.secrets.filter(
    (secret) =>
      !supplied.includes(secret.toLowerCase()) &&
      body.includes(secret.toLowerCase()),
  );
}

/** As B, after A's attempts: the seeded data is intact and nothing was added. */
export async function checkTenantBUnchanged(
  anon: APIRequestContext,
  b: Tenant,
  seeded: SeededData,
  chapter: string,
) {
  const projectId = b.projectId;
  const credential = b.oauth.label;
  const read = (call: ToolCall) => callTool(anon, b.oauth, call);

  const context = await read({
    name: "get_project_context",
    arguments: { projectId },
  });
  check({
    chapter,
    credential,
    tool: "get_project_context",
    expectation: "marker intact, no intruder text",
    ok:
      context.isError === false &&
      context.text.includes(seeded.marker) &&
      !context.text.includes(INTRUDER),
    detail: describeResult(context),
  });

  const keywords = structured(
    await read({ name: "list_saved_keywords", arguments: { projectId } }),
    savedKeywordsSchema,
    "B lists saved keywords",
  );
  check({
    chapter,
    credential,
    tool: "list_saved_keywords",
    expectation: "seeded keyword kept, no intruder keyword",
    ok:
      seeded.keywordIds.every((id) =>
        keywords.rows.some((row) => row.id === id),
      ) && keywords.rows.every((row) => row.keyword !== INTRUDER),
    detail: keywords.rows.map((row) => row.keyword).join(","),
  });

  const reports = structured(
    await read({ name: "list_reports", arguments: { projectId } }),
    reportsSchema,
    "B lists reports",
  );
  check({
    chapter,
    credential,
    tool: "list_reports",
    expectation: "only the seeded report exists",
    ok:
      reports.reports.length === 1 && reports.reports[0].id === seeded.reportId,
    detail: reports.reports.map((report) => report.id).join(","),
  });

  const report = structured(
    await read({
      name: "get_report",
      arguments: { projectId, reportId: seeded.reportId },
    }),
    reportSchema,
    "B reads its report",
  );
  check({
    chapter,
    credential,
    tool: "get_report",
    expectation: "report still private",
    ok: report.report.shareUrl === null,
    detail: `shareUrl=${String(report.report.shareUrl)}`,
  });

  const templates = structured(
    await read({ name: "list_report_templates", arguments: { projectId } }),
    templatesSchema,
    "B lists templates",
  );
  check({
    chapter,
    credential,
    tool: "list_report_templates",
    expectation: "only the seeded template exists",
    ok:
      templates.templates.length === 1 &&
      templates.templates[0].id === seeded.templateId,
    detail: templates.templates.map((template) => template.id).join(","),
  });
}
