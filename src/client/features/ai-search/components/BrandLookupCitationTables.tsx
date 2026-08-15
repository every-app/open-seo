import { useState } from "react";
import { createColumnHelper, type Table } from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Sparkles } from "lucide-react";
import { AppDataTable } from "@/client/components/table/AppDataTable";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { HeaderHelpLabel } from "@/client/features/keywords/components";
import { numericNullsLast } from "@/client/components/table/nullSafeSort";
import {
  formatCount,
  PLATFORM_DOT_CLASS,
  PLATFORM_SHORT_LABEL,
} from "@/client/features/ai-search/platformLabels";
import { formatUrlForDisplay } from "@/client/components/table/url";
import type { BrandLookupResult } from "@/types/schemas/ai-search";

type TopPageRow = BrandLookupResult["topPages"][number];
type TopQueryRow = BrandLookupResult["topQueries"][number];
type PlatformKey = TopPageRow["platform"];

/** Uppercase column header with a hover/focus popover explaining the column. */
function HeaderWithHelp({
  label,
  helpText,
}: {
  label: string;
  helpText: string;
}) {
  return (
    <span className="uppercase tracking-wider">
      <HeaderHelpLabel label={label} helpText={helpText} />
    </span>
  );
}

const PLATFORM_HELP = "生成回答的 AI 平台：ChatGPT 或 Google AI 摘要。";

/**
 * Platform indicator used only when a table actually spans >1 platform. A dot +
 * short label replaces the old full-width pill that repeated identically on
 * every row.
 */
function PlatformCell({ platform }: { platform: PlatformKey }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-base-content/70">
      <span
        className={`size-1.5 rounded-full ${PLATFORM_DOT_CLASS[platform]}`}
      />
      {PLATFORM_SHORT_LABEL[platform]}
    </span>
  );
}

function urlPath(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const path = `${url.pathname}${url.search}`;
    return path === "/" ? "" : path;
  } catch {
    return "";
  }
}

function normalizeDomain(value: string): string {
  return value.replace(/^www\./i, "").toLowerCase();
}

/**
 * The lookup targets a domain with include_subdomains, so the target's own
 * pages can surface under any subdomain (docs.acme.com for acme.com) — those
 * must get the "You" badge too.
 */
function isTargetDomain(domain: string, targetDomain: string): boolean {
  const candidate = normalizeDomain(domain);
  const target = normalizeDomain(targetDomain);
  return candidate === target || candidate.endsWith(`.${target}`);
}

/** Domain-led cited page: bold domain + truncated path, links out. */
function PageUrlCell({
  row,
  targetDomain,
}: {
  row: TopPageRow;
  targetDomain: string | null;
}) {
  const path = urlPath(row.url);
  const isOwn =
    targetDomain != null &&
    row.domain != null &&
    isTargetDomain(row.domain, targetDomain);

  return (
    <a
      href={row.url}
      target="_blank"
      rel="noreferrer"
      className="group block max-w-xl"
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="font-medium text-base-content group-hover:underline">
          {row.domain ?? formatUrlForDisplay(row.url)}
        </span>
        {isOwn ? (
          <span className="badge badge-primary badge-xs border-0">您</span>
        ) : null}
        <ExternalLink className="size-3 shrink-0 text-base-content/40" />
      </span>
      {path ? (
        <span className="block truncate text-xs text-base-content/50">
          {path}
        </span>
      ) : null}
    </a>
  );
}

/**
 * The prompts (keywords) whose answers cited this page. Shows the top 3 inline;
 * if there are more, a "+N more" toggle reveals the rest. Each prompt links into
 * Prompt Explorer prefilled with it.
 */
function KeywordsCell({
  keywords,
  projectId,
  brand,
}: {
  keywords: TopPageRow["keywords"];
  projectId: string;
  brand: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (keywords.length === 0) {
    return <span className="text-base-content/40">—</span>;
  }

  const visible = expanded ? keywords : keywords.slice(0, 3);
  const remaining = keywords.length - visible.length;

  return (
    <div className="space-y-1">
      <ul className="space-y-0.5">
        {visible.map((keyword) => (
          <li key={keyword.question}>
            <Link
              to="/p/$projectId/prompt-explorer"
              params={{ projectId }}
              search={{ q: keyword.question, hb: brand || undefined }}
              className="group/kw inline-flex items-baseline gap-2 text-xs"
              title="在提示词探索中运行"
            >
              <span className="text-base-content/80 group-hover/kw:underline">
                {keyword.question}
              </span>
              <span
                className="shrink-0 tabular-nums text-base-content/40"
                title="已获取样本中的提示词搜索量"
              >
                {formatCount(keyword.aiSearchVolume)} vol.
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {keywords.length > 3 ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="text-xs text-base-content/50 hover:text-base-content"
        >
          {expanded ? "收起" : `+${remaining} more`}
        </button>
      ) : null}
    </div>
  );
}

const pagesHelper = createColumnHelper<TopPageRow>();
const queriesHelper = createColumnHelper<TopQueryRow>();

export function buildTopPagesColumns({
  showPlatform,
  targetDomain,
  projectId,
  brand,
}: {
  showPlatform: boolean;
  targetDomain: string | null;
  projectId: string;
  brand: string;
}) {
  return [
    pagesHelper.accessor("url", {
      id: "url",
      header: () => (
        <HeaderWithHelp
          label="来源"
          helpText="在包含所查品牌或域名的 AI 回答中，被引用为来源的页面。"
        />
      ),
      enableSorting: false,
      cell: ({ row }) => (
        <PageUrlCell row={row.original} targetDomain={targetDomain} />
      ),
    }),
    ...(showPlatform
      ? [
          pagesHelper.accessor("platform", {
            id: "platform",
            header: () => (
              <HeaderWithHelp label="平台" helpText={PLATFORM_HELP} />
            ),
            enableSorting: false,
            cell: ({ getValue }) => <PlatformCell platform={getValue()} />,
          }),
        ]
      : []),
    pagesHelper.display({
      id: "keywords",
      header: () => (
        <HeaderWithHelp
          label="引用场景"
          helpText="已获取样本中引用此页面的提示词示例。"
        />
      ),
      cell: ({ row }) => (
        <KeywordsCell
          keywords={row.original.keywords}
          projectId={projectId}
          brand={brand}
        />
      ),
    }),
    pagesHelper.accessor("capturedVolume", {
      id: "capturedVolume",
      header: ({ column }) => (
        <SortableHeader
          column={column}
          label="来源搜索量"
          helpText="DataForSEO 估算的该引用来源月度提示词需求，统计范围为包含所查品牌或域名的提示词。"
          align="right"
        />
      ),
      cell: ({ getValue }) => (
        <span className="tabular-nums">{formatCount(getValue())}</span>
      ),
      sortingFn: numericNullsLast,
      sortDescFirst: true,
    }),
  ];
}

export function buildTopQueriesColumns({
  showPlatform,
  projectId,
  brand,
}: {
  showPlatform: boolean;
  projectId: string;
  brand: string;
}) {
  return [
    queriesHelper.accessor("question", {
      id: "question",
      header: () => (
        <HeaderWithHelp
          label="查询"
          helpText="AI 回答正文或来源中引用了所查品牌或域名的用户提示词样本。提示词本身可能没有出现该品牌。"
        />
      ),
      enableSorting: false,
      cell: ({ row }) => (
        <>
          <p className="break-words font-medium">{row.original.question}</p>
          {row.original.brandsMentioned.length > 0 ? (
            <p className="mt-0.5 text-xs text-base-content/50">
              品牌： {row.original.brandsMentioned.slice(0, 5).join(", ")}
            </p>
          ) : null}
        </>
      ),
    }),
    ...(showPlatform
      ? [
          queriesHelper.accessor("platform", {
            id: "platform",
            header: () => (
              <HeaderWithHelp label="平台" helpText={PLATFORM_HELP} />
            ),
            enableSorting: false,
            cell: ({ getValue }) => <PlatformCell platform={getValue()} />,
          }),
        ]
      : []),
    queriesHelper.accessor("aiSearchVolume", {
      id: "aiSearchVolume",
      header: ({ column }) => (
        <SortableHeader
          column={column}
          label="AI 搜索量"
          helpText="此提示词主题的预估月度搜索需求，表示提示词需求量，不代表品牌提及次数。"
          align="right"
        />
      ),
      cell: ({ getValue }) => (
        <span className="tabular-nums">{formatCount(getValue())}</span>
      ),
      sortingFn: numericNullsLast,
      sortDescFirst: true,
    }),
    queriesHelper.display({
      id: "action",
      header: () => <span className="sr-only">操作</span>,
      meta: { cellClassName: "w-px whitespace-nowrap text-right align-top" },
      cell: ({ row }) => (
        <span
          className="tooltip tooltip-left opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
          data-tip="在提示词探索中运行此提示词"
        >
          <Link
            to="/p/$projectId/prompt-explorer"
            params={{ projectId }}
            search={{ q: row.original.question, hb: brand || undefined }}
            className="btn btn-ghost btn-xs gap-1"
            aria-label="在提示词探索中运行"
          >
            <Sparkles className="size-3.5" />
          </Link>
        </span>
      ),
    }),
  ];
}

export function TopPagesTable({ table }: { table: Table<TopPageRow> }) {
  if (table.getRowModel().rows.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-base-content/60">
        暂无可显示的引用来源。
      </p>
    );
  }

  return <BrandLookupTable table={table} urlLikeColumnId="url" />;
}

export function TopQueriesTable({ table }: { table: Table<TopQueryRow> }) {
  if (table.getRowModel().rows.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-base-content/60">
        未找到匹配的查询。
      </p>
    );
  }

  return <BrandLookupTable table={table} urlLikeColumnId="question" />;
}

function BrandLookupTable<T>({
  table,
  urlLikeColumnId,
}: {
  table: Table<T>;
  urlLikeColumnId: string;
}) {
  return (
    <AppDataTable
      table={table}
      getRowClassName={() => "group transition-colors hover:bg-base-200/40"}
      getCellClassName={(_, columnId) =>
        cellClassName(
          columnId,
          urlLikeColumnId,
          table.getColumn(columnId)?.getCanSort() ?? false,
        )
      }
    />
  );
}

function cellClassName(
  columnId: string,
  urlLikeColumnId: string,
  isNumeric: boolean,
): string {
  if (columnId === urlLikeColumnId) {
    return "min-w-80 max-w-2xl align-top";
  }
  if (columnId === "keywords") {
    return "max-w-lg align-top";
  }
  if (isNumeric) {
    return "whitespace-nowrap text-right align-top";
  }
  return "whitespace-nowrap align-top";
}
