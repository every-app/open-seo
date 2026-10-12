import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getAiVisibilityResults } from "@/serverFunctions/ai-visibility";
import type { AiEngine, AiTrackerState } from "@/shared/ai-visibility";
import { SkeletonTableRows } from "@/client/components/SkeletonPresets";
import { DataTableToolbar } from "@/client/components/table/DataTableToolbar";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { EngineFilter } from "./EngineFilter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { DomainFavicon } from "./DomainFavicon";
import { SuggestedCompetitors } from "./SuggestedCompetitors";
import { AiQueryError, aiVisibilityKey } from "./shared";

export function CompetitorsTab({
  projectId,
  state,
  runId,
  collecting,
}: {
  projectId: string;
  state: AiTrackerState;
  runId: string | undefined;
  collecting: boolean;
}) {
  const [selectedEngines, setSelectedEngines] = useState<AiEngine[] | null>(
    null,
  );
  const engines = selectedEngines ?? state.engines;
  const query = useQuery({
    queryKey: [
      ...aiVisibilityKey(projectId),
      "results",
      "competitors",
      runId,
      engines,
    ],
    queryFn: () =>
      getAiVisibilityResults({
        data: { projectId, runId, engines, limit: 1 },
      }),
    enabled: Boolean(runId),
  });
  const rows = runId
    ? (query.data?.summaries ?? []).map((summary) => ({ ...summary, summary }))
    : state.brands
        .filter((brand) => !brand.own)
        .map((brand) => ({ ...brand, summary: null }));
  return (
    <>
      <DataTableToolbar
        actions={
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link to="/p/$projectId/context" params={{ projectId }} />}
          >
            Manage competitors
          </Button>
        }
      >
        {runId && state.engines.length > 1 && (
          <EngineFilter
            label="Filter engine"
            engines={state.engines}
            value={engines}
            onChange={setSelectedEngines}
          />
        )}
      </DataTableToolbar>
      {runId && query.isPending ? (
        <SkeletonTableRows rows={4} columns={4} className="p-4" />
      ) : query.isError ? (
        <AiQueryError error={query.error} />
      ) : runId && !rows.length ? (
        <p className="p-10 text-center text-sm text-muted-foreground">
          {collecting
            ? "Collecting answers. Brands appear here as answers arrive."
            : "No answers match these filters."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Brand</TableHead>
              <TableHead>Mentioned in</TableHead>
              <TableHead>Cited in</TableHead>
              <TableHead>Avg. position</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ name, domain, own, summary }) => (
              <TableRow key={domain}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <DomainFavicon domain={domain} />
                    {name}
                    {own && (
                      <Badge variant="secondary" className="ml-2">
                        You
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  {summary ? share(summary.mentions, summary.answers) : "—"}
                </TableCell>
                <TableCell>
                  {summary ? share(summary.citations, summary.answers) : "—"}
                </TableCell>
                <TableCell>
                  {summary?.positionCount
                    ? (summary.positionTotal / summary.positionCount).toFixed(1)
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-8 text-center text-muted-foreground"
                >
                  No competitors saved yet. Use Manage competitors to add them.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
      {!runId && (
        <p className="border-t border-border p-4 text-sm text-muted-foreground">
          Run{" "}
          <Link
            to="/p/$projectId/ai-visibility"
            params={{ projectId }}
            className="text-foreground underline underline-offset-4"
          >
            prompt tracking
          </Link>{" "}
          to see how often AI answers mention and cite your competitors.
        </p>
      )}
      {runId && (
        <SuggestedCompetitors
          projectId={projectId}
          state={state}
          runId={runId}
        />
      )}
    </>
  );
}

function share(count: number, total: number) {
  return total
    ? `${count} / ${total} (${Math.round((count / total) * 100)}%)`
    : "No answers";
}
