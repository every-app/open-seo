import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRankTrackingConfigs } from "@/serverFunctions/rank-tracking";
import { RankTrackingDomainDetail } from "@/client/features/rank-tracking/RankTrackingDomainDetail";
import { SkeletonPage } from "@/client/components/SkeletonPresets";
import { QueryError } from "@/client/components/QueryState";
import { EmptyState } from "@/client/components/EmptyState";
import { Button } from "@/client/components/ui/button";
import { RankTrackingConfigModal } from "@/client/features/rank-tracking/RankTrackingConfigModal";
import { rankTrackingDetailSearchSchema } from "@/types/schemas/rank-tracking-search";

export const Route = createFileRoute(
  "/_app/p/$projectId/rank-tracking/$configId",
)({
  validateSearch: rankTrackingDetailSearchSchema,
  component: RankTrackingConfigRoute,
});

function RankTrackingConfigRoute() {
  const { projectId, configId } = Route.useParams();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const [showConfigModal, setShowConfigModal] = useState(false);

  const configsQuery = useQuery({
    queryKey: ["rankTrackingConfigs", projectId],
    queryFn: () => getRankTrackingConfigs({ data: { projectId } }),
  });

  const config = configsQuery.data?.find((c) => c.id === configId) ?? null;

  const invalidateConfigs = () => {
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingConfigs", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingConfigSummaries", projectId],
    });
  };

  const handleBack = () => {
    void navigate({
      to: "/p/$projectId/rank-tracking",
      params: { projectId },
    });
  };

  if (configsQuery.isPending) {
    return <SkeletonPage />;
  }

  if (!configsQuery.data) {
    return (
      <QueryError
        error={configsQuery.error}
        fallback="Failed to load domain configuration"
        onRetry={() => void configsQuery.refetch()}
        isRetrying={configsQuery.isFetching}
      />
    );
  }

  if (!config) {
    return (
      <EmptyState
        kind="no-data"
        title="Domain configuration not found"
        description="This domain was archived or does not exist in this project."
        action={
          <Button variant="outline" size="sm" onClick={handleBack}>
            Back to domains
          </Button>
        }
      />
    );
  }

  return (
    <>
      <RankTrackingDomainDetail
        key={config.id}
        config={config}
        projectId={projectId}
        search={search}
        onSearchChange={(update) => {
          void navigate({
            from: Route.fullPath,
            search: (prev) => ({ ...prev, ...update }),
            replace: true,
          });
        }}
        onEdit={() => setShowConfigModal(true)}
      />

      {showConfigModal && (
        <RankTrackingConfigModal
          projectId={projectId}
          existingConfig={config}
          onClose={() => setShowConfigModal(false)}
          onSaved={() => {
            setShowConfigModal(false);
            invalidateConfigs();
          }}
        />
      )}
    </>
  );
}
