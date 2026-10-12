import { z } from "zod";
import { buildProjectMeta } from "@/server/mcp/context";
import { mcpResponse } from "@/server/mcp/formatters";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
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
      "Optional two-letter web-search country code. Omit for no country preference. Gemini does not support country selection; unsupported model/country combinations return per-model errors without a paid call.",
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
      "Ask one prompt in ChatGPT, or compare answers from selected AI models. Returns answer text, citations, search queries, brand mentions, and per-model errors. Use for a one-off answer comparison; use AI visibility tracking tools for consumer-site observations and recurring monitoring. Charges actual model usage per uncached model; web search may make one additional paid attempt if the first answer did not search. Cached answers are free for seven days. Requires a paid plan in hosted mode. Does not configure tracking or start project setup.",
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
      const result = await explorePrompt(args, context.billing);
      const meta = buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/prompt-explorer`,
        {
          q: args.prompt,
          models: JSON.stringify(args.models),
          web: String(args.webSearch),
          cc: args.webSearchCountryCode ?? "default",
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
