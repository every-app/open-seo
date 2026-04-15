import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { RankTrackingDomainList } from "@/client/features/rank-tracking/RankTrackingDomainList";
import { RankTrackingConfigModal } from "@/client/features/rank-tracking/RankTrackingConfigModal";

export const Route = createFileRoute("/_project/p/$projectId/rank-tracking/")({
  component: RankTrackingIndex,
});

function RankTrackingIndex() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const [showConfigModal, setShowConfigModal] = useState(false);

  const invalidateConfigs = () => {
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingConfigs", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingConfigSummaries", projectId],
    });
  };

  return (
    <>
      <RankTrackingDomainList
        projectId={projectId}
        onAddDomain={() => setShowConfigModal(true)}
      />

      {showConfigModal && (
        <RankTrackingConfigModal
          projectId={projectId}
          existingConfig={null}
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
