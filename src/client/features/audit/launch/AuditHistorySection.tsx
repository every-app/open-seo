import { Link } from "@tanstack/react-router";
import { ScanSearch, Trash2 } from "lucide-react";
import type { getAuditHistory } from "@/serverFunctions/audit";
import { PortalMenu } from "@/client/components/PortalMenu";
import { formatDate, StatusBadge } from "@/client/features/audit/shared";

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
        <div className="text-center text-base-content/40 space-y-3">
          <ScanSearch className="size-12 mx-auto opacity-30" />
          <p className="text-lg font-medium">暂无审计记录</p>
        </div>
      </div>
    );
  }

  if (history.length === 0) return null;

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-3">
        <h2 className="card-title text-base">历史审计</h2>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>日期</th>
                <th>网址</th>
                <th>状态</th>
                <th>页面</th>
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
                      <span className="badge badge-ghost badge-xs">是</span>
                    ) : null}
                  </td>
                  <td>
                    <HistoryActions
                      projectId={projectId}
                      auditId={audit.id}
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
        className="btn btn-primary btn-xs"
      >
        查看
      </Link>
      <PortalMenu ariaLabel="审计操作">
        {(close) => (
          <li>
            <button
              className="text-error"
              onClick={() => {
                close();
                onDelete(auditId);
              }}
            >
              <Trash2 className="size-3.5" />
              删除审计
            </button>
          </li>
        )}
      </PortalMenu>
    </div>
  );
}
