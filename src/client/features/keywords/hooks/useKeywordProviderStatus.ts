import { useQuery } from "@tanstack/react-query";
import { getKeywordProviders } from "@/serverFunctions/keywords";

export function useKeywordProviderStatus() {
  const query = useQuery({
    queryKey: ["keyword-provider-status"],
    queryFn: () => getKeywordProviders(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return {
    providerStatus: query.data ?? null,
    providerStatusLoaded: query.isSuccess,
  };
}
