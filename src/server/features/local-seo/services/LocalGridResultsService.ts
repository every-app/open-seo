import { AppError } from "@/server/lib/errors";
import type { LocalGridResultsResponse } from "@/types/schemas/local-seo";
import { LocalGridRepository } from "../repositories/LocalGridRepository";
import { LocalGridRankingRepository } from "../repositories/LocalGridRankingRepository";
import { summarizeLocalGridCompetitors } from "./localGridCompetitors";

export async function getLocalGridResults(
  configId: string,
  projectId: string,
): Promise<LocalGridResultsResponse> {
  const details = await LocalGridRepository.getConfig(configId, projectId);
  if (!details) throw new AppError("NOT_FOUND");
  const run = await LocalGridRepository.getLatestRun(configId);
  if (!run) {
    return {
      gridSize: details.config.gridSize,
      run: null,
      keywords: details.keywords.map(({ id, keyword }) => ({ id, keyword })),
      cells: [],
      competitors: [],
    };
  }

  const [cells, rankings] = await Promise.all([
    LocalGridRepository.getRunGridResults(run.id),
    LocalGridRankingRepository.getRunRankings(run.id),
  ]);
  const runKeywords = new Map<string, string>();
  let gridSize = 0;
  for (const cell of cells) {
    runKeywords.set(cell.trackingKeywordId, cell.keyword);
    gridSize = Math.max(gridSize, cell.rowIndex + 1, cell.columnIndex + 1);
  }
  const competitors = summarizeLocalGridCompetitors({
    rankings,
    cells,
    business: details.business,
    keywordIds: runKeywords.keys(),
  });
  return {
    gridSize: gridSize || details.config.gridSize,
    run: {
      id: run.id,
      status: run.status,
      taskCount: run.taskCount,
      tasksCompleted: run.tasksCompleted,
      providerCostUsd: run.providerCostUsd,
      errorMessage: run.errorMessage,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    },
    keywords:
      runKeywords.size > 0
        ? [...runKeywords].map(([id, keyword]) => ({ id, keyword }))
        : details.keywords.map(({ id, keyword }) => ({ id, keyword })),
    cells,
    competitors,
  };
}
