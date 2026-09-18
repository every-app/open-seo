import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ReportTemplateService } from "@/server/features/reports/services/ReportTemplateService";
import { AppError } from "@/server/lib/errors";
import { requireProjectContext } from "@/serverFunctions/middleware";

// Report templates for the app. The `projectId` field in each validator is what
// triggers project authorization (ADR 0001); the service never authorizes.

const projectScopeSchema = z.object({ projectId: z.string().min(1) });

// Shape only; the service owns the caps and the refusal copy.
const saveSchema = z.object({
  projectId: z.string().min(1),
  templateId: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().min(1),
  instructions: z.string().min(1),
});

const templateRefSchema = z.object({
  projectId: z.string().min(1),
  templateId: z.string().min(1),
});

export const listReportTemplates = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopeSchema)
  .handler(async ({ context }) =>
    ReportTemplateService.listReportTemplates(context.projectId),
  );

export const saveReportTemplate = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(saveSchema)
  .handler(async ({ data, context }) => {
    try {
      const { templateId, created } =
        await ReportTemplateService.saveReportTemplate({
          projectId: context.projectId,
          templateId: data.templateId,
          name: data.name,
          description: data.description,
          instructions: data.instructions,
          // The client label for a template made in the app, not through MCP.
          createdBy: "OpenSEO app",
          createdByUserId: context.userId,
        });
      return { ok: true as const, templateId, created };
    } catch (error) {
      // A refusal (duplicate name, the cap) is the answer the form shows, and
      // thrown errors reach the client stripped to their code.
      if (error instanceof AppError && error.code === "VALIDATION_ERROR") {
        return { ok: false as const, message: error.message };
      }
      throw error;
    }
  });

export const deleteReportTemplate = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(templateRefSchema)
  .handler(async ({ data, context }) => {
    await ReportTemplateService.deleteReportTemplate(
      context.projectId,
      data.templateId,
    );
    return { templateId: data.templateId };
  });
