import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  CardShell,
  moreDetailsClass,
  PercentDelta,
  Stat,
} from "@/client/features/dashboard/cardParts";
import {
  formatGa4Count,
  formatGa4Rate,
  getGa4DashboardViewState,
} from "@/client/features/dashboard/ga4Dashboard";
import { getDashboardGa4Summary } from "@/serverFunctions/ga4";

const FIVE_MINUTES_MS = 5 * 60 * 1_000;
const ONE_HOUR_MS = 60 * 60 * 1_000;
const GA4_STAMP = "Google Analytics · all traffic · last 28 complete days";

export function Ga4DashboardCards({
  projectId,
  connected,
}: {
  projectId: string;
  connected: boolean;
}) {
  const summaryQuery = useQuery({
    queryKey: ["dashboardGa4Summary", projectId],
    queryFn: () => getDashboardGa4Summary({ data: { projectId } }),
    enabled: connected,
    staleTime: FIVE_MINUTES_MS,
    gcTime: ONE_HOUR_MS,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const state = getGa4DashboardViewState({
    connected,
    isPending: summaryQuery.isPending,
    isError: summaryQuery.isError,
    data: summaryQuery.data,
  });

  if (state.kind === "hidden") return null;

  if (state.kind === "loading") {
    return (
      <div className="contents" aria-busy>
        <Ga4CardSkeleton title="Google Analytics" />
        <Ga4CardSkeleton title="Popular pages & cities" />
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <CardShell
        title="Google Analytics"
        stamp={GA4_STAMP}
        action={
          <SettingsLink projectId={projectId} label="Review connection" />
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-base-content/70">{state.message}</p>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void summaryQuery.refetch()}
          >
            Try again
          </button>
        </div>
      </CardShell>
    );
  }

  const { data } = state;
  return (
    <div className="contents">
      <CardShell
        title="Google Analytics"
        stamp={GA4_STAMP}
        action={<SettingsLink projectId={projectId} label="Change property" />}
      >
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label="Visits"
            value={formatGa4Count(data.metrics.visits)}
            sub={
              data.metrics.visits !== null && data.previous.visits !== null ? (
                <PercentDelta
                  current={data.metrics.visits}
                  previous={data.previous.visits}
                />
              ) : undefined
            }
          />
          <Stat
            label="Conversions"
            value={formatGa4Count(data.metrics.conversions)}
            sub={
              data.metrics.conversions !== null &&
              data.previous.conversions !== null ? (
                <PercentDelta
                  current={data.metrics.conversions}
                  previous={data.previous.conversions}
                />
              ) : undefined
            }
          />
          <Stat
            label="Conversion rate"
            value={formatGa4Rate(data.metrics.conversionRate)}
          />
          <Stat
            label="Engagement rate"
            value={formatGa4Rate(data.metrics.engagementRate)}
          />
        </div>
        {state.summaryUnavailable ? (
          <p className="mt-3 text-xs text-base-content/55">
            Summary metrics are unavailable for this period.
          </p>
        ) : null}
        {data.limitedData.summary ? <LimitedDataNote /> : null}
      </CardShell>

      <CardShell title="Popular pages & cities" stamp={GA4_STAMP}>
        <div className="grid gap-5 sm:grid-cols-2">
          <RankedList
            heading="Popular pages"
            empty={
              data.limitedData.pages
                ? "Page data is unavailable for this period."
                : "No page views were recorded in this period."
            }
            rows={data.topPages.slice(0, 3).map((page) => ({
              key: page.path,
              primary: page.title,
              secondary: page.title === page.path ? undefined : page.path,
              value: formatGa4Count(page.views),
            }))}
          />
          <RankedList
            heading="Top cities"
            empty={
              data.limitedData.cities
                ? "City data is unavailable for this period."
                : "No city visits were recorded in this period."
            }
            rows={data.topCities.slice(0, 3).map((city) => ({
              key: city.city,
              primary: city.city || "Unknown city",
              value: formatGa4Count(city.visits),
            }))}
          />
        </div>
        {data.limitedData.pages || data.limitedData.cities ? (
          <LimitedDataNote />
        ) : null}
      </CardShell>
    </div>
  );
}

function Ga4CardSkeleton({ title }: { title: string }) {
  return (
    <CardShell title={title} stamp={GA4_STAMP}>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="skeleton h-16" />
        ))}
      </div>
    </CardShell>
  );
}

function SettingsLink({
  projectId,
  label,
}: {
  projectId: string;
  label: string;
}) {
  return (
    <Link
      to="/p/$projectId/settings"
      params={{ projectId }}
      hash="google-analytics"
      className={moreDetailsClass}
    >
      {label}
    </Link>
  );
}

function RankedList({
  heading,
  empty,
  rows,
}: {
  heading: string;
  empty: string;
  rows: Array<{
    key: string;
    primary: string;
    secondary?: string;
    value: string;
  }>;
}) {
  return (
    <section className="min-w-0">
      <h3 className="text-xs font-medium uppercase tracking-wide text-base-content/60">
        {heading}
      </h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-base-content/55">
          {empty}
        </p>
      ) : (
        <ol className="mt-2 space-y-2">
          {rows.map((row, index) => (
            <li
              key={row.key}
              className="flex min-w-0 items-start gap-2 text-sm"
            >
              <span className="w-3 shrink-0 text-xs tabular-nums text-base-content/40">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {row.primary}
                </span>
                {row.secondary ? (
                  <span className="block truncate text-xs text-base-content/50">
                    {row.secondary}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums text-base-content/65">
                {row.value}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function LimitedDataNote() {
  return (
    <p className="mt-3 text-[11px] leading-relaxed text-base-content/45">
      Limited data: Google Analytics marked some results as incomplete.
    </p>
  );
}
