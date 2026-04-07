import type { ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { HeaderHelpLabel } from "@/client/features/keywords/components";
import { BacklinksSourceLink } from "./BacklinksPageLinks";
import type { BacklinksRow, GroupedBacklinkDomain } from "./backlinksPageTypes";
import {
  formatCompactDate,
  formatDecimal,
  formatNumber,
} from "./backlinksPageUtils";

function BacklinkFlags({ row }: { row: BacklinksRow }) {
  return (
    <div className="flex flex-wrap gap-1">
      {row.isLost ? (
        <span className="badge badge-sm badge-error badge-outline">Lost</span>
      ) : null}
      {row.isBroken ? (
        <span className="badge badge-sm badge-warning badge-outline">
          Broken
        </span>
      ) : null}
      {row.isDofollow === false ? (
        <span className="badge badge-sm badge-outline">Nofollow</span>
      ) : null}
      {row.linksCount != null && row.linksCount > 1 ? (
        <span className="badge badge-sm badge-outline inline-flex min-w-fit items-center whitespace-nowrap">
          {row.linksCount} links
        </span>
      ) : null}
    </div>
  );
}

function DomainFlagBadges({ group }: { group: GroupedBacklinkDomain }) {
  const badges: Array<{ label: string; className: string }> = [];
  if (group.lostCount > 0) {
    badges.push({
      label: `${group.lostCount} Lost`,
      className: "badge badge-sm badge-error badge-outline",
    });
  }
  if (group.brokenCount > 0) {
    badges.push({
      label: `${group.brokenCount} Broken`,
      className: "badge badge-sm badge-warning badge-outline",
    });
  }
  if (group.nofollowCount > 0) {
    badges.push({
      label: `${group.nofollowCount} Nofollow`,
      className: "badge badge-sm badge-outline",
    });
  }
  if (badges.length === 0) return null;

  return (
    <div className="flex gap-1">
      {badges.map((badge) => (
        <span key={badge.label} className={badge.className}>
          {badge.label}
        </span>
      ))}
    </div>
  );
}

function SortableHeader({
  column,
  label,
  helpText,
  align,
}: {
  column: {
    getIsSorted: () => false | "asc" | "desc";
    getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
  };
  label: string;
  helpText: string;
  align?: "left" | "right";
}) {
  const sorted = column.getIsSorted();
  const content = (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-medium transition-colors hover:text-base-content"
      onClick={column.getToggleSortingHandler()}
      aria-label={`Sort by ${label}`}
      aria-pressed={!!sorted}
    >
      <HeaderHelpLabel label={label} helpText={helpText} />
      {sorted === "asc" ? (
        <ArrowUp className="size-3 shrink-0" />
      ) : sorted === "desc" ? (
        <ArrowDown className="size-3 shrink-0" />
      ) : null}
    </button>
  );

  if (align === "right") {
    return <span className="flex w-full justify-end">{content}</span>;
  }

  return content;
}

export const backlinksColumns: ColumnDef<GroupedBacklinkDomain>[] = [
  {
    id: "source",
    accessorKey: "domain",
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Source"
        helpText="Page or domain linking to you"
      />
    ),
    size: 250,
    minSize: 180,
    cell: ({ row }) => {
      if (row.depth > 0) {
        const child = row.original._backlink;
        return (
          <div className="pl-6 break-all">
            {child?.urlFrom ? (
              <BacklinksSourceLink url={child.urlFrom} maxLength={48} muted />
            ) : (
              <span className="text-base-content/55">-</span>
            )}
          </div>
        );
      }

      const group = row.original;
      return (
        <div className="flex items-center gap-2">
          <ChevronRight
            className={`size-4 shrink-0 transition-transform ${row.getIsExpanded() ? "rotate-90" : ""}`}
          />
          <div>
            <div className="font-semibold">{group.domain}</div>
            <div className="text-xs text-base-content/55">
              {group.backlinkCount}{" "}
              {group.backlinkCount === 1 ? "backlink" : "backlinks"} &middot;{" "}
              {group.targetCount} {group.targetCount === 1 ? "page" : "pages"}
            </div>
          </div>
        </div>
      );
    },
    sortingFn: "alphanumeric",
  },
  {
    id: "target",
    header: () => (
      <HeaderHelpLabel label="Target" helpText="Destination on your site" />
    ),
    size: 220,
    minSize: 150,
    accessorFn: (row) => row.targetCount,
    enableSorting: false,
    cell: ({ row }) => {
      if (row.depth > 0) {
        const child = row.original._backlink;
        return (
          <div className="break-all">
            {child?.urlTo ? (
              <BacklinksSourceLink url={child.urlTo} maxLength={40} />
            ) : (
              "-"
            )}
          </div>
        );
      }

      return null;
    },
    sortingFn: "basic",
  },
  {
    id: "anchor",
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Anchor"
        helpText="Text or format of the link"
      />
    ),
    size: 150,
    minSize: 100,
    accessorFn: (row) => row._backlink?.anchor ?? row.domain,
    cell: ({ row }) => {
      if (row.depth > 0) {
        const child = row.original._backlink;
        return (
          <div className="space-y-0.5 break-words">
            <span className="text-sm">{child?.anchor || "No anchor text"}</span>
            {child?.itemType ? (
              <div className="text-xs text-base-content/55">
                {child.itemType}
              </div>
            ) : null}
          </div>
        );
      }

      return null;
    },
    sortingFn: "alphanumeric",
    enableSorting: false,
  },
  {
    id: "flags",
    header: () => (
      <HeaderHelpLabel
        label="Flags"
        helpText="Special backlink attributes, such as lost, broken, nofollow, or multiple links from the same source."
      />
    ),
    size: 130,
    minSize: 80,
    enableSorting: false,
    cell: ({ row }) => {
      if (row.depth > 0) {
        const child = row.original._backlink;
        const hasFlags =
          child?.isLost ||
          child?.isBroken ||
          child?.isDofollow === false ||
          (child?.linksCount != null && child.linksCount > 1);
        return hasFlags && child ? <BacklinkFlags row={child} /> : null;
      }

      return <DomainFlagBadges group={row.original} />;
    },
  },
  {
    id: "linkAuthority",
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="Link"
        helpText="Authority of the linking page"
        align="right"
      />
    ),
    size: 70,
    minSize: 50,
    accessorFn: (row) => row._backlink?.rank ?? null,
    cell: ({ row }) => {
      if (row.depth > 0) {
        const child = row.original._backlink;
        return (
          <div className="text-right tabular-nums text-sm">
            <span
              title={
                child?.spamScore != null
                  ? `Spam score: ${formatDecimal(child.spamScore)}`
                  : undefined
              }
            >
              {formatNumber(child?.rank)}
            </span>
          </div>
        );
      }

      return null;
    },
    sortingFn: "basic",
    enableSorting: false,
  },
  {
    id: "domainAuthority",
    accessorKey: "domainAuthority",
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="DA"
        helpText="Authority of the linking domain"
        align="right"
      />
    ),
    size: 70,
    minSize: 50,
    cell: ({ row }) => {
      if (row.depth > 0) return null;

      return (
        <div className="text-right tabular-nums text-sm">
          {formatNumber(row.original.domainAuthority)}
        </div>
      );
    },
    sortingFn: "basic",
  },
  {
    id: "firstSeen",
    accessorKey: "firstSeen",
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label="First Seen"
        helpText="When this link was first discovered by the crawler"
      />
    ),
    size: 110,
    minSize: 80,
    cell: ({ row }) => {
      if (row.depth > 0) {
        const child = row.original._backlink;
        return (
          <div className="whitespace-nowrap text-sm">
            <div>{formatCompactDate(child?.firstSeen)}</div>
            {child?.lastSeen ? (
              <div className="text-xs text-base-content/55">
                Last {formatCompactDate(child.lastSeen)}
              </div>
            ) : null}
          </div>
        );
      }

      return (
        <div className="whitespace-nowrap text-sm">
          {formatCompactDate(row.original.firstSeen)}
        </div>
      );
    },
    sortingFn: "datetime",
  },
];
