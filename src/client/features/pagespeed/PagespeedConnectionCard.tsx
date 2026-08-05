import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Gauge } from "lucide-react";
import { IntegrationCard } from "@/client/features/integrations/integrationCardParts";
import { getPagespeedOverview } from "@/serverFunctions/pagespeed";

/**
 * PageSpeed Insights status. There is nothing to connect: the API key is an
 * instance-level env secret and the monitored URLs are managed on the
 * PageSpeed page, so this card only reports whether the key is set.
 * See specs/0011.
 */
export function PagespeedConnectionCard({ projectId }: { projectId: string }) {
  const overviewQuery = useQuery({
    queryKey: ["pagespeedOverview", projectId],
    queryFn: () => getPagespeedOverview({ data: { projectId } }),
  });
  const configured = overviewQuery.data?.configured ?? false;
  const urlCount = overviewQuery.data?.configured
    ? overviewQuery.data.urls.length
    : 0;

  return (
    <IntegrationCard
      title="PageSpeed Insights"
      status={
        overviewQuery.isLoading
          ? undefined
          : configured
            ? "connected"
            : "setup_required"
      }
    >
      {overviewQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-base-content/50">
          <span className="loading loading-spinner loading-sm" />
          Checking…
        </div>
      ) : configured ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Gauge className="size-[18px] text-base-content/70" />
            <p className="text-sm text-base-content/70">
              {urlCount === 0
                ? "Ready. No URLs are being monitored yet."
                : `Monitoring ${urlCount} URL${urlCount === 1 ? "" : "s"}.`}
            </p>
          </div>
          <Link
            to="/p/$projectId/pagespeed"
            params={{ projectId }}
            className="btn btn-ghost btn-sm"
          >
            Manage URLs
          </Link>
        </div>
      ) : (
        <SetupWarning />
      )}
    </IntegrationCard>
  );
}

function SetupWarning() {
  return (
    <p className="text-sm text-base-content/70">
      PageSpeed Insights isn't configured on this deployment. Create a free
      Google API key with the PageSpeed Insights API enabled (no billing account
      needed) at{" "}
      <a
        href="https://developers.google.com/speed/docs/insights/v5/get-started"
        target="_blank"
        rel="noreferrer"
        className="link"
      >
        Google's get-started guide
      </a>
      , then set{" "}
      <code className="rounded bg-base-200 px-1 py-0.5 text-xs">
        PAGESPEED_API_KEY
      </code>{" "}
      (via{" "}
      <code className="rounded bg-base-200 px-1 py-0.5 text-xs">
        npx wrangler secret put PAGESPEED_API_KEY
      </code>{" "}
      or .env.local in development). A key is required — Google's anonymous
      quota is zero.
    </p>
  );
}
