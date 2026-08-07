import { z } from "zod";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { RankTrackingService } from "@/server/features/rank-tracking/services/RankTrackingService";
import { mcpResponse } from "@/server/mcp/formatters";
import { buildProjectMeta } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { withMcpProjectAuth } from "@/server/mcp/project-auth";
import { projectIdSchema } from "@/server/mcp/schemas";
import { MAX_KEYWORDS_PER_CONFIG } from "@/shared/rank-tracking";

const trackerIdSchema = z
  .string()
  .optional()
  .describe(
    "Rank tracker config ID (see get_rank_tracker). Optional when the project has exactly one tracker.",
  );

const keywordsSchema = z
  .array(z.string().min(1))
  .min(1)
  .max(100)
  .describe("Keywords (1-100). Matched case-insensitively after trimming.");

// Tracking keywords are stored trimmed and lowercased (see
// RankTrackingService.addKeywords). Mirror that here so duplicate/not-found
// reporting compares like with like.
function normalizeKeywords(keywords: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of keywords) {
    const keyword = raw.trim().toLowerCase();
    if (keyword && !seen.has(keyword)) {
      seen.add(keyword);
      normalized.push(keyword);
    }
  }
  return normalized;
}

// Resolves the target tracker config, falling back to the project's only
// tracker when trackerId is omitted. Throws with an actionable message so the
// calling agent knows to pick a tracker or create one.
async function resolveTrackerConfig(projectId: string, trackerId?: string) {
  if (trackerId) {
    const config = await RankTrackingRepository.getConfigById({
      configId: trackerId,
      projectId,
    });
    if (!config) {
      throw new Error(
        `Rank tracker ${trackerId} not found in project ${projectId}. Use get_rank_tracker to list trackers.`,
      );
    }
    return config;
  }

  const configs = await RankTrackingRepository.getConfigsForProject(projectId);
  if (configs.length === 0) {
    throw new Error(
      `No rank trackers configured for project ${projectId}. Create one from the dashboard first.`,
    );
  }
  if (configs.length > 1) {
    const trackers = configs
      .map((c) => `- ${c.id}  ${c.domain}  loc:${c.locationCode}`)
      .join("\n");
    throw new Error(
      `Project ${projectId} has ${configs.length} rank trackers; pass trackerId to pick one:\n${trackers}`,
    );
  }
  return configs[0];
}

const addInputSchema = {
  projectId: projectIdSchema,
  trackerId: trackerIdSchema,
  keywords: keywordsSchema,
} as const;

type AddArgs = z.infer<z.ZodObject<typeof addInputSchema>>;

export const addRankTrackingKeywordsTool = {
  name: "add_rank_tracking_keywords",
  config: {
    title: "Add rank tracking keywords",
    description:
      "Add keywords to a project's rank tracker watchlist. Uses no credits and triggers no check — new keywords get positions on the next scheduled check, or trigger one from the dashboard. Idempotent: already-tracked keywords are reported as duplicates and skipped. Keywords are stored trimmed and lowercased. If trackerId is omitted and the project has exactly one tracker, that tracker is used.",
    inputSchema: addInputSchema,
    outputSchema: {
      projectId: z.string(),
      trackerId: z.string(),
      added: z.number(),
      addedKeywords: z.array(z.string()),
      duplicateKeywords: z.array(z.string()),
      skippedByLimit: z.number(),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: withMcpProjectAuth(async (args: AddArgs, context) => {
    const config = await resolveTrackerConfig(args.projectId, args.trackerId);

    const existing = await RankTrackingRepository.getKeywordsForConfig(
      config.id,
    );
    const existingKeywords = new Set(existing.map((kw) => kw.keyword));

    const requested = normalizeKeywords(args.keywords);
    const duplicateKeywords = requested.filter((kw) =>
      existingKeywords.has(kw),
    );
    const newKeywords = requested.filter((kw) => !existingKeywords.has(kw));

    const result = await RankTrackingService.addKeywords(
      config.id,
      args.projectId,
      args.keywords,
    );

    // The service inserts new keywords in request order and stops at the
    // per-tracker cap, so the first `added` new keywords are the ones stored.
    const addedKeywords = newKeywords.slice(0, result.added);
    const skippedByLimit = newKeywords.length - result.added;

    const lines = [
      `Added ${result.added} keyword(s) to rank tracker ${config.id} (${config.domain}).`,
    ];
    if (duplicateKeywords.length > 0) {
      lines.push(
        `Already tracked (${duplicateKeywords.length}): ${duplicateKeywords.join(", ")}`,
      );
    }
    if (skippedByLimit > 0) {
      lines.push(
        `Skipped ${skippedByLimit} keyword(s): tracker is at the ${MAX_KEYWORDS_PER_CONFIG}-keyword limit.`,
      );
    }
    if (result.added > 0) {
      lines.push(
        "Positions appear after the next check (scheduled, or triggered from the dashboard).",
      );
    }

    return mcpResponse({
      text: lines.join("\n"),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/rank-tracking/${config.id}`,
      ),
      structuredContent: {
        projectId: args.projectId,
        trackerId: config.id,
        added: result.added,
        addedKeywords,
        duplicateKeywords,
        skippedByLimit,
      },
    });
  }),
};

const removeInputSchema = {
  projectId: projectIdSchema,
  trackerId: trackerIdSchema,
  keywords: keywordsSchema,
} as const;

type RemoveArgs = z.infer<z.ZodObject<typeof removeInputSchema>>;

export const removeRankTrackingKeywordsTool = {
  name: "remove_rank_tracking_keywords",
  config: {
    title: "Remove rank tracking keywords",
    description:
      "Remove keywords from a project's rank tracker watchlist so future checks no longer include them. Keywords are matched case-insensitively after trimming; unmatched keywords are reported, not an error. Uses no credits. If trackerId is omitted and the project has exactly one tracker, that tracker is used. Ask the user for confirmation before removing many keywords.",
    inputSchema: removeInputSchema,
    outputSchema: {
      projectId: z.string(),
      trackerId: z.string(),
      removed: z.number(),
      removedKeywords: z.array(z.string()),
      notFoundKeywords: z.array(z.string()),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: true,
    },
  },
  handler: withMcpProjectAuth(async (args: RemoveArgs, context) => {
    const config = await resolveTrackerConfig(args.projectId, args.trackerId);

    const existing = await RankTrackingRepository.getKeywordsForConfig(
      config.id,
    );
    const idByKeyword = new Map(existing.map((kw) => [kw.keyword, kw.id]));

    const requested = normalizeKeywords(args.keywords);
    const removedKeywords: string[] = [];
    const removedIds: string[] = [];
    const notFoundKeywords: string[] = [];
    for (const keyword of requested) {
      const id = idByKeyword.get(keyword);
      if (id) {
        removedKeywords.push(keyword);
        removedIds.push(id);
      } else {
        notFoundKeywords.push(keyword);
      }
    }

    if (removedIds.length > 0) {
      await RankTrackingService.removeKeywords(
        config.id,
        args.projectId,
        removedIds,
      );
    }

    const lines = [
      `Removed ${removedKeywords.length} keyword(s) from rank tracker ${config.id} (${config.domain}).`,
    ];
    if (notFoundKeywords.length > 0) {
      lines.push(
        `Not tracked (${notFoundKeywords.length}): ${notFoundKeywords.join(", ")}`,
      );
    }

    return mcpResponse({
      text: lines.join("\n"),
      meta: buildProjectMeta(
        context,
        args.projectId,
        `/p/${args.projectId}/rank-tracking/${config.id}`,
      ),
      structuredContent: {
        projectId: args.projectId,
        trackerId: config.id,
        removed: removedKeywords.length,
        removedKeywords,
        notFoundKeywords,
      },
    });
  }),
};
