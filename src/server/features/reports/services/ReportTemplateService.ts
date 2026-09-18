import { ReportTemplateRepository } from "@/server/features/reports/repositories/ReportTemplateRepository";
import { AppError } from "@/server/lib/errors";
import { formatCount } from "@/shared/format";
import {
  REPORT_TEMPLATE_MAX_DESCRIPTION_CHARS,
  REPORT_TEMPLATE_MAX_INSTRUCTIONS_CHARS,
  REPORT_TEMPLATE_MAX_NAME_CHARS,
  REPORT_TEMPLATE_MAX_PER_PROJECT,
  type ReportTemplate,
} from "@/types/schemas/report-templates";

// Report templates: the named briefs agents follow when writing a report.
// Every caller (server function, MCP tool, SAM) comes through here, so the caps
// and the refusal copy exist once. Authorization is NOT done here — the caller
// has already authorized `projectId` and every query is scoped to it.

/** This project's templates, and the room left under the cap. */
async function listReportTemplates(projectId: string): Promise<{
  templates: ReportTemplate[];
  remaining: number;
}> {
  const templates = await ReportTemplateRepository.listTemplates(projectId);
  return {
    templates,
    remaining: Math.max(0, REPORT_TEMPLATE_MAX_PER_PROJECT - templates.length),
  };
}

async function getReportTemplate(
  projectId: string,
  templateId: string,
): Promise<ReportTemplate> {
  const template = await ReportTemplateRepository.getTemplate(
    projectId,
    templateId,
  );
  if (!template) throw notFound(templateId);
  return template;
}

function notFound(templateId: string) {
  return new AppError(
    "NOT_FOUND",
    `No report template ${templateId} in this project. Call list_report_templates to see what exists.`,
  );
}

type SaveParams = {
  projectId: string;
  templateId?: string;
  name: string;
  description: string;
  instructions: string;
  /** Client label, stamped by the server. Never taken from the model. */
  createdBy: string;
  /** From the authenticated context, and nowhere else. */
  createdByUserId: string;
};

/**
 * Create-or-update in one call. Everything is validated before anything is
 * written, so a rejected save leaves the stored template untouched.
 */
export async function saveReportTemplate(params: SaveParams): Promise<{
  templateId: string;
  name: string;
  created: boolean;
}> {
  const name = params.name.trim();
  const description = params.description.trim();
  const instructions = params.instructions.trim();

  if (name.length === 0) {
    throw new AppError("VALIDATION_ERROR", "Give the template a name.");
  }
  if (name.length > REPORT_TEMPLATE_MAX_NAME_CHARS) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Name is ${formatCount(name.length)} characters; the limit is ${formatCount(REPORT_TEMPLATE_MAX_NAME_CHARS)}. Shorten it and save again.`,
    );
  }
  if (description.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Add a one-line description saying when to use this template. It is what an agent reads to decide.",
    );
  }
  if (description.length > REPORT_TEMPLATE_MAX_DESCRIPTION_CHARS) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Description is ${formatCount(description.length)} characters; the limit is ${formatCount(REPORT_TEMPLATE_MAX_DESCRIPTION_CHARS)}. It is one line saying when to use the template — move the detail into the instructions.`,
    );
  }
  if (instructions.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Add instructions: the audience, the sections in order, the tone, and the sign-off.",
    );
  }
  if (instructions.length > REPORT_TEMPLATE_MAX_INSTRUCTIONS_CHARS) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Instructions are ${formatCount(instructions.length)} characters; the limit is ${formatCount(REPORT_TEMPLATE_MAX_INSTRUCTIONS_CHARS)}. A template is a brief, not the report — say the audience, the sections in order, the tone and the sign-off, and cut the rest.`,
    );
  }

  // One read serves the existence check, the duplicate-name check and the cap.
  const templates = await ReportTemplateRepository.listTemplates(
    params.projectId,
  );
  const existing = params.templateId
    ? templates.find((template) => template.id === params.templateId)
    : undefined;
  if (params.templateId && !existing) {
    throw new AppError(
      "NOT_FOUND",
      `No report template ${params.templateId} in this project. Call list_report_templates, or omit templateId to create a new one.`,
    );
  }

  // A name that appears twice in a project makes "use the monthly check-in
  // template" ambiguous, so a rename clears the same bar as a create.
  const lowerName = name.toLowerCase();
  const clash = templates.find(
    (template) =>
      template.name.toLowerCase() === lowerName && template.id !== existing?.id,
  );
  if (clash) {
    throw new AppError(
      "VALIDATION_ERROR",
      `A template named "${clash.name}" exists in this project (id ${clash.id}). Pass its templateId to update it, or choose another name.`,
    );
  }

  if (existing) {
    await ReportTemplateRepository.updateTemplate({
      templateId: existing.id,
      projectId: params.projectId,
      name,
      description,
      instructions,
    });
    return { templateId: existing.id, name, created: false };
  }

  // Plain read-then-write: concurrent saves can both pass at the cap, which is
  // accepted — this is a guardrail, not an invariant, and the next save refuses.
  if (templates.length >= REPORT_TEMPLATE_MAX_PER_PROJECT) {
    throw new AppError(
      "VALIDATION_ERROR",
      `This project has ${formatCount(REPORT_TEMPLATE_MAX_PER_PROJECT)} report templates, the limit. Delete one from the Templates page.`,
    );
  }

  const id = crypto.randomUUID();
  await ReportTemplateRepository.insertTemplate({
    id,
    projectId: params.projectId,
    name,
    description,
    instructions,
    createdBy: params.createdBy,
    createdByUserId: params.createdByUserId,
  });
  return { templateId: id, name, created: true };
}

export async function deleteReportTemplate(
  projectId: string,
  templateId: string,
): Promise<void> {
  const deleted = await ReportTemplateRepository.deleteTemplate(
    projectId,
    templateId,
  );
  if (!deleted) throw notFound(templateId);
}

export const ReportTemplateService = {
  listReportTemplates,
  getReportTemplate,
  saveReportTemplate,
  deleteReportTemplate,
} as const;
