import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseZap } from "lucide-react";
import { toast } from "sonner";
import { IntegrationConnectionCard } from "./IntegrationConnectionCard";
import {
  configureFirstPartySignalSource,
  listFirstPartySignalSources,
  revokeFirstPartySignalSource,
} from "@/serverFunctions/first-party-signals";

export function FirstPartySignalsConnectionCard({
  projectId,
}: {
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("website");
  const [paths, setPaths] = React.useState("/");
  const [credential, setCredential] = React.useState<{
    sourceId: string;
    secret: string;
  } | null>(null);
  const queryKey = ["firstPartySignalSources", projectId];
  const sources = useQuery({
    queryKey,
    queryFn: () => listFirstPartySignalSources({ data: { projectId } }),
  });
  const configure = useMutation({
    gcTime: 0,
    mutationFn: () =>
      configureFirstPartySignalSource({
        data: {
          projectId,
          name,
          allowedPaths: paths
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: (result) => {
      setCredential({ sourceId: result.sourceId, secret: result.secret });
      toast.success("Aggregate source configured");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: () => toast.error("Could not configure aggregate source"),
  });
  const revoke = useMutation({
    mutationFn: (sourceId: string) =>
      revokeFirstPartySignalSource({ data: { projectId, sourceId } }),
    onSuccess: () => {
      toast.success("Aggregate source revoked");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: () => toast.error("Could not revoke aggregate source"),
  });
  const active = sources.data?.filter((source) => !source.revokedAt) ?? [];

  return (
    <IntegrationConnectionCard
      title="First-party aggregates"
      icon={<DatabaseZap className="size-5 text-emerald-500" />}
      status={
        sources.isLoading || sources.isError
          ? undefined
          : active.length
            ? "connected"
            : "disconnected"
      }
    >
      <p className="text-sm text-base-content/70">
        Send daily counts to <code>/api/site-signals/v1/aggregates</code>.
        OpenSEO rejects unknown fields, query strings, private paths, and common
        identifier-shaped path segments.
      </p>
      {credential ? (
        <div className="alert alert-warning mt-4 block text-sm">
          <p className="font-medium">
            Copy this credential now. The 256-bit secret is shown once.
          </p>
          <p className="mt-2 break-all font-mono text-xs">
            Source: {credential.sourceId}
          </p>
          <p className="mt-1 break-all font-mono text-xs">
            Secret: {credential.secret}
          </p>
          <p className="mt-2 text-xs opacity-80">
            Sign the exact request bytes as timestamp.rawBody with HMAC-SHA256
            and send the hexadecimal digest in X-OpenSEO-Signature.
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-xs mt-2"
            onClick={() => {
              setCredential(null);
              configure.reset();
            }}
          >
            I saved it
          </button>
        </div>
      ) : null}
      <form
        className="mt-4 grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          configure.mutate();
        }}
      >
        <label className="form-control gap-1">
          <span className="text-xs font-medium">Source name</span>
          <input
            className="input input-bordered input-sm"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="form-control gap-1">
          <span className="text-xs font-medium">
            Allowed public landing paths
          </span>
          <input
            className="input input-bordered input-sm"
            value={paths}
            onChange={(event) => setPaths(event.target.value)}
            placeholder="/, /pricing, /docs/getting-started"
          />
          <span className="text-xs opacity-60">
            Comma-separated exact paths, never URL prefixes.
          </span>
        </label>
        <button
          className="btn btn-primary btn-sm md:col-span-2 md:w-fit"
          disabled={configure.isPending || !name.trim() || !paths.trim()}
        >
          {configure.isPending
            ? "Generating…"
            : "Generate or rotate source secret"}
        </button>
      </form>
      {active.length ? (
        <div className="mt-4 space-y-2">
          {active.map((source) => (
            <div
              key={source.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-base-300 p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">{source.name}</p>
                <p className="truncate text-xs opacity-60">
                  {source.secretHint} · {source.allowedPaths.join(", ")}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs text-error"
                onClick={() => revoke.mutate(source.id)}
                disabled={revoke.isPending}
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </IntegrationConnectionCard>
  );
}
