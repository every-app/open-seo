import { Fragment, type ReactNode } from "react";
import {
  ChevronDown,
  Copy,
  Download,
  FileDown,
  FileJson,
  FileSpreadsheet,
  List,
  Sheet,
} from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/client/components/ui/dropdown-menu";
import type { ExportFormat } from "@/client/lib/exportRows";

/** Every `exportRows()` format, plus a plain list copy (one item per line). */
type ExportAction = ExportFormat | "copy-list";

const ACTION_ITEMS: Record<ExportAction, { label: string; icon: ReactNode }> = {
  sheets: { label: "Export to Sheets", icon: <Sheet /> },
  csv: { label: "Export CSV", icon: <FileDown /> },
  excel: { label: "Export Excel", icon: <FileSpreadsheet /> },
  json: { label: "Download JSON", icon: <FileJson /> },
  "copy-json": { label: "Copy JSON", icon: <Copy /> },
  "copy-list": { label: "Copy list", icon: <List /> },
};

/**
 * The toolbar Export button. The caller runs each action through
 * `exportRows()`, so every format shares the empty check and the analytics
 * event. With `scopes`, each scope is a labelled section, for example
 * "Current category" and "All actionable". A scope lists its own `actions`
 * when it offers fewer than the menu.
 */
export function ExportMenu<A extends ExportAction>({
  actions,
  onExport,
  busy = false,
  disabled = false,
  copyListLabel,
  scopes,
}: {
  actions: A[];
  onExport: (action: A, scope?: string) => void;
  /** Shows a spinner on the trigger and disables it, for example while Sheets opens. */
  busy?: boolean;
  disabled?: boolean;
  /** Label for "copy-list", for example "Copy keywords". */
  copyListLabel?: string;
  scopes?: { id: string; label: string; actions?: A[] }[];
}) {
  const renderItems = (scope?: string, scopeActions: A[] = actions) =>
    scopeActions.map((action) => (
      <DropdownMenuItem key={action} onClick={() => onExport(action, scope)}>
        {ACTION_ITEMS[action].icon}
        {action === "copy-list" && copyListLabel
          ? copyListLabel
          : ACTION_ITEMS[action].label}
      </DropdownMenuItem>
    ));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            pending={busy}
            disabled={disabled}
          />
        }
      >
        {busy ? null : <Download data-icon="inline-start" />}
        Export
        <ChevronDown data-icon="inline-end" className="opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {scopes
          ? scopes.map((scope, index) => (
              <Fragment key={scope.id}>
                {index > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{scope.label}</DropdownMenuLabel>
                  {renderItems(scope.id, scope.actions)}
                </DropdownMenuGroup>
              </Fragment>
            ))
          : renderItems()}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
