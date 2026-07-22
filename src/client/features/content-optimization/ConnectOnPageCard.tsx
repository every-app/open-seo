import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  pollOnPageConnect,
  setContentOptimizationEnabled,
  startOnPageConnect,
} from "@/serverFunctions/contentOptimization";

type ConnectSession = {
  code: string;
  pollSecret: string;
  activateUrl: string;
  pollIntervalS: number;
};

function useSetModuleEnabled(onDone?: (enabled: boolean) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      setContentOptimizationEnabled({ data: { enabled } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: ["contentOptimizationModule"],
      });
      onDone?.(result.enabled);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

/** Shown in place of the page content when the module is switched off. */
export function ModuleDisabledCard() {
  const enableMutation = useSetModuleEnabled();
  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body flex-row flex-wrap items-center gap-4 p-6">
        <p className="text-[15px] text-base-content/70">
          Content Optimization is turned off for this OpenSEO install.
        </p>
        <button
          type="button"
          className="btn btn-sm"
          disabled={enableMutation.isPending}
          onClick={() => enableMutation.mutate(true)}
        >
          Turn it back on
        </button>
      </div>
    </div>
  );
}

/**
 * Guided connect: one click opens api.on-page.ai/activate where the user
 * signs up (free trial credits included), picks a plan, and approves this
 * OpenSEO install. The API key is delivered over the device-connect
 * handshake and stored automatically. No env editing, no restart.
 */
export function ConnectOnPageCard() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<ConnectSession | null>(null);
  const [showManual, setShowManual] = useState(false);
  const disableMutation = useSetModuleEnabled((enabled) => {
    if (!enabled) {
      toast.success(
        "Content Optimization turned off. Re-enable it any time in Settings.",
      );
    }
  });

  const startMutation = useMutation({
    mutationFn: () => startOnPageConnect(),
    onSuccess: (started) => {
      setSession(started);
      window.open(started.activateUrl, "_blank", "noopener");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const { data: pollResult } = useQuery({
    queryKey: ["onpageConnectPoll", session?.code],
    queryFn: () =>
      pollOnPageConnect({
        data: {
          code: session!.code,
          pollSecret: session!.pollSecret,
        },
      }),
    enabled: session !== null,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" || query.state.data === undefined
        ? (session?.pollIntervalS ?? 3) * 1000
        : false,
    refetchIntervalInBackground: true,
  });

  if (pollResult?.status === "connected") {
    void queryClient.invalidateQueries({
      queryKey: ["contentOptimizationModule"],
    });
  }

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-4 p-6">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="text-lg font-semibold">Connect On-Page.ai</h2>
        </div>
        <p className="max-w-[640px] text-[15px] leading-relaxed text-base-content/70">
          Content optimization scans run through your own On-Page.ai account,
          the same bring-your-own-key model as DataForSEO. New accounts include
          free trial credits, so you can run your first scans without paying
          anything.
        </p>

        {session === null ? (
          <div>
            <button
              type="button"
              className="btn btn-primary gap-2"
              disabled={startMutation.isPending}
              onClick={() => startMutation.mutate()}
            >
              {startMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ExternalLink className="size-4" />
              )}
              Connect your On-Page.ai account
            </button>
          </div>
        ) : pollResult?.status === "expired" ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-base-content/60">
              That connect session expired.
            </p>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setSession(null);
                startMutation.mutate();
              }}
            >
              Start again
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4 rounded-[3px] bg-base-200/60 px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-base-content/50">
                Your connect code
              </p>
              <p className="font-mono text-2xl font-bold tracking-wider tabular-nums">
                {session.code}
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-base-content/60">
              <Loader2 className="size-4 animate-spin" />
              Waiting for approval at api.on-page.ai
            </div>
            <a
              className="btn btn-ghost btn-sm"
              href={session.activateUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Reopen the approval page
            </a>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-xs w-fit text-base-content/50"
            onClick={() => setShowManual((v) => !v)}
          >
            {showManual ? "Hide manual setup" : "Or configure manually"}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-xs w-fit text-base-content/50"
            disabled={disableMutation.isPending}
            onClick={() => disableMutation.mutate(false)}
          >
            Don&apos;t want this? Turn the module off
          </button>
        </div>
        {showManual && (
          <div className="space-y-2">
            <p className="text-sm text-base-content/70">
              Get an API key at{" "}
              <a
                className="link"
                href="https://api.on-page.ai/install"
                rel="noopener noreferrer"
                target="_blank"
              >
                api.on-page.ai
              </a>{" "}
              and add it to your deployment, then restart:
            </p>
            <pre className="rounded-[3px] bg-base-200 px-4 py-3 font-mono text-xs">
              ONPAGE_API_KEY=op_your_key_here
            </pre>
            <p className="text-xs text-base-content/50">
              The env var always wins over a connected account. Without either,
              this page stays dormant and nothing else in OpenSEO is affected.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
