import { ArrowDown, ArrowUp } from "lucide-react";
import { HeaderHelpLabel } from "@/client/features/keywords/components";
import {
  getNextSort,
  type BacklinksTableSort,
  type ReferringDomainsTableSort,
  type SortDirection,
  type TopPagesTableSort,
} from "./backlinksTableSorting";

export function BacklinksTableHeader({
  sort,
  onSortChange,
}: {
  sort: BacklinksTableSort;
  onSortChange: (sort: BacklinksTableSort) => void;
}) {
  return (
    <thead>
      <tr>
        <SortableHeaderCell
          label="Source"
          helpText="Page or domain linking to you"
          field="source"
          defaultDirection="asc"
          sort={sort}
          onSortChange={onSortChange}
        />
        <SortableHeaderCell
          label="Target"
          helpText="Destination on your site"
          field="target"
          defaultDirection="asc"
          sort={sort}
          onSortChange={onSortChange}
        />
        <SortableHeaderCell
          label="Anchor"
          helpText="Text or format of the link"
          field="anchor"
          defaultDirection="asc"
          sort={sort}
          onSortChange={onSortChange}
        />
        <th>
          <HeaderHelpLabel
            label="Flags"
            helpText="Special backlink attributes, such as lost, broken, nofollow, or multiple links from the same source."
          />
        </th>
        <SortableHeaderCell
          align="right"
          label="Link"
          helpText="Authority of the linking page"
          field="linkAuthority"
          defaultDirection="desc"
          sort={sort}
          onSortChange={onSortChange}
        />
        <SortableHeaderCell
          align="right"
          label="DA"
          helpText="Authority of the linking domain"
          field="domainAuthority"
          defaultDirection="desc"
          sort={sort}
          onSortChange={onSortChange}
        />
        <SortableHeaderCell
          label="First Seen"
          helpText="When this link was first discovered by the crawler"
          field="firstSeen"
          defaultDirection="desc"
          sort={sort}
          onSortChange={onSortChange}
        />
      </tr>
    </thead>
  );
}

export function ReferringDomainsTableHeader({
  sort,
  onSortChange,
}: {
  sort: ReferringDomainsTableSort;
  onSortChange: (sort: ReferringDomainsTableSort) => void;
}) {
  return (
    <thead>
      <tr>
        <SortableHeaderCell
          label="Domain"
          helpText="The referring site linking to your target."
          field="domain"
          defaultDirection="asc"
          sort={sort}
          onSortChange={onSortChange}
        />
        <SortableHeaderCell
          label="Backlinks"
          helpText="Total backlinks found from this domain."
          field="backlinks"
          defaultDirection="desc"
          sort={sort}
          onSortChange={onSortChange}
        />
        <SortableHeaderCell
          label="Referring Pages"
          helpText="Unique pages on this domain that link to your target."
          field="referringPages"
          defaultDirection="desc"
          sort={sort}
          onSortChange={onSortChange}
        />
        <SortableHeaderCell
          label="Rank"
          helpText="Authority score for the referring domain."
          field="rank"
          defaultDirection="desc"
          sort={sort}
          onSortChange={onSortChange}
        />
        <SortableHeaderCell
          label="Spam"
          helpText="Spam risk score for this referring domain."
          field="spamScore"
          defaultDirection="desc"
          sort={sort}
          onSortChange={onSortChange}
        />
        <SortableHeaderCell
          label="First Seen"
          helpText="When this domain was first discovered linking to your target."
          field="firstSeen"
          defaultDirection="desc"
          sort={sort}
          onSortChange={onSortChange}
        />
        <SortableHeaderCell
          label="Issues"
          helpText="Broken link and broken page counts tied to this domain."
          field="issues"
          defaultDirection="desc"
          sort={sort}
          onSortChange={onSortChange}
        />
      </tr>
    </thead>
  );
}

export function TopPagesTableHeader({
  sort,
  onSortChange,
}: {
  sort: TopPagesTableSort;
  onSortChange: (sort: TopPagesTableSort) => void;
}) {
  return (
    <thead>
      <tr>
        <SortableHeaderCell
          label="Page"
          helpText="Page on the target site receiving backlinks."
          field="page"
          defaultDirection="asc"
          sort={sort}
          onSortChange={onSortChange}
        />
        <SortableHeaderCell
          label="Backlinks"
          helpText="Total backlinks pointing to this page."
          field="backlinks"
          defaultDirection="desc"
          sort={sort}
          onSortChange={onSortChange}
        />
        <SortableHeaderCell
          label="Referring Domains"
          helpText="Unique domains linking to this page."
          field="referringDomains"
          defaultDirection="desc"
          sort={sort}
          onSortChange={onSortChange}
        />
        <SortableHeaderCell
          label="Rank"
          helpText="Authority score for this target page."
          field="rank"
          defaultDirection="desc"
          sort={sort}
          onSortChange={onSortChange}
        />
        <SortableHeaderCell
          label="Broken Backlinks"
          helpText="Backlinks pointing here that are currently broken."
          field="brokenBacklinks"
          defaultDirection="desc"
          sort={sort}
          onSortChange={onSortChange}
        />
      </tr>
    </thead>
  );
}

function SortableHeaderCell<TField extends string>({
  align,
  label,
  helpText,
  field,
  defaultDirection,
  sort,
  onSortChange,
}: {
  align?: "left" | "right";
  label: string;
  helpText: string;
  field: TField;
  defaultDirection: SortDirection;
  sort: { field: TField; direction: SortDirection };
  onSortChange: (sort: { field: TField; direction: SortDirection }) => void;
}) {
  const isActive = sort.field === field;
  const content = (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-medium transition-colors hover:text-base-content"
      onClick={() => onSortChange(getNextSort(sort, field, defaultDirection))}
      aria-label={`Sort by ${label}`}
      aria-pressed={isActive}
    >
      <HeaderHelpLabel label={label} helpText={helpText} />
      {isActive ? (
        sort.direction === "asc" ? (
          <ArrowUp className="size-3 shrink-0" />
        ) : (
          <ArrowDown className="size-3 shrink-0" />
        )
      ) : null}
    </button>
  );

  return (
    <th className={align === "right" ? "text-right" : undefined}>
      {align === "right" ? (
        <span className="inline-flex justify-end">{content}</span>
      ) : (
        content
      )}
    </th>
  );
}
