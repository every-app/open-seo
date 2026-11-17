export const topicQueryKeys = {
  list: (projectId: string) => ["platformSeo", projectId, "topics"] as const,
  detail: (projectId: string, topicId: string) =>
    ["platformSeo", projectId, "topics", topicId] as const,
  // Shared by every "Write this" button, so a brief already being written
  // shows as pending wherever the topic appears.
  brief: (projectId: string, topicId: string) =>
    ["platformSeo", projectId, "topics", topicId, "brief"] as const,
  article: (projectId: string, topicId: string) =>
    ["platformSeo", projectId, "topics", topicId, "article"] as const,
  publishing: (projectId: string, topicId: string) =>
    ["platformSeo", projectId, "topics", topicId, "publishing"] as const,
  // Organization-wide, but keyed by project like every other query here.
  channels: (projectId: string) =>
    ["platformSeo", projectId, "channels"] as const,
  pipeline: (projectId: string) =>
    ["platformSeo", projectId, "pipeline"] as const,
};
