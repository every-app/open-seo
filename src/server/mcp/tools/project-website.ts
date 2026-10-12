import { z } from "zod";
import { ProjectWebsiteService } from "@/server/features/projects/services/ProjectWebsiteService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import {
  looseObjectOutputSchema,
  optionalMetaOutputSchema,
} from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import {
  researchProjectWebsiteSchema,
  saveProjectWebsiteSetupSchema,
} from "@/types/schemas/projectWebsite";

export const researchProjectWebsiteTool = {
  name: "research_project_website",
  config: {
    title: "Research project website",
    description:
      "Fill missing project basics, business competitors, and Prompt Research topics using saved context and verified website pages. Each field is independent: reuse existing name, domain, overview, and competitors; search for competitors only when none are saved. Requires a positive usage-credit balance to start; completes research before billing actual model and search costs, even if that makes the balance negative. Newly researched competitors have evidence links, and the list is empty if live search was unavailable; preserveCompetitors=true means the existing list is reused and competitors is empty. Returns five suggested topics with five prompts each, plus up to fifteen suggested keywords, only when research keywords are missing. Results are drafts, not saved or tracked. Review newly researched competitors before save_project_website_setup.",
    inputSchema: researchProjectWebsiteSchema.shape,
    outputSchema: z.looseObject({
      name: z.string(),
      domain: z.string(),
      overview: z.string(),
      competitors: z.array(looseObjectOutputSchema),
      preserveCompetitors: z.boolean(),
      suggestedTopics: z.array(looseObjectOutputSchema),
      suggestedKeywords: z.array(z.string()),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<typeof researchProjectWebsiteSchema>, context) => {
      const research = await ProjectWebsiteService.research(
        args.projectId,
        args.website,
        context.billing,
      );
      return mcpResponse({
        text: JSON.stringify(research),
        structuredContent: research,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/context`,
        ),
      });
    },
  ),
};
export const saveProjectWebsiteSetupTool = {
  name: "save_project_website_setup",
  config: {
    title: "Save reviewed website setup",
    description:
      "Fill missing website domain, business overview, and competitors after the user confirms setup. Existing project values and competitor lists are authoritative and never overwritten, including values saved while research was running. Pass suggestedTopics and suggestedKeywords from research: when research keywords are missing, the topic names and keywords fill them, and the first three topics seed initial AI tracking on a weekly schedule, with its first paid check about a week later. Existing keywords and tracking stay intact. New competitor lists can include reviewed manual additions without research evidence. Use update_project_context for explicit edits to saved context. Uses no credits now and never starts answer collection immediately.",
    inputSchema: saveProjectWebsiteSetupSchema.shape,
    outputSchema: z.looseObject({
      project: looseObjectOutputSchema,
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: true,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<typeof saveProjectWebsiteSetupSchema>, context) => {
      const project = await ProjectWebsiteService.save(
        args,
        context.billing,
        "mcp",
      );
      return mcpResponse({
        text: "Saved reviewed website setup to project context.",
        structuredContent: { project },
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/context`,
        ),
      });
    },
  ),
};
