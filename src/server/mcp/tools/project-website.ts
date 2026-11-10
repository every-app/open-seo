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
      "Research a project's website to draft its missing setup: brand name, domain, business overview, competitors, and Prompt Research topics. Saved values are reused, and competitors are searched for only when none are saved; preserveCompetitors=true means the saved list is kept and competitors is empty, and a researched list is also empty if live search was unavailable. Returns five suggested topics with five prompts each, plus up to fifteen suggested keywords, only when research keywords are missing. Needs a positive credit balance to start, then bills actual model and search costs, even if that makes the balance negative. Results are drafts, not saved or tracked: review them with the user, then save with save_project_website_setup.",
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
        text:
          JSON.stringify(research) +
          (research.suggestedTopics.length > 0
            ? "\nSaving suggestedTopics with save_project_website_setup also starts weekly paid AI tracking of the first three topics, unless the project already tracks prompts. Mention this when the user confirms setup."
            : ""),
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
      "Save a website setup drafted by research_project_website or complete_ai_research_setup once the user confirms it: fills the project's missing website domain, business overview, and competitors. name sets the brand name AI visibility looks for in answers, so confirm it with the user too. Existing project values and competitor lists are never overwritten; a new competitor list can include manual additions the user reviewed. Pass suggestedTopics and suggestedKeywords from the research: when research keywords are missing they fill them, and the first three topics start weekly AI tracking, with its first paid check about a week later, unless the project already tracks prompts. Saving uses no credits and starts no answer collection. For explicit edits to saved context, use update_project_context.",
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
      const { project, seededTracking } = await ProjectWebsiteService.save(
        args,
        context.billing,
        "mcp",
      );
      return mcpResponse({
        text: seededTracking
          ? "Saved reviewed website setup to project context. Weekly AI tracking now covers the first three suggested topics on ChatGPT, and its first paid check runs in about a week. Tell the user; set_ai_visibility_schedule pauses it if they don't want it."
          : "Saved reviewed website setup to project context.",
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
