import { z } from "zod";
import { ReportTemplateService } from "@/server/features/reports/services/ReportTemplateService";
import { captureServerEvent } from "@/server/lib/posthog";
import { DEFAULT_CLIENT_LABEL } from "@/server/mcp/client-label";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse, truncatePreview } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";
import { formatCount } from "@/shared/format";
import {
  REPORT_TEMPLATE_MAX_DESCRIPTION_CHARS,
  REPORT_TEMPLATE_MAX_INSTRUCTIONS_CHARS,
  REPORT_TEMPLATE_MAX_NAME_CHARS,
} from "@/types/schemas/report-templates";

// The two report-template tools. Both free (they touch only the app DB), both
// wrapped in withMcpProjectAuth, and both scoped to the authorized project — a
// template id from another project never resolves.

const templatesPath = (projectId: string) =>
  `/p/${projectId}/reports/templates`;

// ------------------------------------------------- list_report_templates

const listInputSchema = { projectId: projectIdSchema } as const;

const listOutputSchema = {
  templates: z.array(looseObjectOutputSchema),
  remaining: z.number(),
  ...optionalMetaOutputSchema,
} as const;

export const listReportTemplatesTool = {
  name: "list_report_templates",
  config: {
    title: "List report templates",
    description:
      "Lists this project's report templates. Uses no credits. A template is a reusable brief — audience, sections in order, tone, sign-off — that replaces a skill's default report format. Read one only when the user names it or asks for the kind of report it describes; a plain skill run uses the skill's own format. Pass the template's id to save_report as templateId. To reuse one in another project, list it there and save it here.",
    inputSchema: listInputSchema,
    outputSchema: listOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof listInputSchema>>, context) => {
      const { templates, remaining } =
        await ReportTemplateService.listReportTemplates(args.projectId);

      const blocks = templates.map((template) =>
        [
          `${template.id}  ${template.name}`,
          `  ${template.description}`,
          "",
          template.instructions,
        ].join("\n"),
      );

      return mcpResponse({
        text:
          templates.length > 0
            ? blocks.join("\n\n---\n\n")
            : "This project has no report templates. Reports use the running skill's own format.",
        meta: buildProjectMeta(
          context,
          args.projectId,
          templatesPath(args.projectId),
        ),
        structuredContent: {
          templates: templates.map((template) => ({
            id: template.id,
            name: template.name,
            description: template.description,
            instructionsPreview: truncatePreview(template.instructions),
            updatedAt: template.updatedAt,
          })),
          remaining,
        },
      });
    },
  ),
};

// ------------------------------------------------- save_report_template

const saveInputSchema = {
  projectId: projectIdSchema,
  templateId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Omit to create a new template. Pass an id from list_report_templates to replace that template's name, description and instructions in place.",
    ),
  name: z
    .string()
    .min(1)
    .describe(
      `What the user will ask for by name, e.g. "Client-ready audit summary". Max ${REPORT_TEMPLATE_MAX_NAME_CHARS} characters.`,
    ),
  description: z
    .string()
    .min(1)
    .describe(
      `One line saying when to use this template. Agents read this to decide whether it applies, so name the occasion, not the format. Max ${REPORT_TEMPLATE_MAX_DESCRIPTION_CHARS} characters.`,
    ),
  instructions: z
    .string()
    .min(1)
    .describe(
      `Markdown, max ${formatCount(REPORT_TEMPLATE_MAX_INSTRUCTIONS_CHARS)} characters: the audience, the sections in order, the tone, the sign-off, and optionally an accent color as "accent: #1C4ED8". This replaces the skill's default section list and tone — never the seo-report HTML constraints, which always apply.`,
    ),
} as const;

const saveOutputSchema = {
  templateId: z.string(),
  name: z.string(),
  created: z.boolean(),
  url: z.string(),
  ...optionalMetaOutputSchema,
} as const;

export const saveReportTemplateTool = {
  name: "save_report_template",
  config: {
    title: "Save report template",
    description:
      "Saves a reusable report brief to this project. Uses no credits. Only do this when the user asks for a template, or agrees to one — a one-off report needs no template. Call list_report_templates first and pass the matching templateId to edit an existing template rather than creating a near-duplicate; a name already used in this project is refused.",
    inputSchema: saveInputSchema,
    outputSchema: saveOutputSchema,
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      // A save with a templateId overwrites the stored brief.
      destructiveHint: true,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof saveInputSchema>>, context) => {
      const { templateId, name, created } =
        await ReportTemplateService.saveReportTemplate({
          projectId: args.projectId,
          templateId: args.templateId,
          name: args.name,
          description: args.description,
          instructions: args.instructions,
          createdBy: context.auth.clientLabel ?? DEFAULT_CLIENT_LABEL,
          createdByUserId: context.auth.userId,
        });

      const path = templatesPath(args.projectId);
      const url = buildDashboardUrl(context.baseUrl, path);

      await captureServerEvent({
        distinctId: context.auth.userId,
        event: "report_template:saved",
        organizationId: context.auth.organizationId,
        properties: {
          project_id: args.projectId,
          is_update: !created,
          source: "mcp",
        },
      });

      return mcpResponse({
        text: `${created ? "Saved" : "Updated"} report template "${name}" (id ${templateId}) in this project. Pass templateId: "${templateId}" to save_report when you write a report from it. Manage templates at ${url}.`,
        meta: buildProjectMeta(context, args.projectId, path),
        structuredContent: { templateId, name, created, url },
      });
    },
  ),
};
