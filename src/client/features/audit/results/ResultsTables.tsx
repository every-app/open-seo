import { ChevronDown, Download, ExternalLink } from "lucide-react";
import {
  extractPathname,
  HttpStatusBadge,
  PsiScoreBadge,
} from "@/client/features/audit/shared";
import type { AuditResultsData } from "@/client/features/audit/results/types";

export function PagesTable({ pages }: { pages: AuditResultsData["pages"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>URL</th>
            <th>Status</th>
            <th>Title</th>
            <th>H1</th>
            <th>Words</th>
            <th>Images</th>
            <th>Speed</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => (
            <tr key={page.id}>
              <td className="max-w-[200px] truncate">
                <a
                  href={page.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link link-primary text-xs inline-flex items-center gap-1"
                >
                  {extractPathname(page.url)}
                  <ExternalLink className="size-3" />
                </a>
              </td>
              <td>
                <HttpStatusBadge code={page.statusCode} />
              </td>
              <td className="max-w-[180px] truncate" title={page.title ?? ""}>
                {page.title || (
                  <span className="text-error text-xs">missing</span>
                )}
              </td>
              <td>{page.h1Count}</td>
              <td>{page.wordCount}</td>
              <td>
                {page.imagesMissingAlt > 0 ? (
                  <span className="text-warning">
                    {page.imagesMissingAlt}/{page.imagesTotal}
                  </span>
                ) : (
                  page.imagesTotal
                )}
              </td>
              <td className="text-xs">
                {page.responseTimeMs ? `${page.responseTimeMs}ms` : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PerformanceTable({
  projectId,
  psi,
  pages,
}: {
  projectId: string;
  psi: AuditResultsData["psi"];
  pages: AuditResultsData["pages"];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>URL</th>
            <th>Device</th>
            <th>Status</th>
            <th>Perf</th>
            <th>A11y</th>
            <th>SEO</th>
            <th>LCP</th>
            <th>CLS</th>
            <th>INP</th>
            <th>TTFB</th>
            <th>Issues</th>
          </tr>
        </thead>
        <tbody>
          {psi.map((result) => (
            <PerformanceRow
              key={result.id}
              projectId={projectId}
              result={result}
              page={pages.find((candidate) => candidate.id === result.pageId)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PerformanceRow({
  projectId,
  result,
  page,
}: {
  projectId: string;
  result: AuditResultsData["psi"][number];
  page: AuditResultsData["pages"][number] | undefined;
}) {
  const isFailed = !!result.errorMessage;

  return (
    <tr>
      <td className="max-w-[160px] truncate text-xs">
        {page ? extractPathname(page.url) : "-"}
      </td>
      <td className="capitalize text-xs">{result.strategy}</td>
      <td>
        {isFailed ? (
          <span
            className="badge badge-error badge-outline text-xs"
            title={result.errorMessage ?? "PSI check failed"}
          >
            failed
          </span>
        ) : (
          <span className="badge badge-success badge-outline text-xs">ok</span>
        )}
      </td>
      <td>
        <PsiScoreBadge score={result.performanceScore} />
      </td>
      <td>
        <PsiScoreBadge score={result.accessibilityScore} />
      </td>
      <td>
        <PsiScoreBadge score={result.seoScore} />
      </td>
      <td className="text-xs">
        {result.lcpMs ? `${(result.lcpMs / 1000).toFixed(1)}s` : "-"}
      </td>
      <td className="text-xs">
        {result.cls != null ? result.cls.toFixed(3) : "-"}
      </td>
      <td className="text-xs">
        {result.inpMs ? `${Math.round(result.inpMs)}ms` : "-"}
      </td>
      <td className="text-xs">
        {result.ttfbMs ? `${Math.round(result.ttfbMs)}ms` : "-"}
      </td>
      <td>
        {result.r2Key ? (
          <a
            className="btn btn-primary btn-xs"
            href={`/p/${projectId}/audit/issues/${result.id}?category=performance`}
          >
            View issues
          </a>
        ) : (
          <span className="text-xs text-base-content/40">-</span>
        )}
      </td>
    </tr>
  );
}

export function ExportDropdown({
  onExport,
}: {
  onExport: (format: "csv" | "json") => void;
}) {
  return (
    <div className="dropdown dropdown-end">
      <div tabIndex={0} role="button" className="btn btn-sm btn-ghost gap-1">
        <Download className="size-4" />
        Export
        <ChevronDown className="size-3 opacity-60" />
      </div>
      <ul
        tabIndex={0}
        className="dropdown-content z-10 menu p-2 shadow-lg bg-base-100 border border-base-300 rounded-box w-40"
      >
        <li>
          <button onClick={() => onExport("csv")}>CSV</button>
        </li>
        <li>
          <button onClick={() => onExport("json")}>JSON</button>
        </li>
      </ul>
    </div>
  );
}
