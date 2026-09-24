import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sort } from "remeda";
import { DashboardOnboarding } from "./DashboardOnboarding";
import {
  AuditHealthCard,
  BacklinkPulseCard,
  GscCard,
} from "@/client/features/dashboard/DashboardCards";
import { DashboardMetrics } from "@/client/features/dashboard/DashboardMetrics";
import { Ga4Card } from "@/client/features/dashboard/Ga4Card";
import { WorkspaceMergeBanner } from "@/client/features/dashboard/WorkspaceMergeBanner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  getDashboardActivation,
  getDashboardOverview,
  refreshDashboardBacklinkSnapshot,
} from "@/serverFunctions/dashboard";

import { Alert } from "@/client/components/ui/alert";
import { buttonVariants } from "@/client/components/ui/button";
import { Skeleton } from "@/client/components/ui/skeleton";
export function DashboardPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();

  const activationQuery = useQuery({
    queryKey: ["dashboardActivation", projectId],
    queryFn: () => getDashboardActivation({ data: { projectId } }),
  });
  const overviewQuery = useQuery({
    queryKey: ["dashboardOverview", projectId],
    queryFn: () => getDashboardOverview({ data: { projectId } }),
  });

  const activation = activationQuery.data;
  const overview = overviewQuery.data;

  // Visit-triggered backlink snapshot: fire once per page view when the
  // overview reports a missing or stale snapshot for a project with a domain.
  // The server re-checks freshness, so a stray double-fire costs nothing.
  const refreshMutation = useMutation({
    mutationFn: () => refreshDashboardBacklinkSnapshot({ data: { projectId } }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["dashboardOverview", projectId],
      }),
  });
  const refreshFiredRef = useRef(false);
  const needsSnapshot =
    activation?.domain != null &&
    overview !== undefined &&
    (overview.backlinks === null || overview.backlinks.stale);
  useEffect(() => {
    if (!needsSnapshot || refreshFiredRef.current) return;
    refreshFiredRef.current = true;
    refreshMutation.mutate();
  }, [needsSnapshot, refreshMutation]);

  if (activationQuery.isError) {
    return (
      <div className="px-4 py-4 md:px-6 md:py-6">
        <Alert variant="destructive">
          {getStandardErrorMessage(activationQuery.error)}
        </Alert>
      </div>
    );
  }

  // Wait for the overview too: rendering cards from `overview === undefined`
  // flashes their empty states (and reshuffles the data-first sort) once the
  // real data lands. An overview error falls through so the page still loads.
  if (!activation || overviewQuery.isPending) {
    return (
      <div
        className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8"
        aria-busy
      >
        <Skeleton className="h-9 w-52" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  const showBacklinks = activation.domain !== null;
  const gscConnected = activation.gsc.connected;
  const ga4Connected = activation.ga4.connected;

  const cards = [
    ...(gscConnected
      ? [
          {
            key: "gsc",
            hasData: true,
            node: <GscCard projectId={projectId} connected />,
          },
        ]
      : []),
    ...(ga4Connected || !activation.ga4.cardDismissedAt
      ? [
          {
            key: "ga4",
            hasData: ga4Connected,
            node: <Ga4Card projectId={projectId} connected={ga4Connected} />,
          },
        ]
      : []),
    {
      key: "audit",
      hasData: overview?.audit != null,
      node: (
        <AuditHealthCard
          projectId={projectId}
          audit={overview?.audit ?? null}
        />
      ),
    },
    ...(showBacklinks
      ? [
          {
            key: "backlinks",
            hasData: overview?.backlinks != null || refreshMutation.isPending,
            node: (
              <BacklinkPulseCard
                projectId={projectId}
                backlinks={overview?.backlinks ?? null}
                refreshing={refreshMutation.isPending}
              />
            ),
          },
        ]
      : []),
  ];

  const sortedCards = sort(
    cards,
    (a, b) => Number(b.hasData) - Number(a.hasData),
  );
  const dataCards = sortedCards.filter((card) => card.hasData);
  const setupCards = sortedCards.filter((card) => !card.hasData);
  const onboarding = (
    <DashboardOnboarding
      key={projectId}
      projectId={projectId}
      activation={activation}
    />
  );

  return (
    <div className="px-4 py-6 pb-24 md:px-8 md:py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {activation.domain
                ? `Search health for ${activation.domain}`
                : "Add your website to see its search health."}
            </p>
          </div>
          {overview?.audit ? (
            <Link
              to="/p/$projectId/audit"
              params={{ projectId }}
              className={buttonVariants()}
            >
              Open site audit
            </Link>
          ) : (
            <Link
              to="/p/$projectId/audit"
              params={{ projectId }}
              className={buttonVariants()}
            >
              Run a site audit
            </Link>
          )}
        </header>

        <WorkspaceMergeBanner />

        <DashboardMetrics overview={overview} />

        {dataCards.length > 0 ? (
          // Data leads in the wide column; setup work sits in the side column.
          <div className="grid items-start gap-6 lg:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
              {dataCards.map((card) => (
                <div key={card.key}>{card.node}</div>
              ))}
            </div>
            <div className="flex min-w-0 flex-col gap-6">
              {onboarding}
              {setupCards.map((card) => (
                <div key={card.key}>{card.node}</div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {onboarding}
            <div className="grid items-start gap-6 lg:grid-cols-2">
              {setupCards.map((card) => (
                <div key={card.key}>{card.node}</div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
