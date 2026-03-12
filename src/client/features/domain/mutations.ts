import { useMutation, type QueryClient } from "@tanstack/react-query";
import { saveKeywords } from "@/serverFunctions/keywords";

export function useSaveKeywordsMutation({
  projectId,
  queryClient,
}: {
  projectId: string;
  queryClient: QueryClient;
}) {
  return useMutation({
    mutationFn: (data: {
      projectId: string;
      keywords: string[];
      locationCode: number;
      languageCode: string;
      metrics?: Array<{
        keyword: string;
        searchVolume?: number | null;
        cpc?: number | null;
        keywordDifficulty?: number | null;
      }>;
    }) => saveKeywords({ data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["savedKeywords", projectId],
      });
    },
  });
}
