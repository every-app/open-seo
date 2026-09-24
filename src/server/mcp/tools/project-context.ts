import { brand } from "@/shared/brand";
import { z } from "zod";
import { ProjectContextService } from "@/server/features/project-context/services/ProjectContextService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import {
  updateProjectContextSchema,
  type ContextAuthor,
} from "@/types/schemas/projectContext";

// Both tools return the whole context, so they share one output shape. Every
// MCP client pays for these schemas on tools/list, so the rows stay loose
// objects — the rendered markdown in `text` is where the detail lives.
// Clients cache this schema across deployments; new context fields must not
// invalidate a response for clients still using the previous tools/list.
const contextOutputSchema = z
  .object({
    sections: z.array(looseObjectOutputSchema),
    missingSections: z.array(z.string()),
    customSections: z.array(looseObjectOutputSchema),
    competitors: z.array(looseObjectOutputSchema),
    keyPages: z.array(looseObjectOutputSchema),
    researchLog: z.array(looseObjectOutputSchema),
    reportTemplates: z.array(looseObjectOutputSchema),
    ...optionalMetaOutputSchema,
  })
  .passthrough();

const contextPath = (projectId: string) => `/p/${projectId}/context`;

const getInputSchema = { projectId: projectIdSchema } as const;

export const getProjectContextTool = {
  name: "get_project_context",
  config: {
    title: "Get project context",
    description: `Reads a project's shared memory: business overview, current goal, positioning, writing preferences, custom sections, competitors, key pages, and the recent research log. Uses no credits. Call this before SEO work to ground it in what the user already told ${brand.name}, and check the research log before re-buying research. Sections listed as missing are the ones worth filling with update_project_context.`,
    inputSchema: getInputSchema,
    outputSchema: contextOutputSchema,
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof getInputSchema>>, context) => {
      const projectContext = await ProjectContextService.getProjectContext(
        args.projectId,
      );
      return mcpResponse({
        text: ProjectContextService.renderProjectContextMarkdown(
          projectContext,
        ),
        meta: buildProjectMeta(
          context,
          args.projectId,
          contextPath(args.projectId),
        ),
        structuredContent: projectContext,
      });
    },
  ),
};

const updateInputSchema = {
  projectId: projectIdSchema,
  // The batch cap lives with the server function's schema so both entry points
  // accept exactly the same patch list.
  updates: updateProjectContextSchema.shape.updates.describe(
    'Patch ops, applied in order. Clear a standard section with {section: "current_goal", content: ""}; delete a custom section with {deleteCustomSection: "slug"}; removeCompetitors takes domains, removeKeyPages takes URLs, and removeResearchLog takes entry IDs from the project context. Adds upsert by domain/url; research-log entries are date-stamped by the server.',
  ),
} as const;

/**
 * SAM writes through this exact tool (adapted in samChatTools), so the author
 * recorded on every row is the one difference between the two callers — a
 * parameter here instead of a second write path that could drift.
 */
export function buildUpdateProjectContextTool(author: ContextAuthor) {
  return {
    name: "update_project_context",
    config: {
      title: "Update project context",
      description:
        "Adds, edits, or deletes a project's shared memory so the app, SAM, and other agents see it. Uses no credits. Use the current project context to find the entries to remove. Send patch ops to clear sections, deleteCustomSection, removeCompetitors, removeKeyPages, or removeResearchLog. Sections are prose (~4,000 chars max), competitors and key pages are curated shortlists (100 max each), and appendResearchLog records research already bought. Report templates are managed separately. Confirm facts with the user before storing them.",
      inputSchema: updateInputSchema,
      outputSchema: contextOutputSchema,
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        // The op union includes section/competitor/key-page/log deletions.
        destructiveHint: true,
      },
    },
    handler: withMcpProjectAuth(
      async (args: z.infer<z.ZodObject<typeof updateInputSchema>>, context) => {
        const projectContext = await ProjectContextService.applyContextUpdates(
          args.projectId,
          args.updates,
          author,
        );
        return mcpResponse({
          // Echoing the whole context back — the same digest the read tool
          // returns — is both the confirmation and the caller's next read, so
          // there is no second description of the patch ops to drift from them.
          text: [
            `Updated project context (${args.updates.length} change(s)).`,
            "",
            ProjectContextService.renderProjectContextMarkdown(projectContext),
          ].join("\n"),
          meta: buildProjectMeta(
            context,
            args.projectId,
            contextPath(args.projectId),
          ),
          structuredContent: projectContext,
        });
      },
    ),
  };
}

export const updateProjectContextTool = buildUpdateProjectContextTool("mcp");
