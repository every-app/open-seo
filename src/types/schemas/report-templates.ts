// Shared vocabulary for report templates. The caps are enforced in
// ReportTemplateService with actionable copy; Zod at each boundary validates
// shape only.

/**
 * Small on purpose: the list is read by agents inside the project-context
 * digest, and a long menu of near-identical formats makes the choice worse.
 */
export const REPORT_TEMPLATE_MAX_PER_PROJECT = 10;
export const REPORT_TEMPLATE_MAX_NAME_CHARS = 80;
export const REPORT_TEMPLATE_MAX_DESCRIPTION_CHARS = 200;
/** A brief, not a document. Ten at the cap is the 30 KB list_report_templates worst case. */
export const REPORT_TEMPLATE_MAX_INSTRUCTIONS_CHARS = 3_000;

/** A stored template. A plain type, as ReportMetadata: rows come from the repository's own column selection. */
export type ReportTemplate = {
  id: string;
  projectId: string;
  name: string;
  description: string;
  instructions: string;
  createdBy: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};
