import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, MapPin, Plus } from "lucide-react";
import { listLocalTrackers } from "@/serverFunctions/local-seo";
import { localAreaLabel } from "@/shared/local-seo";
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Button } from "@/client/components/ui/button";
import { EmptyState } from "@/client/components/EmptyState";
import { QueryState } from "@/client/components/QueryState";
import { Skeleton } from "@/client/components/ui/skeleton";

export function LocalTrackerList({
  projectId,
  onAdd,
}: {
  projectId: string;
  onAdd: () => void;
}) {
  const query = useQuery({
    queryKey: ["localSeo", projectId, "trackers"],
    queryFn: () => listLocalTrackers({ data: { projectId } }),
  });
  return (
    <Card className="gap-0 py-0">
      <CardHeader className="px-5 pt-4 pb-3">
        <CardTitle>
          <h2 className="text-sm font-semibold">Tracked Businesses</h2>
        </CardTitle>
        <CardAction className="self-center">
          <Button size="sm" onClick={onAdd}>
            <Plus data-icon="inline-start" />
            Add Business
          </Button>
        </CardAction>
      </CardHeader>
      <div className="divide-y divide-border border-t border-border">
        <QueryState
          query={query}
          errorFallback="Failed to load tracked businesses"
          loading={
            <div className="space-y-3 p-5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          }
        >
          {(trackers) =>
            trackers.length === 0 ? (
              <EmptyState
                variant="plain"
                icon={MapPin}
                title="No tracked businesses yet"
                description="Add a Google Maps listing to check keyword rankings across the surrounding area."
              />
            ) : (
              trackers.map((tracker) => (
                <Link
                  key={tracker.id}
                  to="/p/$projectId/local-seo/$trackerId"
                  params={{ projectId, trackerId: tracker.id }}
                  search={{}}
                  className="flex w-full items-center gap-4 px-5 py-3.5 transition-colors hover:bg-foreground/[0.03]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{tracker.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {tracker.address}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {localAreaLabel(tracker)} · Mobile
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))
            )
          }
        </QueryState>
      </div>
    </Card>
  );
}
