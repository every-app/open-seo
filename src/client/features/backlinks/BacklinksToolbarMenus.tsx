import { useState } from "react";
import {
  ChevronDown,
  Download,
  Gauge,
  MoreHorizontal,
  Sheet,
} from "@/client/components/icons";
import type { CsvValue } from "@/client/lib/csv";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import type { BacklinksSearchState } from "./backlinksPageTypes";
import { exportBacklinksTabCsv } from "./export";

import { Button, buttonVariants } from "@/client/components/ui/button";
import { Spinner } from "@/client/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
export function BacklinksExportMenu({
  activeTab,
  exportTarget,
  headers,
  rows,
}: {
  activeTab: BacklinksSearchState["tab"];
  exportTarget: string;
  headers: string[];
  rows: CsvValue[][];
}) {
  const [isExportingSheets, setIsExportingSheets] = useState(false);
  const canExport = rows.length > 0 && !isExportingSheets;

  const handleExportToSheets = async () => {
    if (!canExport) return;
    setIsExportingSheets(true);
    try {
      await exportTableToSheets({
        headers,
        rows,
        feature: `backlinks_${activeTab}`,
      });
    } finally {
      setIsExportingSheets(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <div
            className={buttonVariants({
              variant: "ghost",
              size: "sm",
              className: "gap-1",
            })}
            aria-label="Export backlinks table"
          />
        }
      >
        <Download className="size-4" />
        Export
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          onClick={() => void handleExportToSheets()}
          disabled={!canExport}
        >
          {isExportingSheets ? (
            <Spinner size="sm" />
          ) : (
            <Sheet className="size-4" />
          )}
          Export to Sheets
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            exportBacklinksTabCsv({
              tab: activeTab,
              target: exportTarget,
              headers,
              rows,
            })
          }
          disabled={rows.length === 0}
        >
          <Download className="size-4" />
          Export CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BacklinksActionsMenu({
  isLoadingRatings,
  loadRatings,
  ratableDomains,
}: {
  isLoadingRatings: boolean;
  loadRatings: (domains: string[]) => void | Promise<void>;
  ratableDomains: string[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Backlinks table actions"
            title="Backlinks table actions"
          />
        }
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onClick={() => void loadRatings(ratableDomains)}
          disabled={isLoadingRatings}
          title="Look up Ahrefs Domain Rating for each domain in the table"
        >
          {isLoadingRatings ? (
            <Spinner size="sm" />
          ) : (
            <Gauge className="size-4" />
          )}
          Ahrefs DR
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
