import { z } from "zod";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { projectWebSearchCountry } from "@/shared/prompt-search-countries";
import {
  promptExplorerInputSchema,
  promptExplorerModelResultSchema,
  promptExplorerResultSchema,
} from "@/types/schemas/ai-search";

const inputSchema = promptExplorerInputSchema.extend({
  projectId: projectIdSchema,
  prompt: promptExplorerInputSchema.shape.prompt.describe(
    "The exact question to ask, up to 500 characters. Preserve the user's wording.",
  ),
  models: promptExplorerInputSchema.shape.models.describe(
    "Models to query: chat_gpt, claude, gemini, perplexity. Defaults to ChatGPT only. Supply a list to compare selected models; each uncached model uses credits.",
  ),
  highlightBrand: promptExplorerInputSchema.shape.highlightBrand.describe(
    "Optional brand to highlight in answer text and citations. Does not change the prompt sent to the models.",
  ),
  webSearch: promptExplorerInputSchema.shape.webSearch.describe(
    "Allow web search, default true. Answers report whether the model actually searched; permission does not guarantee citations.",
  ),
  webSearchCountryCode:
    promptExplorerInputSchema.shape.webSearchCountryCode.describe(
      "Optional two-letter web-search country code. Omit to use the project's country, or no country preference when a selected model cannot use it. Gemini always answers without a country. A country you name returns per-model errors for other models that cannot use it, without a paid call.",
    ),
});

const [success, failure] = promptExplorerModelResultSchema.options;
const modelOutputSchema = z.discriminatedUnion("status", [
  success
    .extend({
      citations: z.array(success.shape.citations.element.loose()),
    })
    .loose(),
  failure.loose(),
]);

export const explorePromptTool = {
  name: "explore_prompt",
  config: {
    title: "Explore an AI prompt",
    description:
      "Ask one prompt in ChatGPT, or compare answers from ChatGPT, Claude, Gemini, and Perplexity. Returns answer text, citations, search queries, brand mentions, and per-model errors. Use it for a one-off look at how AI answers a question. Costs credits for actual model usage per uncached model, and web search may make one more paid attempt if the first answer did not search; cached answers are free for seven days. Requires a paid plan on hosted OpenSEO. For consumer-site observations and recurring monitoring, use the AI visibility tracking tools, starting with get_ai_visibility_tracker.",
    inputSchema: inputSchema.shape,
    outputSchema: promptExplorerResultSchema
      .extend({
        results: z.array(modelOutputSchema),
        ...optionalMetaOutputSchema,
      })
      .loose(),
    annotations: {
      readOnlyHint: false,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(
    async (args: z.infer<typeof inputSchema>, context) => {
      const { explorePrompt } =
        await import("@/server/features/ai-search/services/promptExplorer");
      const webSearchCountryCode =
        args.webSearchCountryCode ??
        projectWebSearchCountry(context.project.locationCode, args.models);
      const result = await explorePrompt(
        { ...args, webSearchCountryCode },
        context.billing,
      );
      const meta = buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/prompt-explorer`,
        {
          q: args.prompt,
          models: JSON.stringify(args.models),
          web: String(args.webSearch),
          cc: webSearchCountryCode ?? "default",
          hb: args.highlightBrand,
        },
      );
      return mcpResponse({
        text: `Prompt Explorer: ${result.results.length} model results.\n${meta.url}\n${JSON.stringify(result)}`,
        meta,
        structuredContent: result,
      });
    },
  ),
};
