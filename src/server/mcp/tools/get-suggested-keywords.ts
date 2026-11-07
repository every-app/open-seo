import { z } from "zod";
import { KeywordSuggestionService } from "@/server/features/keywords/services/KeywordSuggestionService";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { formatMcpTable, type McpTableColumn } from "@/server/mcp/table";
import { buildConnectGscUrl } from "@/server/mcp/urls";
import { KeywordSuggestionReason } from "@/shared/keyword-suggestions";

type Suggestion = { keyword: string; reason: KeywordSuggestionReason };

const REASON_TEXT: Record<KeywordSuggestionReason, string> = {
  [KeywordSuggestionReason.CloseToTopThree]: "Search Console: ranks 4–6",
  [KeywordSuggestionReason.CloseToPageOne]: "Search Console: ranks 11–20",
  [KeywordSuggestionReason.FromYourSite]: "saved topic",
};

const SUGGESTION_COLUMNS: McpTableColumn<Suggestion>[] = [
  { header: "keyword", value: (row) => row.keyword },
  { header: "why", value: (row) => REASON_TEXT[row.reason] },
];

const researchWebsiteHint = (website: string) =>
  `research_project_website with the ${website} suggests topics and keywords from its pages, for credits.`;

const inputSchema = { projectId: projectIdSchema } as const;

export const getSuggestedKeywordsTool = {
  name: "get_suggested_keywords",
  config: {
    title: "Get suggested keywords",
    description:
      "Suggests up to 10 short seed keywords (one to three words) to research next: Search Console searches where the site's best page ranks 4–6 (close to the top 3) or 11–20 (close to page 1), then the project's saved topics. The same suggestions the keyword research page shows. Use when the user asks what to research or where to start, then pass them to research_keywords as seeds; their results include the long tail. Search Console suggestions need a connected property. Read-only and uses no credits.",
    inputSchema,
    outputSchema: z.looseObject({
      suggestions: z.array(
        z.looseObject({
          keyword: z.string(),
          reason: z.enum(KeywordSuggestionReason),
        }),
      ),
      searchConsoleConnected: z.boolean(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<z.ZodObject<typeof inputSchema>>, context) => {
      const { suggestions, canGenerate, searchConsoleConnected } =
        await KeywordSuggestionService.getSuggestions(context.project);
      const hasWebsite = Boolean(context.project.domain);

      // The next step comes first: Sam keeps only the start of the text.
      let text: string;
      if (suggestions.length > 0) {
        text = `${suggestions.length} suggested seed keywords. Pass up to 5 to research_keywords as seeds.${canGenerate ? ` ${researchWebsiteHint("project's website")}` : ""}`;
      } else if (!hasWebsite) {
        text = `No suggested keywords: the project has no website yet. ${researchWebsiteHint("business's website")}`;
      } else if (canGenerate) {
        text = `No suggested keywords yet: the project has no saved topics. ${researchWebsiteHint("project's website")}`;
      } else {
        text =
          "No suggested keywords: none of the project's saved topics is three words or fewer. research_keywords on the business's main products or services finds keywords to target.";
      }
      if (hasWebsite && !searchConsoleConnected) {
        const connectUrl = buildConnectGscUrl(
          context.baseUrl,
          args.projectId,
          Boolean(context.auth.guestClaimToken),
        );
        text += ` Search Console isn't connected; once the user connects it at ${connectUrl}, searches the site already ranks for are suggested too.`;
      }
      if (suggestions.length > 0)
        text += `\n${formatMcpTable(suggestions, SUGGESTION_COLUMNS)}`;

      return mcpResponse({
        text,
        meta: buildProjectMeta(
          context,
          args.projectId,
          `/p/${args.projectId}/keywords`,
        ),
        structuredContent: { suggestions, searchConsoleConnected },
      });
    },
  ),
};
