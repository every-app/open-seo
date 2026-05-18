import { X } from "lucide-react";
import type { ReactNode } from "react";
import type { SearchTab } from "./types";
export type { SearchTab } from "./types";

type Props = {
  activeTabId: string | null;
  tabs: SearchTab[];
  onSelect: (tab: SearchTab) => void;
  onClose: (tabId: string) => void;
  renderLeading?: (tab: SearchTab, active: boolean) => ReactNode;
};

export function SearchTabStrip({
  activeTabId,
  tabs,
  onSelect,
  onClose,
  renderLeading,
}: Props) {
  if (tabs.length === 0) return null;

  return (
    <div className="rounded-xl border border-base-300 bg-base-100 p-1">
      <div
        role="tablist"
        className="flex min-w-0 items-stretch gap-1 overflow-x-auto"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              tabIndex={0}
              onClick={() => onSelect(tab)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(tab);
                }
              }}
              className={`group flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition ${
                active
                  ? "bg-base-300 text-base-content shadow-sm"
                  : "text-base-content/80 hover:bg-base-200"
              }`}
            >
              {renderLeading ? renderLeading(tab, active) : null}
              <span
                className="max-w-[10rem] truncate font-medium"
                title={tab.label}
              >
                {tab.label}
              </span>
              <button
                type="button"
                className="rounded p-0.5 text-base-content/50 opacity-60 transition hover:bg-base-content/10 hover:text-base-content hover:opacity-100 group-hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.id);
                }}
                aria-label={`Close ${tab.label} tab`}
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
