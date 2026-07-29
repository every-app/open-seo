import { AppError } from "@/server/lib/errors";
import { BrandMonitoringRepository } from "@/server/features/brand-monitoring/repositories/BrandMonitoringRepository";
import { fetchGdeltMentions } from "@/server/lib/gdeltClient";

async function createConfig(input: { projectId: string; query: string }) {
  const trimmedQuery = input.query.trim();
  const existing = await BrandMonitoringRepository.listConfigsByProject(
    input.projectId,
  );
  const alreadyMonitored = existing.some(
    (config) => config.query.toLowerCase() === trimmedQuery.toLowerCase(),
  );
  if (alreadyMonitored) {
    throw new AppError("CONFLICT");
  }
  return BrandMonitoringRepository.createConfig({
    projectId: input.projectId,
    query: trimmedQuery,
  });
}

async function listConfigs(input: { projectId: string }) {
  return BrandMonitoringRepository.listConfigsByProject(input.projectId);
}

async function refreshMentions(input: { projectId: string; configId: string }) {
  const config = await BrandMonitoringRepository.getConfigForProject(
    input.configId,
    input.projectId,
  );
  if (!config) {
    throw new AppError("NOT_FOUND");
  }

  const articles = await fetchGdeltMentions(config.query);
  const inserted = await BrandMonitoringRepository.upsertMentions(
    config.id,
    articles.map((article) => ({
      sourceId: article.sourceId,
      title: article.title,
      url: article.url,
      snippet: null,
      publishedAt: article.publishedAt,
      sentimentScore: article.sentimentScore,
      sentimentLabel: article.sentimentLabel,
    })),
  );
  await BrandMonitoringRepository.touchLastChecked(
    config.id,
    new Date().toISOString(),
  );

  return { fetched: articles.length, inserted };
}

async function listMentions(input: {
  projectId: string;
  configId: string;
  sentimentFilter?: "all" | "positive" | "neutral" | "negative";
  limit: number;
  offset: number;
}) {
  const config = await BrandMonitoringRepository.getConfigForProject(
    input.configId,
    input.projectId,
  );
  if (!config) {
    throw new AppError("NOT_FOUND");
  }
  return BrandMonitoringRepository.listMentions(config.id, {
    sentimentFilter: input.sentimentFilter,
    limit: input.limit,
    offset: input.offset,
  });
}

export const BrandMonitoringService = {
  createConfig,
  listConfigs,
  refreshMentions,
  listMentions,
} as const;
