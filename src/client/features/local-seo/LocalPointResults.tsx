import type { getLocalScan } from "@/serverFunctions/local-seo";
import { EmptyState } from "@/client/components/EmptyState";
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { LocalPointStatus } from "@/shared/local-seo";
import type { LocalGridDisplayPoint } from "./LocalRankGrid";

type PointResult = Awaited<ReturnType<typeof getLocalScan>>["results"][number];

export function LocalPointResults({
  point,
  results,
  cid,
  placeId,
  gridSize,
  spacingKm,
}: {
  point: LocalGridDisplayPoint;
  results: PointResult[];
  cid: string | null;
  placeId: string | null;
  gridSize: number;
  spacingKm: number;
}) {
  return (
    <Card className="h-full min-h-0 min-w-0 gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="shrink-0 items-center gap-2 px-4 py-3">
        <CardTitle className="text-sm">Results</CardTitle>
        <CardAction className="row-span-1 self-center text-xs text-muted-foreground">
          {searchedFrom(point, gridSize, spacingKm)}
        </CardAction>
      </CardHeader>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border">
        {point.status !== LocalPointStatus.Completed ? (
          <EmptyState
            variant="plain"
            title={
              point.status === LocalPointStatus.Pending
                ? "Search pending"
                : "Search failed"
            }
            description={
              point.status === LocalPointStatus.Pending
                ? "The saved scan will update when results arrive."
                : "This point has no ranking result. Other points remain available."
            }
          />
        ) : results.length === 0 ? (
          <EmptyState
            variant="plain"
            title="No listings returned"
            description="Google Maps returned no businesses at this coordinate."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Reviews</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((result) => (
                <TableRow
                  key={result.id}
                  data-state={
                    (cid != null && result.cid === cid) ||
                    (placeId != null && result.placeId === placeId)
                      ? "selected"
                      : undefined
                  }
                >
                  <TableCell className="font-mono">{result.rank}</TableCell>
                  <TableCell>
                    <p className="font-medium">{result.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {result.address}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs">
                    <p>{result.rating == null ? "—" : `${result.rating} ★`}</p>
                    <p className="text-muted-foreground">
                      {result.reviews?.toLocaleString() ?? "—"}
                    </p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </Card>
  );
}

/** Where a point's search ran, e.g. "Searched 2 km north, 2 km west of your listing". */
function searchedFrom(
  point: LocalGridDisplayPoint,
  gridSize: number,
  spacingKm: number,
) {
  const center = (gridSize - 1) / 2;
  const north = (center - point.row) * spacingKm;
  const east = (point.col - center) * spacingKm;
  const parts = [
    north && `${Math.abs(north)} km ${north > 0 ? "north" : "south"}`,
    east && `${Math.abs(east)} km ${east > 0 ? "east" : "west"}`,
  ].filter(Boolean);
  return parts.length
    ? `Searched ${parts.join(", ")} of your listing`
    : "Searched from your listing";
}
