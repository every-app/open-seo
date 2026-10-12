import { useMemo, type ComponentProps } from "react";
import type {
  ColumnDef,
  OnChangeFn,
  RowSelectionState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import {
  DataTable,
  type DataTableFrameProps,
  makeSelectionColumn,
  useDataTable,
  useSelectionAnchor,
} from "@/client/components/table/DataTable";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import type { AiResearchedPrompt } from "@/shared/ai-visibility";
import { DomainFavicon } from "./DomainFavicon";

const promptColumns: ColumnDef<AiResearchedPrompt>[] = [
  {
    id: "prompt",
    header: "Prompt",
    cell: ({ row: { original: prompt } }) => (
      <>
        <span>{prompt.text}</span>
        {prompt.tracked && (
          <Badge variant="secondary" className="ml-2">
            Tracked
          </Badge>
        )}
        {prompt.variants.length > 0 && (
          <p
            className="text-xs text-muted-foreground"
            title={prompt.variants.join("\n")}
          >
            +{prompt.variants.length} similar{" "}
            {prompt.variants.length === 1 ? "prompt" : "prompts"} merged
          </p>
        )}
      </>
    ),
  },
  {
    id: "sources",
    header: "Sources",
    meta: { headerClassName: "w-40" },
    cell: ({ row: { original: prompt } }) => (
      <>
        <span className="text-sm">
          {prompt.sources.length
            ? `${prompt.sources.length} ${prompt.sources.length === 1 ? "source" : "sources"}`
            : "No sources"}
        </span>
        {prompt.ownDomainCited && (
          <Badge variant="success" size="sm" className="ml-2">
            You
          </Badge>
        )}
      </>
    ),
  },
  {
    id: "expand",
    header: () => <span className="sr-only">Details</span>,
    meta: { headerClassName: "w-10" },
    cell: ({ row }) => (
      <Button
        variant="ghost"
        size="icon-sm"
        aria-expanded={row.getIsExpanded()}
        aria-label={`Show sources for ${row.original.text}`}
        onClick={() => row.toggleExpanded()}
      >
        {row.getIsExpanded() ? <ChevronDown /> : <ChevronRight />}
      </Button>
    ),
  },
];

/** Tracked prompts can't be selected; a selection only adds new prompts. */
export function PromptResearchTable({
  prompts,
  rowSelection,
  onRowSelectionChange,
  empty,
  ...frame
}: DataTableFrameProps & {
  prompts: AiResearchedPrompt[];
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  empty: ComponentProps<typeof DataTable>["empty"];
}) {
  const selectAnchorRef = useSelectionAnchor();
  const columns = useMemo(
    () => [
      makeSelectionColumn<AiResearchedPrompt>(
        selectAnchorRef,
        (row) => `Select ${row.original.text}`,
      ),
      ...promptColumns,
    ],
    [selectAnchorRef],
  );
  const table = useDataTable({
    data: prompts,
    columns,
    state: { rowSelection },
    onRowSelectionChange,
    getRowId: (prompt) => prompt.text,
    enableRowSelection: (row) => !row.original.tracked,
  });
  return (
    <DataTable
      {...frame}
      table={table}
      empty={empty}
      renderExpandedRow={(row) => <PromptSources prompt={row.original} />}
    />
  );
}

function PromptSources({ prompt }: { prompt: AiResearchedPrompt }) {
  return (
    <div className="space-y-2 py-1 pl-10">
      <Badge variant={prompt.brandMentioned ? "success" : "outline"}>
        {prompt.brandMentioned
          ? "Your brand is mentioned"
          : "Your brand is not mentioned"}
      </Badge>
      {prompt.sources.length ? (
        <ul className="space-y-1.5">
          {prompt.sources.map((source) => (
            <li key={source.url} className="flex items-center gap-2 text-sm">
              <DomainFavicon domain={source.domain} />
              <span className="w-40 shrink-0 truncate text-muted-foreground">
                {source.domain}
              </span>
              <SafeExternalLink
                url={source.url}
                label={source.title ?? source.url}
                className="inline-flex min-w-0 items-center gap-1 hover:underline"
              />
              {source.own && (
                <Badge variant="success" size="sm">
                  You
                </Badge>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          The AI answered from memory and cited no sources.
        </p>
      )}
    </div>
  );
}
