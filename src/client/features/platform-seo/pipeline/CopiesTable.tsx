import { Link } from "@tanstack/react-router";
import { Radar } from "lucide-react";
import { EmptyState } from "@/client/components/EmptyState";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { formatRelativeTime } from "@/client/lib/relative-time";
import { PS_TRACKING_DEPTH } from "@/shared/platform-seo";
import { type PipelineData, useStartChecks } from "./useStartChecks";

type Copy = PipelineData["copies"][number];

export function CopiesTable({
  projectId,
  data,
}: {
  projectId: string;
  data: PipelineData;
}) {
  const start = useStartChecks(projectId);
  if (data.copies.length === 0) {
    return (
      <EmptyState
        icon={Radar}
        title="Nothing published yet"
        description="Published copies show up here with whether Google has indexed them, where they rank for their keyword, and whether AI answers cite them."
      />
    );
  }
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        Published copies ({data.copies.length})
      </h2>
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Copy</TableHead>
              <TableHead className="w-28">Indexed</TableHead>
              <TableHead className="w-40">Google</TableHead>
              <TableHead className="w-24">AI cited</TableHead>
              <TableHead className="w-36 text-right">Checked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.copies.map((copy) => (
              <TableRow key={copy.syndicationId}>
                <TableCell className="align-top whitespace-normal">
                  <Link
                    to="/p/$projectId/topics/$topicId/publish"
                    params={{ projectId, topicId: copy.topicId }}
                    className="font-medium hover:underline"
                  >
                    {copy.title}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {copy.channelName}
                    {copy.liveUrl ? (
                      <>
                        {" · "}
                        <SafeExternalLink
                          url={copy.liveUrl}
                          label="view"
                          className="hover:underline"
                        />
                      </>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <YesNo value={copy.lastCheck?.indexed} />
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <GoogleCell copy={copy} />
                </TableCell>
                <TableCell className="align-top">
                  <YesNo value={copy.lastCheck?.aiCited} />
                </TableCell>
                <TableCell className="align-top text-right">
                  <div className="flex flex-col items-end gap-1">
                    {copy.lastCheckFailed && !copy.checking ? (
                      <Badge variant="warning">Last check failed</Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      {copy.lastCheck?.checkedAt
                        ? formatRelativeTime(copy.lastCheck.checkedAt)
                        : "Never"}
                    </span>
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={copy.checking || start.starting}
                      onClick={() => start.mutate([copy.syndicationId])}
                    >
                      {copy.checking ? "Checking…" : "Check"}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </section>
  );
}

function YesNo({ value }: { value: boolean | null | undefined }) {
  if (value === true) return <Badge variant="success">Yes</Badge>;
  if (value === false) return <Badge variant="outline">Not yet</Badge>;
  return <span className="text-muted-foreground">—</span>;
}

function GoogleCell({ copy }: { copy: Copy }) {
  const check = copy.lastCheck;
  if (!check) return <span className="text-muted-foreground">—</span>;
  if (!check.keyword) {
    return (
      <span className="text-xs text-muted-foreground">No target keyword</span>
    );
  }
  return (
    <div className="flex flex-col">
      <span className="tabular-nums">
        {check.ranked === null ? (
          <span className="text-muted-foreground">Couldn't read</span>
        ) : check.googlePosition !== null ? (
          <>
            #{check.googlePosition}
            <span className="text-muted-foreground">
              {" "}
              · page {Math.ceil(check.googlePosition / 10)}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            Not in top {PS_TRACKING_DEPTH}
          </span>
        )}
      </span>
      <span className="text-xs text-muted-foreground">
        for “{check.keyword}”
      </span>
    </div>
  );
}
