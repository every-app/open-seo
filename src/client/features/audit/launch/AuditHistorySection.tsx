import { MoreHorizontal, ScanSearch, Trash2 } from "lucide-react";
import type { getAuditHistory } from "@/serverFunctions/audit";
import { formatDate, StatusBadge } from "@/client/features/audit/shared";

export function AuditHistorySection({
  history,
  isLoading,
  onView,
  onDelete,
}: {
  history: Awaited<ReturnType<typeof getAuditHistory>>;
  isLoading: boolean;
  onView: (auditId: string) => void;
  onDelete: (auditId: string) => void;
}) {
  if (history.length === 0 && !isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center text-base-content/40 space-y-3">
          <ScanSearch className="size-12 mx-auto opacity-30" />
          <p className="text-lg font-medium">No audits yet</p>
        </div>
      </div>
    );
  }

  if (history.length === 0) return null;

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <h2 className="card-title text-base">Previous Audits</h2>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Date</th>
                <th>URL</th>
                <th>Status</th>
                <th>Pages</th>
                <th>Lighthouse</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((audit) => (
                <tr key={audit.id} className="hover group">
                  <td className="text-xs text-base-content/70">
                    {formatDate(audit.startedAt)}
                  </td>
                  <td className="max-w-[220px] truncate">{audit.startUrl}</td>
                  <td>
                    <StatusBadge status={audit.status} />
                  </td>
                  <td>{audit.pagesTotal || audit.pagesCrawled}</td>
                  <td>
                    {audit.ranLighthouse ? (
                      <span className="badge badge-ghost badge-xs">Yes</span>
                    ) : null}
                  </td>
                  <td>
                    <HistoryActions
                      auditId={audit.id}
                      onView={onView}
                      onDelete={onDelete}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function HistoryActions({
  auditId,
  onView,
  onDelete,
}: {
  auditId: string;
  onView: (auditId: string) => void;
  onDelete: (auditId: string) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
      <button
        className="btn btn-primary btn-xs"
        onClick={() => onView(auditId)}
      >
        View
      </button>
      <div className="dropdown dropdown-end">
        <div
          tabIndex={0}
          role="button"
          className="btn btn-ghost btn-xs btn-square"
          aria-label="Audit actions"
        >
          <MoreHorizontal className="size-3.5" />
        </div>
        <ul
          tabIndex={0}
          className="dropdown-content z-10 menu p-2 shadow-lg bg-base-100 border border-base-300 rounded-box w-40"
        >
          <li>
            <button
              className="text-error"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(auditId);
              }}
            >
              <Trash2 className="size-3.5" />
              Delete audit
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
