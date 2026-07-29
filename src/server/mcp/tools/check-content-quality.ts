import { z } from "zod";
import { ContentQualityService } from "@/server/features/content-quality/services/ContentQualityService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";

const inputSchema = {
  projectId: projectIdSchema,
  url: z
    .string()
    .url()
    .describe(
      "The full URL of the page to analyze (e.g. 'https://example.com/blog/post').",
    ),
  targetKeyword: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional target keyword to check for in the title, H1, first paragraph, and body density.",
    ),
} as const;

type Args = z.infer<z.ZodObject<typeof inputSchema>>;

export const checkContentQualityTool = {
  name: "check_content_quality",
  config: {
    title: "Check content quality",
    description:
      "Analyzes a live page's on-page content quality: word count, Flesch reading-ease score, heading structure, image alt-text coverage, internal/external link counts, and (optionally) target-keyword placement in the title, H1, first paragraph, and body density. Fetches the page directly — free, no credits charged.",
    inputSchema,
    outputSchema: z
      .object({
        url: z.string(),
        title: z.string().nullable(),
        titleLength: z.number(),
        metaDescription: z.string().nullable(),
        metaDescriptionLength: z.number(),
        wordCount: z.number(),
        sentenceCount: z.number(),
        avgWordsPerSentence: z.number(),
        readingEaseScore: z.number(),
        readingEaseLabel: z.string(),
        headingCounts: z.object({
          h1: z.number(),
          h2: z.number(),
          h3: z.number(),
        }),
        h1Text: z.array(z.string()),
        imageCount: z.number(),
        imagesMissingAlt: z.number(),
        internalLinkCount: z.number(),
        externalLinkCount: z.number(),
        targetKeyword: z
          .object({
            keyword: z.string(),
            inTitle: z.boolean(),
            inH1: z.boolean(),
            inFirstParagraph: z.boolean(),
            occurrences: z.number(),
            densityPercent: z.number(),
          })
          .nullable(),
        ...optionalMetaOutputSchema,
      })
      .passthrough(),
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: Args, context) => {
    const result = await ContentQualityService.checkUrl({
      url: args.url,
      targetKeyword: args.targetKeyword,
    });

    const text = [
      `URL: ${result.url}`,
      `Title: ${result.title ?? "(missing)"} (${result.titleLength} chars)`,
      `Meta description: ${result.metaDescription ?? "(missing)"} (${result.metaDescriptionLength} chars)`,
      `Word count: ${result.wordCount}`,
      `Reading ease: ${result.readingEaseScore} (${result.readingEaseLabel})`,
      `Headings: H1=${result.headingCounts.h1} H2=${result.headingCounts.h2} H3=${result.headingCounts.h3}`,
      `Images: ${result.imageCount} total, ${result.imagesMissingAlt} missing alt text`,
      `Links: ${result.internalLinkCount} internal, ${result.externalLinkCount} external`,
      result.targetKeyword
        ? `Target keyword "${result.targetKeyword.keyword}": in title=${result.targetKeyword.inTitle}, in H1=${result.targetKeyword.inH1}, in first paragraph=${result.targetKeyword.inFirstParagraph}, density=${result.targetKeyword.densityPercent}%`
        : null,
    ]
      .filter((line): line is string => line !== null)
      .join("\n");

    return mcpResponse({
      text,
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/content-quality`,
        { url: args.url },
      ),
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ContentAnalysis is a plain JSON-serializable object; mcpResponse's structuredContent just needs a Record view of it.
      structuredContent: result as unknown as Record<string, unknown>,
    });
  }),
};
