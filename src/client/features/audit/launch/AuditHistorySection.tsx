import { Link } from "@tanstack/react-router";
import { ScanSearch, Trash2 } from "@/client/components/icons";
import type { getAuditHistory } from "@/serverFunctions/audit";
import { PortalMenu } from "@/client/components/PortalMenu";
import { formatDate, StatusBadge } from "@/client/features/audit/shared";

import { Badge } from "@/client/components/ui/badge";
import { buttonVariants } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
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
import { DropdownMenuItem } from "@/client/components/ui/dropdown-menu";
export function AuditHistorySection({
  projectId,
  history,
  isLoading,
  onDelete,
}: {
  projectId: string;
  history: Awaited<ReturnType<typeof getAuditHistory>>;
  isLoading: boolean;
  onDelete: (auditId: string) => void;
}) {
  if (history.length === 0 && !isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center text-muted-foreground space-y-3">
          <ScanSearch className="size-12 mx-auto opacity-30" />
          <p className="text-lg font-medium">No audits yet</p>
        </div>
      </div>
    );
  }

  if (history.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Previous Audits</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pages</TableHead>
                <TableHead>Lighthouse</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((audit) => (
                <TableRow key={audit.id} className="group">
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(audit.startedAt)}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate">
                    {audit.startUrl}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={audit.status} />
                  </TableCell>
                  <TableCell>
                    {audit.pagesTotal || audit.pagesCrawled}
                  </TableCell>
                  <TableCell>
                    {audit.ranLighthouse ? (
                      <Badge variant="secondary" className="px-2 text-[11px]">
                        Yes
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <HistoryActions
                      projectId={projectId}
                      auditId={audit.id}
                      onDelete={onDelete}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryActions({
  projectId,
  auditId,
  onDelete,
}: {
  projectId: string;
  auditId: string;
  onDelete: (auditId: string) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
      <Link
        to="/p/$projectId/audit"
        params={{ projectId }}
        search={{ auditId, tab: "pages" }}
        className={buttonVariants({ size: "sm", className: "h-7 px-2.5" })}
      >
        View
      </Link>
      <PortalMenu ariaLabel="Audit actions">
        {(close) => (
          <DropdownMenuItem
            className="text-negative"
            onClick={() => {
              close();
              onDelete(auditId);
            }}
          >
            <Trash2 className="size-3.5" />
            Delete audit
          </DropdownMenuItem>
        )}
      </PortalMenu>
    </div>
  );
}
