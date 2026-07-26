import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  ConnectedState,
  IntegrationCard,
} from "@/client/features/integrations/integrationCardParts";
import {
  disconnectVercel,
  getVercelConnection,
  listVercelProjects,
  setVercelProject,
} from "@/serverFunctions/vercel";

/**
 * Vercel Web Analytics connection. Simpler than the OAuth cards: the token
 * is an instance-level env secret (VERCEL_TOKEN), so connecting is just
 * picking which Vercel project maps to this OpenSEO project. See specs/0010.
 */
export function VercelConnectionCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [picking, setPicking] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const connectionKey = ["vercelConnection", projectId];
  const connectionQuery = useQuery({
    queryKey: connectionKey,
    queryFn: () => getVercelConnection({ data: { projectId } }),
  });
  const connection = connectionQuery.data;
  const connected = Boolean(connection?.connected);
  const needsSetup = connectionQuery.isSuccess && !connection?.tokenConfigured;

  const showPicker = picking || (!connected && !needsSetup);
  const projectsQuery = useQuery({
    queryKey: ["vercelProjects", projectId],
    queryFn: () => listVercelProjects({ data: { projectId } }),
    enabled: Boolean(showPicker && connectionQuery.isSuccess),
  });
  const projects = React.useMemo(
    () => projectsQuery.data?.projects ?? [],
    [projectsQuery.data?.projects],
  );

  React.useEffect(() => {
    if (selectedId) return;
    const current = projects.find((project) => project.isSelected);
    if (current) setSelectedId(current.vercelProjectId);
  }, [projects, selectedId]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: connectionKey });
    void queryClient.invalidateQueries({
      queryKey: ["vercelTraffic", projectId],
    });
  };

  const setMutation = useMutation({
    mutationFn: (vercelProjectId: string) =>
      setVercelProject({ data: { projectId, vercelProjectId } }),
    onSuccess: () => {
      toast.success("Vercel Web Analytics connected");
      setPicking(false);
      invalidate();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectVercel({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Vercel Web Analytics disconnected");
      setPicking(false);
      setSelectedId(null);
      invalidate();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  return (
    <IntegrationCard
      title="Vercel Web Analytics"
      status={
        connectionQuery.isLoading
          ? undefined
          : needsSetup
            ? "setup_required"
            : connected
              ? "connected"
              : "disconnected"
      }
    >
      {connectionQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-base-content/50">
          <span className="loading loading-spinner loading-sm" />
          Checking…
        </div>
      ) : needsSetup ? (
        <SetupWarning />
      ) : connected && !picking ? (
        <ConnectedState
          glyph={<Activity className="size-[18px] text-base-content/70" />}
          changeLabel="Change project"
          siteUrl={connection?.vercelProjectName ?? ""}
          connectedByEmail={null}
          onChange={() => {
            setSelectedId(null);
            setPicking(true);
          }}
          onDisconnect={() => disconnectMutation.mutate()}
          disconnecting={disconnectMutation.isPending}
        />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-base-content/70">
            Pick the Vercel project whose Web Analytics belong to this site.
          </p>
          {projectsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-base-content/50">
              <span className="loading loading-spinner loading-sm" />
              Loading Vercel projects…
            </div>
          ) : projectsQuery.isError ? (
            <div className="space-y-2">
              <p className="text-sm text-error">
                Couldn't list Vercel projects. The token may lack access.
              </p>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void projectsQuery.refetch()}
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {projects.map((project) => (
                  <label
                    key={project.vercelProjectId}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-base-300 p-3 hover:bg-base-200/50"
                  >
                    <input
                      type="radio"
                      name="vercel-project"
                      className="radio radio-sm"
                      checked={selectedId === project.vercelProjectId}
                      onChange={() => setSelectedId(project.vercelProjectId)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {project.name}
                      </span>
                      {project.teamSlug ? (
                        <span className="block truncate text-xs text-base-content/55">
                          {project.teamSlug}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
                {projects.length === 0 ? (
                  <p className="p-2 text-sm text-base-content/60">
                    No Vercel projects visible to this token.
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!selectedId || setMutation.isPending}
                  onClick={() => selectedId && setMutation.mutate(selectedId)}
                >
                  {setMutation.isPending ? "Saving…" : "Save"}
                </button>
                {connected ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPicking(false)}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      )}
    </IntegrationCard>
  );
}

function SetupWarning() {
  return (
    <p className="text-sm text-base-content/70">
      Vercel Web Analytics isn't configured on this deployment. Create a Vercel
      access token with read access to your projects, then set{" "}
      <code className="rounded bg-base-200 px-1 py-0.5 text-xs">
        VERCEL_TOKEN
      </code>{" "}
      (via{" "}
      <code className="rounded bg-base-200 px-1 py-0.5 text-xs">
        npx wrangler secret put VERCEL_TOKEN
      </code>{" "}
      or .env.local in development).
    </p>
  );
}
