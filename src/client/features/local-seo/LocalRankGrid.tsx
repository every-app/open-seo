import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { type LocalPointStatus, type LocalGridPoint } from "@/shared/local-seo";
import { Card, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Skeleton } from "@/client/components/ui/skeleton";

const MapView = lazy(() => import("./LocalRankMap"));
export type LocalGridDisplayPoint = LocalGridPoint & {
  id: string;
  status: LocalPointStatus;
  rank: number | null;
  resultsCount: number | null;
};

export function LocalRankGrid({
  projectId,
  points,
  selectedPointId,
  onSelect,
  preview,
}: {
  projectId: string;
  points: LocalGridDisplayPoint[];
  selectedPointId?: string;
  onSelect: (id: string) => void;
  preview: boolean;
}) {
  return (
    <Card className="h-full min-h-0 min-w-0 gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="shrink-0 items-center gap-2 px-4 py-3">
        <CardTitle className="text-sm">
          {preview ? "Grid preview" : "Maps rankings"}
        </CardTitle>
      </CardHeader>
      <div className="min-h-0 flex-1 overflow-hidden border-t border-border">
        <ClientOnly fallback={<Skeleton className="h-full rounded-none" />}>
          <Suspense fallback={<Skeleton className="h-full rounded-none" />}>
            <MapView
              key={points.map((point) => point.id).join(",")}
              projectId={projectId}
              points={points}
              selectedPointId={selectedPointId}
              onSelect={onSelect}
              preview={preview}
            />
          </Suspense>
        </ClientOnly>
      </div>
      <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <span>
          <span className="mr-1 inline-block size-2 rounded-full bg-green-600" />
          1–3
        </span>
        <span>
          <span className="mr-1 inline-block size-2 rounded-full bg-amber-600" />
          4–10
        </span>
        <span>
          <span className="mr-1 inline-block size-2 rounded-full bg-red-600" />
          11–20
        </span>
        <span>– Not found</span>
        <span>! Failed</span>
      </div>
    </Card>
  );
}
