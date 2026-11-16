export const topicQueryKeys = {
  list: (projectId: string) => ["platformSeo", projectId, "topics"] as const,
  detail: (projectId: string, topicId: string) =>
    ["platformSeo", projectId, "topics", topicId] as const,
  // Shared by every "Write this" button, so a brief already being written
  // shows as pending wherever the topic appears.
  brief: (projectId: string, topicId: string) =>
    ["platformSeo", projectId, "topics", topicId, "brief"] as const,
};
