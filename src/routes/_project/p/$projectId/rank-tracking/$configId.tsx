import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRankTrackingConfigs } from "@/serverFunctions/rank-tracking";
import { RankTrackingDomainDetail } from "@/client/features/rank-tracking/RankTrackingDomainDetail";
import { RankTrackingConfigModal } from "@/client/features/rank-tracking/RankTrackingConfigModal";

export const Route = createFileRoute(
  "/_project/p/$projectId/rank-tracking/$configId",
)({
  component: RankTrackingConfigRoute,
});

function RankTrackingConfigRoute() {
  const { projectId, configId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showConfigModal, setShowConfigModal] = useState(false);

  const { data: configs, isLoading } = useQuery({
    queryKey: ["rankTrackingConfigs", projectId],
    queryFn: () => getRankTrackingConfigs({ data: { projectId } }),
  });

  const config = configs?.find((c) => c.id === configId) ?? null;

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

  if (isLoading) return null;

  if (!config) {
    return (
      <>
        <p className="text-sm text-base-content/70">
          Domain configuration not found.
        </p>
        <button className="btn btn-ghost btn-sm" onClick={handleBack}>
          Back to domains
        </button>
      </>
    );
  }

  return (
    <>
      <RankTrackingDomainDetail
        config={config}
        projectId={projectId}
        onBack={handleBack}
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
