import { ProjectService } from "@/server/features/projects/services/ProjectService";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  requireMcpToolAuthContext,
  type ToolExtra,
} from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { buildDashboardUrl } from "@/server/mcp/urls";
import { languageCodeSchema, locationCodeSchema } from "@/server/mcp/schemas";
import { createProjectSchema } from "@/types/schemas/projects";
import { z } from "zod";

const inputSchema = {
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe("Project name (1-120 characters)."),
  domain: z
    .string()
    .trim()
    .max(255)
    .optional()
    .describe(
      'Optional root domain for the project, e.g. "example.com" (host only, no scheme or path). Sets the default target for domain, backlink, and rank tools.',
    ),
  locationCode: locationCodeSchema
    .optional()
    .describe(
      "Optional DataForSEO location code for the project's default market (e.g. 2840 = United States, 2504 = Morocco). Falls back to the organization default when omitted.",
    ),
  languageCode: languageCodeSchema
    .optional()
    .describe(
      'Optional language code (e.g. "en", "fr"). Requires locationCode; derived from the location when omitted.',
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const createProjectTool = {
  name: "create_project",
  config: {
    title: "Create project",
    description:
      "Create a new project in the user's organization. Uses no credits — does not call DataForSEO. Provide a name, and optionally a domain and default market (locationCode/languageCode; a languageCode requires a locationCode). Returns the created {id, name, domain, locationCode, languageCode, url}; pass the returned `id` as `projectId` to other OpenSEO tools. Call list_projects first to avoid creating a duplicate.",
    inputSchema,
    outputSchema: {
      project: z
        .object({
          id: z.string(),
          name: z.string(),
          domain: z.string().nullable().optional(),
          locationCode: z.number(),
          languageCode: z.string(),
          url: z.string(),
        })
        .passthrough(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: async (args: Args, extra: ToolExtra) => {
    const { baseUrl, ...auth } = requireMcpToolAuthContext(extra);
    // Reuse the app's create schema so the market pair rule (a languageCode
    // requires a locationCode) is enforced identically to the dashboard, and
    // the domain is normalized the same way.
    const input = createProjectSchema.parse(args);
    const project = await ProjectService.createProject(
      auth.organizationId,
      input,
    );
    return mcpResponse({
      text: `Created project ${project.id}  ${project.name}${
        project.domain ? ` (${project.domain})` : ""
      }  market:${project.locationCode}/${project.languageCode}`,
      meta: {
        organizationId: auth.organizationId,
        url: buildDashboardUrl(baseUrl, `/p/${project.id}`),
      },
      structuredContent: {
        project: {
          id: project.id,
          name: project.name,
          domain: project.domain,
          locationCode: project.locationCode,
          languageCode: project.languageCode,
          url: buildDashboardUrl(baseUrl, `/p/${project.id}`),
        },
      },
    });
  },
};
