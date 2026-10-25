import { requireOrgPermission } from "@/server/auth/org-gate";
import { completeOnboardingFromAgent } from "@/server/features/activation/mcpActivation";
import { ProjectService } from "@/server/features/projects/services/ProjectService";
import { AppError } from "@/server/lib/errors";
import { mcpResponse } from "@/server/mcp/formatters";
import { isHostedMcpClient, type ToolContext } from "@/server/mcp/context";
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
    outputSchema: z.looseObject({
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
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: async (args: Args, context: ToolContext) => {
    const { baseUrl, ...auth } = context.auth;
    // Same gate as the createProject server function — MCP and the dashboard
    // must agree on who can create projects.
    requireOrgPermission(auth, { project: ["create"] });
    // Reuse the app's create schema so the market pair rule (a languageCode
    // requires a locationCode) and domain normalization match the dashboard.
    // A rejection is bad caller input, not a fault: VALIDATION_ERROR keeps it
    // out of error reporting while still naming the bad field.
    const parsedInput = createProjectSchema.safeParse(args);
    if (!parsedInput.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        z.prettifyError(parsedInput.error),
      );
    }
    const input = parsedInput.data;
    const project = await ProjectService.createProject(
      auth.organizationId,
      input,
    );
    // Hosted users only: self-host and SAM never run the onboarding wizard.
    // Best-effort: the project already exists, and an error here would make
    // the agent retry and create a duplicate.
    if (isHostedMcpClient(auth)) {
      await completeOnboardingFromAgent(auth, "agent_project");
    }
    return mcpResponse({
      text: `Created project ${project.id}  ${project.name}${
        project.domain ? ` (${project.domain})` : ""
      }  market:${project.locationCode}/${project.languageCode}`,
      meta: {
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
