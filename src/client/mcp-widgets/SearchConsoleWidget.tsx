import { useState } from "react";
import { z } from "zod";
import { SearchConsoleConnection } from "./SearchConsoleConnection";
import { SearchConsoleTable } from "./SearchConsoleTable";
import { SearchConsoleDateRange } from "./SearchConsoleDateRange";
import { ArrowLeft, MessageSquare, Save } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import {
  WidgetTool,
  type SearchConsoleData,
  type WidgetSnapshot,
} from "@/shared/mcp-contracts";
import type { WidgetHost } from "./useWidgetHost";

enum View {
  Striking = "striking",
  Queries = "queries",
  Pages = "pages",
}

function viewRequest(
  view: View,
  input: Record<string, unknown>,
  filters: unknown,
) {
  const {
    minPosition: _min,
    maxPosition: _max,
    minImpressions: _impressions,
    filters: _filters,
    ...base
  } = input;
  return {
    ...base,
    ...(filters === undefined ? {} : { filters }),
    dimensions:
      view === View.Pages
        ? ["page"]
        : view === View.Striking
          ? ["query", "page"]
          : ["query"],
    startRow: 0,
    ...(view === View.Striking
      ? { minPosition: 5, maxPosition: 20, minImpressions: 50 }
      : {}),
  };
}

export function SearchConsoleWidget({
  host,
  data,
}: {
  host: WidgetHost;
  data: SearchConsoleData;
}) {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmSave, setConfirmSave] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pageHistory, setPageHistory] = useState<WidgetSnapshot[]>([]);
  const [previous, setPrevious] = useState<{
    snapshot: WidgetSnapshot;
    pageHistory: WidgetSnapshot[];
  }>();
  const snapshot = host.snapshot!;
  const input = snapshot.context.arguments;
  const busy = host.action.isPending;
  const dimensions = data.dimensions ?? [];
  const queryIndex = dimensions.indexOf("query");
  const view =
    input.minPosition !== undefined
      ? View.Striking
      : dimensions[0] === "page"
        ? View.Pages
        : View.Queries;
  const rows = (data.rows ?? []).map((row, index) => ({ ...row, index }));
  const matching = rows.filter((row) =>
    (row.keys ?? []).join(" ").toLowerCase().includes(filter.toLowerCase()),
  );
  const selection = rows.filter((row) => selected.has(row.index));
  const keywords = [
    ...new Set(
      selection.flatMap((row) =>
        row.keys?.[queryIndex] ? [row.keys[queryIndex]] : [],
      ),
    ),
  ];
  const clearTableState = () => {
    setSelected(new Set());
    setConfirmSave(false);
    setSaved(false);
    setFilter("");
  };
  const request = (args: Record<string, unknown>, onSuccess?: () => void) => {
    host.call({ tool: WidgetTool.SearchConsole, arguments: args }, () => {
      clearTableState();
      onSuccess?.();
    });
  };

  if (!data.ok) return <SearchConsoleConnection host={host} data={data} />;

  const changeView = (value: string) => {
    request(
      viewRequest(
        z.enum(View).parse(value),
        input,
        // Leaving a drilled page also drops its page filter.
        previous ? previous.snapshot.context.arguments.filters : input.filters,
      ),
      () => {
        setPrevious(undefined);
        setPageHistory([]);
      },
    );
  };
  const drill = (page: string) => {
    const filters = z.array(z.unknown()).parse(input.filters ?? []);
    const {
      minPosition: _min,
      maxPosition: _max,
      minImpressions: _impressions,
      ...base
    } = input;
    request(
      {
        ...base,
        dimensions: ["query"],
        startRow: 0,
        filters: [
          ...filters,
          { dimension: "page", operator: "equals", expression: page },
        ],
      },
      () => {
        setPrevious({ snapshot, pageHistory });
        setPageHistory([]);
      },
    );
  };
  const save = () => {
    host.action.mutate(async (app) => {
      const result = await app.callServerTool({
        name: "save_keywords",
        arguments: { projectId: input.projectId, keywords },
      });
      if (result.isError)
        throw new Error(
          result.content
            ?.flatMap((item) => (item.type === "text" ? [item.text] : []))
            .join("\n") || "Could not save keywords.",
        );
      setSaved(true);
      setSelected(new Set());
      setConfirmSave(false);
    });
  };

  return (
    <section className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold">Search Performance</h1>
        <p className="break-all text-sm text-muted-foreground">
          {data.siteUrl} · {data.startDate} to {data.endDate}
        </p>
      </div>
      {previous && (
        <Button
          variant="ghost"
          onClick={() => {
            host.restore(previous.snapshot);
            clearTableState();
            setPageHistory(previous.pageHistory);
            setPrevious(undefined);
          }}
          disabled={busy}
        >
          <ArrowLeft />
          Back to results
        </Button>
      )}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 pb-3 pt-2">
          <Tabs value={view} onValueChange={changeView}>
            <TabsList variant="line" className="max-w-full flex-wrap">
              <TabsTrigger value={View.Striking} disabled={busy}>
                Striking distance
              </TabsTrigger>
              <TabsTrigger value={View.Queries} disabled={busy}>
                Queries
              </TabsTrigger>
              <TabsTrigger value={View.Pages} disabled={busy}>
                Pages
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Input
            className="h-8 w-48"
            aria-label="Filter returned rows"
            placeholder="Filter returned rows…"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <span className="text-xs text-muted-foreground">
            {matching.length} of {rows.length} returned rows
          </span>
        </div>
        <SearchConsoleTable
          matching={matching}
          dimensions={dimensions}
          selected={selected}
          setSelected={setSelected}
          drill={drill}
          busy={busy}
        />
        {!matching.length && (
          <p className="p-5 text-sm text-muted-foreground">
            {rows.length
              ? "No rows match this filter."
              : "No Search Console rows in this scope. Try another range or view."}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3">
          <SearchConsoleDateRange
            input={input}
            disabled={busy}
            onChange={(dateRange) => {
              const { startDate: _start, endDate: _end, ...base } = input;
              request(
                {
                  ...base,
                  dateRange,
                  startRow: 0,
                },
                () => setPageHistory([]),
              );
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || !Number(input.startRow)}
              onClick={() =>
                request({ ...input, startRow: 0 }, () => setPageHistory([]))
              }
            >
              First page
            </Button>
            <Button
              variant="outline"
              disabled={busy || pageHistory.length === 0}
              onClick={() => {
                const page = pageHistory.at(-1);
                if (!page) return;
                host.restore(page);
                clearTableState();
                setPageHistory((history) => history.slice(0, -1));
              }}
            >
              Previous page
            </Button>
            <Button
              variant="outline"
              disabled={
                busy || !data.hasMore || data.nextStartRow === undefined
              }
              onClick={() =>
                request({ ...input, startRow: data.nextStartRow }, () =>
                  setPageHistory((history) => [...history, snapshot]),
                )
              }
            >
              Next page
            </Button>
          </div>
        </div>
      </div>
      {selection.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
          <span className="mr-auto text-sm">{selection.length} selected</span>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
          <Button
            variant="outline"
            disabled={busy || keywords.length > 100}
            onClick={() => setConfirmSave(true)}
          >
            <Save />
            Save keywords
          </Button>
          {keywords.length > 100 && (
            <p className="w-full text-xs text-muted-foreground">
              Select at most 100 unique queries to save at once.
            </p>
          )}
        </div>
      )}
      {confirmSave && selection.length > 0 && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm">
            Save these queries to this project’s keywords? No tags or rank
            tracking will be added.
          </p>
          <div className="flex gap-2">
            <Button pending={busy} onClick={save}>
              Confirm save ({keywords.length})
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirmSave(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {saved && (
        <p role="status" className="text-sm">
          Keywords saved to OpenSEO.
        </p>
      )}
      {rows.length > 0 && (
        <Button
          disabled={busy}
          onClick={() =>
            host.ask(
              "Use this Search Console selection to recommend which page to improve and a concrete next step. Read the page before proposing edits; do not change the website.",
              {
                projectId: input.projectId,
                siteUrl: data.siteUrl,
                startDate: data.startDate,
                endDate: data.endDate,
                request: input,
                dimensions,
                rows: selection.length ? selection : matching,
              },
            )
          }
        >
          <MessageSquare />
          {host.clientName
            ? `Ask ${host.clientName} for a plan`
            : "Ask for a plan"}
        </Button>
      )}
    </section>
  );
}
