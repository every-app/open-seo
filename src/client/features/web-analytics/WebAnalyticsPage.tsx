import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { QueryState } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  disableWebAnalytics,
  enableWebAnalytics,
  getWebAnalyticsSite,
} from "@/serverFunctions/webAnalytics";
import type { WebAnalyticsPeriod } from "@/types/schemas/web-analytics";
import { WebAnalyticsDashboard } from "./WebAnalyticsDashboard";

function snippetFor(siteId: string): string {
  const origin = window.location.origin;
  return `<script defer data-site-id="${siteId}" src="${origin}/analytics/script.js"></script>`;
}

export function WebAnalyticsPage({
  projectId,
  period,
  onPeriodChange,
}: {
  projectId: string;
  period: WebAnalyticsPeriod;
  onPeriodChange: (period: WebAnalyticsPeriod) => void;
}) {
  const queryClient = useQueryClient();
  const siteQuery = useQuery({
    queryKey: ["webAnalyticsSite", projectId],
    queryFn: () => getWebAnalyticsSite({ data: { projectId } }),
  });
  const invalidateSite = () => {
    void queryClient.invalidateQueries({
      queryKey: ["webAnalyticsSite", projectId],
    });
  };

  const enableMutation = useMutation({
    mutationFn: () => enableWebAnalytics({ data: { projectId } }),
    onSuccess: invalidateSite,
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });
  const disableMutation = useMutation({
    mutationFn: () => disableWebAnalytics({ data: { projectId } }),
    onSuccess: () => {
      invalidateSite();
      void queryClient.invalidateQueries({ queryKey: ["webAnalytics"] });
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  return (
    <QueryState query={siteQuery} errorFallback="Could not load web analytics.">
      {(site) =>
        site.enabled ? (
          <WebAnalyticsDashboard
            projectId={projectId}
            snippet={snippetFor(site.siteId ?? "")}
            period={period}
            onPeriodChange={onPeriodChange}
            onDisable={() => {
              if (
                window.confirm(
                  "Disable web analytics? All collected visitor data for this project is deleted.",
                )
              ) {
                disableMutation.mutate();
              }
            }}
            disabling={disableMutation.isPending}
          />
        ) : (
          <Card size="lg">
            <CardHeader>
              <CardTitle>Web Analytics</CardTitle>
              <CardDescription>
                See who visits your site, where they come from, and which pages
                they read — measured from your own domain, no cookies banner
                required.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Enable tracking for this project&apos;s site, then add one
                script tag to your pages. No personal data is collected: no
                cookies beyond an anonymous visitor id, no IP addresses, no
                fingerprints.
              </p>
              <Button
                onClick={() => enableMutation.mutate()}
                disabled={enableMutation.isPending}
              >
                {enableMutation.isPending
                  ? "Enabling…"
                  : "Enable web analytics"}
              </Button>
            </CardContent>
          </Card>
        )
      }
    </QueryState>
  );
}
