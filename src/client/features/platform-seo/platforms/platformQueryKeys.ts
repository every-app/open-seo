export const platformQueryKeys = {
  list: (projectId: string) => ["platformSeo", projectId, "platforms"] as const,
};
