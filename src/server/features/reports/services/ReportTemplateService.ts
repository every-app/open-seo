import { ReportTemplateRepository } from "@/server/features/reports/repositories/ReportTemplateRepository";
import { AppError } from "@/server/lib/errors";
import { formatCount } from "@/shared/format";
import {
  contrastRatio,
  hexColorSchema,
  logoDataUriSchema,
  REPORT_INK_MUTED,
  REPORT_MIN_TEXT_CONTRAST,
  REPORT_SURFACE,
  type ReportBrand,
} from "@/shared/report-brand";
import {
  REPORT_TEMPLATE_MAX_DESCRIPTION_CHARS,
  REPORT_TEMPLATE_MAX_INSTRUCTIONS_CHARS,
  REPORT_TEMPLATE_MAX_LOGO_CHARS,
  REPORT_TEMPLATE_MAX_NAME_CHARS,
  REPORT_TEMPLATE_MAX_PER_PROJECT,
  type ReportTemplate,
  type ReportTemplateWithLogo,
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
): Promise<ReportTemplateWithLogo> {
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
  /**
   * Brand kit changes. An undefined field keeps the stored value (none on
   * create) and null clears it, so an edit that leaves the logo alone never
   * has to send it back.
   */
  brand?: Partial<ReportBrand>;
  /** Client label, stamped by the server. Never taken from the model. */
  createdBy: string;
  /** From the authenticated context, and nowhere else. */
  createdByUserId: string;
};

/**
 * Create-or-update in one call. Everything is validated before anything is
 * written, so a rejected save leaves the stored template untouched.
 */
async function saveReportTemplate(params: SaveParams): Promise<{
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

  const brand = params.brand ?? {};
  validateLogo(brand.logoDataUri);

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

  // Colors are checked as they will render together, so an edit that changes
  // only the canvas is still held to the stored accent.
  validateColors({
    brandColor: pick(brand.brandColor, existing?.brandColor),
    brandColor2: pick(brand.brandColor2, existing?.brandColor2),
    accentColor: pick(brand.accentColor, existing?.accentColor),
    canvasColor: pick(brand.canvasColor, existing?.canvasColor),
  });

  if (existing) {
    await ReportTemplateRepository.updateTemplate({
      templateId: existing.id,
      projectId: params.projectId,
      name,
      description,
      instructions,
      brand,
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
    brand: {
      brandColor: brand.brandColor ?? null,
      brandColor2: brand.brandColor2 ?? null,
      accentColor: brand.accentColor ?? null,
      canvasColor: brand.canvasColor ?? null,
      logoDataUri: brand.logoDataUri ?? null,
    },
    createdBy: params.createdBy,
    createdByUserId: params.createdByUserId,
  });
  return { templateId: id, name, created: true };
}

/** The value a save will leave stored: the change if one was sent, else what is there. */
const pick = (
  change: string | null | undefined,
  stored: string | null | undefined,
): string | null => (change === undefined ? (stored ?? null) : change);

const ratio = (a: string, b: string) => contrastRatio(a, b).toFixed(1);

function validateColors(colors: Omit<ReportBrand, "logoDataUri">): void {
  for (const [label, value] of [
    ["Brand color", colors.brandColor],
    ["Gradient end color", colors.brandColor2],
    ["Accent color", colors.accentColor],
    ["Canvas color", colors.canvasColor],
  ] as const) {
    if (value !== null && !hexColorSchema.safeParse(value).success) {
      throw new AppError(
        "VALIDATION_ERROR",
        `${label} "${value}" is not a six-digit hex color. Use a value such as #1c4ed8.`,
      );
    }
  }
  if (colors.brandColor2 && !colors.brandColor) {
    throw new AppError(
      "VALIDATION_ERROR",
      "A gradient end color needs a brand color to start from. Set the brand color too, or clear the gradient end.",
    );
  }

  const canvas = colors.canvasColor ?? REPORT_SURFACE;
  // The muted text token is the lightest text a report prints straight on the
  // canvas, so it sets the bar for how dark a canvas may get.
  if (contrastRatio(REPORT_INK_MUTED, canvas) < REPORT_MIN_TEXT_CONTRAST) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Canvas ${canvas} leaves secondary text at ${ratio(REPORT_INK_MUTED, canvas)}:1; text needs ${REPORT_MIN_TEXT_CONTRAST}:1. Reports are light documents, so pick a lighter canvas.`,
    );
  }
  // Accent text sits on both the canvas and the white cards, so it has to
  // read on the weaker of the two.
  const accent = colors.accentColor;
  if (accent) {
    const weakest = Math.min(
      contrastRatio(accent, canvas),
      contrastRatio(accent, REPORT_SURFACE),
    );
    if (weakest < REPORT_MIN_TEXT_CONTRAST) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Accent ${accent} is ${weakest.toFixed(1)}:1 against the report background; text needs ${REPORT_MIN_TEXT_CONTRAST}:1. Use a darker shade of it for the accent and keep the bright one as the brand color.`,
      );
    }
  }
}

function validateLogo(logo: string | null | undefined): void {
  if (logo == null) return;
  if (logo.length > REPORT_TEMPLATE_MAX_LOGO_CHARS) {
    throw new AppError(
      "VALIDATION_ERROR",
      `The logo is ${formatCount(logo.length)} characters as a data URI; the limit is ${formatCount(REPORT_TEMPLATE_MAX_LOGO_CHARS)}. Export a smaller wordmark, about 320 pixels wide, or use SVG.`,
    );
  }
  if (!logoDataUriSchema.safeParse(logo).success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "The logo must be a PNG, WebP, JPEG or SVG image as a base64 data: URI (data:image/png;base64,...). Reports load no image by URL.",
    );
  }
}

async function deleteReportTemplate(
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
