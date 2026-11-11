import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, MapPin, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteLocalTracker,
  listLocalTrackers,
} from "@/serverFunctions/local-seo";
import { localAreaLabel } from "@/shared/local-seo";
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Button } from "@/client/components/ui/button";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { EmptyState } from "@/client/components/EmptyState";
import { QueryState } from "@/client/components/QueryState";
import { Skeleton } from "@/client/components/ui/skeleton";

type Tracker = Awaited<ReturnType<typeof listLocalTrackers>>[number];

export function LocalTrackerList({
  projectId,
  onAdd,
}: {
  projectId: string;
  onAdd: () => void;
}) {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<Tracker | null>(null);
  const query = useQuery({
    queryKey: ["localSeo", projectId, "trackers"],
    queryFn: () => listLocalTrackers({ data: { projectId } }),
  });
  const remove = useMutation({
    mutationFn: (trackerId: string) =>
      deleteLocalTracker({ data: { projectId, trackerId } }),
    onSuccess: async ({ deleted }, trackerId) => {
      if (!deleted) {
        toast.error(
          "Wait for the current check to finish, then delete this business.",
        );
        return;
      }
      // Drop the detail entry too, or a later visit to that URL renders the
      // deleted business from cache before the refetch fails.
      queryClient.removeQueries({
        queryKey: ["localSeo", projectId, "tracker", trackerId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["localSeo", projectId, "trackers"],
      });
      setDeleteTarget(null);
      toast.success("Business deleted");
    },
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
                <div
                  key={tracker.id}
                  className="relative flex w-full items-center gap-4 px-5 py-3.5 transition-colors hover:bg-foreground/[0.03]"
                >
                  <Link
                    to="/p/$projectId/local-seo/$trackerId"
                    params={{ projectId, trackerId: tracker.id }}
                    search={{}}
                    className="absolute inset-0 z-0"
                    aria-label={`Open ${tracker.title}`}
                  />
                  <div className="pointer-events-none min-w-0 flex-1">
                    <p className="truncate font-medium">{tracker.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {tracker.address}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {localAreaLabel(tracker)} · Mobile
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="relative z-10 text-muted-foreground hover:text-destructive"
                    title="Delete business"
                    aria-label={`Delete ${tracker.title}`}
                    onClick={() => setDeleteTarget(tracker)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  <ChevronRight className="pointer-events-none size-4 shrink-0 text-muted-foreground" />
                </div>
              ))
            )
          }
        </QueryState>
      </div>
      {deleteTarget && (
        <ConfirmDialog
          title={`Delete ${deleteTarget.title}?`}
          confirmLabel="Delete"
          destructive
          pending={remove.isPending}
          onConfirm={() => remove.mutate(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
        >
          Its keywords and ranking history are deleted too. This cannot be
          undone.
        </ConfirmDialog>
      )}
    </Card>
  );
}
