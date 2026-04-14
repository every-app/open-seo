import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, TrendingUp } from "lucide-react";
import { getRankTrackingConfigs } from "@/serverFunctions/rank-tracking";
import type { RankTrackingConfig } from "@/types/schemas/rank-tracking";
import { RankTrackingDomainList } from "./RankTrackingDomainList";
import { RankTrackingDomainDetail } from "./RankTrackingDomainDetail";
import { RankTrackingConfigModal } from "./RankTrackingConfigModal";

export function RankTrackingPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState<RankTrackingConfig | null>(
    null,
  );

  const { data: configs, isLoading } = useQuery({
    queryKey: ["rankTrackingConfigs", projectId],
    queryFn: () => getRankTrackingConfigs({ data: { projectId } }),
  });

  const invalidateConfigs = () => {
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingConfigs", projectId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["rankTrackingConfigSummaries", projectId],
    });
  };

  const selectedConfig =
    configs?.find((c) => c.id === selectedConfigId) ?? null;

  const openAddModal = () => {
    setEditingConfig(null);
    setShowConfigModal(true);
  };

  const openEditModal = (config: RankTrackingConfig) => {
    setEditingConfig(config);
    setShowConfigModal(true);
  };

  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Rank Tracking</h1>
          <p className="text-sm text-base-content/70">
            Track keyword positions across domains
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="size-6 animate-spin text-base-content/50" />
          </div>
        ) : !configs || configs.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-base-300 bg-base-100/70 p-8 text-center space-y-3">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <TrendingUp className="size-6" />
            </div>
            <h2 className="text-lg font-medium text-base-content/80">
              Track your keyword positions over time
            </h2>
            <p className="text-sm text-base-content/55 max-w-md mx-auto">
              Monitor rankings for your saved keywords, see position changes,
              and spot trends across desktop and mobile.
            </p>
            <button className="btn btn-primary btn-sm" onClick={openAddModal}>
              Add Domain
            </button>
            <p className="text-xs text-base-content/50">
              Requires saved keywords in this project.
            </p>
          </section>
        ) : selectedConfig ? (
          <RankTrackingDomainDetail
            config={selectedConfig}
            projectId={projectId}
            onBack={() => setSelectedConfigId(null)}
            onEdit={() => openEditModal(selectedConfig)}
          />
        ) : (
          <RankTrackingDomainList
            projectId={projectId}
            onSelectConfig={setSelectedConfigId}
            onAddDomain={openAddModal}
          />
        )}
      </div>

      {showConfigModal && (
        <RankTrackingConfigModal
          projectId={projectId}
          existingConfig={editingConfig}
          onClose={() => setShowConfigModal(false)}
          onSaved={() => {
            setShowConfigModal(false);
            invalidateConfigs();
          }}
        />
      )}
    </div>
  );
}
