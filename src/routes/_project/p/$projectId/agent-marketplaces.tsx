import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Save } from "lucide-react";
import { toast } from "sonner";
import { AgentMarketplaceEvidenceForm } from "@/client/features/agent-marketplaces/AgentMarketplaceEvidenceForm";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  listAgentMarketplaces,
  updateAgentMarketplace,
} from "@/serverFunctions/agent-marketplaces";
import {
  agentMarketplaceStatusSchema,
  type AgentMarketplaceStatus,
} from "@/types/schemas/agent-marketplaces";

export const Route = createFileRoute(
  "/_project/p/$projectId/agent-marketplaces",
)({
  component: AgentMarketplacesRoute,
});

const STATUS_LABELS: Record<AgentMarketplaceStatus, string> = {
  not_started: "Not started",
  preparing: "Preparing",
  submitted: "Submitted",
  in_review: "In review",
  published: "Published",
  rejected: "Rejected",
  paused: "Paused",
};

function AgentMarketplacesRoute() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const queryKey = ["agentMarketplaces", projectId];
  const marketplaces = useQuery({
    queryKey,
    queryFn: () => listAgentMarketplaces({ data: { projectId } }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  return (
    <main className="px-4 py-5 pb-24 md:px-6 md:py-7 md:pb-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            AI-native distribution
          </p>
          <h1 className="text-2xl font-semibold text-base-content">
            Agent Marketplaces
          </h1>
          <p className="max-w-3xl text-sm text-base-content/65">
            Manage where your agent is submitted and published, then follow the
            path from discovery to a useful activated account. Clone and install
            counts are evidence of interest—not proof of outside adoption.
          </p>
        </header>

        <FunnelGuide />

        {marketplaces.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-base-content/60">
            <span className="loading loading-spinner loading-sm" />
            Loading marketplace state…
          </div>
        ) : marketplaces.isError ? (
          <div role="alert" className="alert alert-error">
            <span>Marketplace state could not be loaded.</span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void marketplaces.refetch()}
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {marketplaces.data?.map((marketplace) => (
              <MarketplaceCard
                key={`${marketplace.platform}-${marketplace.listing?.updatedAt ?? "new"}`}
                projectId={projectId}
                marketplace={marketplace}
                onSaved={refresh}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function FunnelGuide() {
  const stages = [
    "Listing view",
    "Install or clone",
    "Connection",
    "First source",
    "First cited result",
    "Qualified activation",
  ];
  return (
    <section className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
      <h2 className="text-sm font-semibold">The outcome funnel</h2>
      <ol className="mt-3 grid gap-2 text-xs text-base-content/65 sm:grid-cols-3 xl:grid-cols-6">
        {stages.map((stage, index) => (
          <li key={stage} className="rounded-lg bg-base-200/60 px-3 py-2.5">
            <span className="mr-1 font-mono text-base-content/40">
              {index + 1}.
            </span>
            {stage}
          </li>
        ))}
      </ol>
    </section>
  );
}

type MarketplaceData = NonNullable<
  Awaited<ReturnType<typeof listAgentMarketplaces>>
>[number];

function MarketplaceCard({
  projectId,
  marketplace,
  onSaved,
}: {
  projectId: string;
  marketplace: MarketplaceData;
  onSaved: () => Promise<unknown>;
}) {
  const listing = marketplace.listing;
  const [status, setStatus] = React.useState<AgentMarketplaceStatus>(
    listing?.status ?? "not_started",
  );
  const [packageVersion, setPackageVersion] = React.useState(
    listing?.packageVersion ?? "",
  );
  const [providerStatus, setProviderStatus] = React.useState(
    listing?.providerStatus ?? "",
  );
  const [listingUrl, setListingUrl] = React.useState(listing?.listingUrl ?? "");
  const [notes, setNotes] = React.useState(listing?.notes ?? "");

  const save = useMutation({
    mutationFn: (verifiedNow: boolean) =>
      updateAgentMarketplace({
        data: {
          projectId,
          platform: marketplace.platform,
          status,
          providerStatus: providerStatus.trim() || null,
          packageVersion: packageVersion.trim() || null,
          listingUrl: listingUrl.trim() || null,
          submittedAt:
            status === "submitted" ||
            status === "in_review" ||
            status === "published"
              ? (listing?.submittedAt ?? new Date().toISOString())
              : (listing?.submittedAt ?? null),
          publishedAt:
            status === "published"
              ? (listing?.publishedAt ?? new Date().toISOString())
              : (listing?.publishedAt ?? null),
          lastVerifiedAt: verifiedNow
            ? new Date().toISOString()
            : (listing?.lastVerifiedAt ?? null),
          notes: notes.trim() || null,
        },
      }),
    onSuccess: async (_, verifiedNow) => {
      await onSaved();
      toast.success(verifiedNow ? "State saved and verified" : "State saved");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not save state")),
  });

  return (
    <article className="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{marketplace.label}</h2>
          <p className="mt-1 text-xs text-base-content/50">
            {listing?.lastVerifiedAt
              ? `Verified ${formatDate(listing.lastVerifiedAt)}`
              : "Not yet verified"}
          </p>
        </div>
        <span className={`badge ${statusClass(status)}`}>
          {STATUS_LABELS[status]}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="form-control gap-1">
          <span className="text-xs font-medium text-base-content/60">
            State
          </span>
          <select
            name={`${marketplace.platform}-status`}
            className="select select-bordered w-full"
            value={status}
            onChange={(event) =>
              setStatus(agentMarketplaceStatusSchema.parse(event.target.value))
            }
          >
            {agentMarketplaceStatusSchema.options.map((option) => (
              <option key={option} value={option}>
                {STATUS_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label className="form-control gap-1">
          <span className="text-xs font-medium text-base-content/60">
            Package version
          </span>
          <input
            name={`${marketplace.platform}-version`}
            className="input input-bordered w-full font-mono"
            value={packageVersion}
            onChange={(event) => setPackageVersion(event.target.value)}
            placeholder="v0.2.0…"
          />
        </label>
      </div>

      <label className="form-control mt-3 gap-1">
        <span className="text-xs font-medium text-base-content/60">
          Provider-reported status
        </span>
        <input
          name={`${marketplace.platform}-provider-status`}
          className="input input-bordered w-full"
          value={providerStatus}
          onChange={(event) => setProviderStatus(event.target.value)}
          placeholder="Pending…"
        />
      </label>

      <label className="form-control mt-3 gap-1">
        <span className="text-xs font-medium text-base-content/60">
          Listing or submission URL
        </span>
        <div className="join w-full">
          <input
            type="url"
            name={`${marketplace.platform}-url`}
            className="input input-bordered join-item min-w-0 flex-1"
            value={listingUrl}
            onChange={(event) => setListingUrl(event.target.value)}
            placeholder="https://…"
          />
          {listingUrl ? (
            <a
              className="btn btn-square join-item"
              href={listingUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${marketplace.label} listing`}
            >
              <ExternalLink className="size-4" />
            </a>
          ) : null}
        </div>
      </label>

      <label className="form-control mt-3 gap-1">
        <span className="text-xs font-medium text-base-content/60">Notes</span>
        <textarea
          name={`${marketplace.platform}-notes`}
          className="textarea textarea-bordered min-h-20 w-full"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Review state, blockers, or next action…"
        />
      </label>

      <EvidenceSummary evidence={marketplace.latestEvidence} />
      <AgentMarketplaceEvidenceForm
        projectId={projectId}
        platform={marketplace.platform}
        onSaved={onSaved}
      />

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={save.isPending}
          onClick={() => save.mutate(true)}
        >
          {save.isPending ? (
            <span className="loading loading-spinner loading-xs" />
          ) : null}
          Save and verify now
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={save.isPending}
          onClick={() => save.mutate(false)}
        >
          {save.isPending ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <Save className="size-4" />
          )}
          Save state
        </button>
      </div>
    </article>
  );
}

function EvidenceSummary({
  evidence,
}: {
  evidence: MarketplaceData["latestEvidence"];
}) {
  if (!evidence) {
    return (
      <p className="mt-4 rounded-lg bg-base-200/60 px-3 py-2 text-xs text-base-content/55">
        No evidence snapshot yet.
      </p>
    );
  }
  return (
    <div className="mt-4 rounded-lg bg-base-200/60 p-3">
      <p className="text-xs font-medium text-base-content/60">
        Latest evidence · {formatDate(evidence.capturedAt)} · {evidence.source}
      </p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
        <Metric label="Clones" value={evidence.clones} />
        <Metric label="Cloners" value={evidence.uniqueCloners} />
        <Metric label="Installs" value={evidence.installs} />
        <Metric label="OAuth" value={evidence.oauthCompletions} />
        <Metric label="Activated" value={evidence.activatedAccounts} />
        <Metric label="Qualified" value={evidence.qualifiedOutcomes} />
      </dl>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col-reverse">
      <dt className="text-[11px] text-base-content/50">{label}</dt>
      <dd className="font-mono text-base font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function statusClass(status: AgentMarketplaceStatus) {
  if (status === "published") return "badge-success";
  if (status === "submitted" || status === "in_review") return "badge-info";
  if (status === "rejected") return "badge-error";
  if (status === "preparing") return "badge-warning";
  return "badge-ghost";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
