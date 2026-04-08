import { useEffect, useState } from "react";
import { Download, Search } from "lucide-react";
import type {
  BacklinksOverviewData,
  BacklinksSearchState,
} from "./backlinksPageTypes";
import { TAB_DESCRIPTIONS } from "./backlinksPageUtils";
import { exportBacklinksTabCsv } from "./export";

type BacklinksResultsData = {
  backlinks: BacklinksOverviewData["backlinks"];
  referringDomains: BacklinksOverviewData["referringDomains"];
  topPages: BacklinksOverviewData["topPages"];
};

export function ResultsHeader({
  activeTab,
  filterText,
  hideSpam,
  spamThreshold,
  onFilterTextChange,
  onSetActiveTab,
  onSetHideSpam,
  onSetSpamThreshold,
  filteredData,
  exportTarget,
}: {
  activeTab: BacklinksSearchState["tab"];
  filterText: string;
  hideSpam: boolean;
  spamThreshold: number;
  onFilterTextChange: (value: string) => void;
  onSetActiveTab: (tab: BacklinksSearchState["tab"]) => void;
  onSetHideSpam: (hideSpam: boolean) => void;
  onSetSpamThreshold: (threshold: number) => void;
  filteredData: BacklinksResultsData;
  exportTarget: string;
}) {
  const [draftSpamThreshold, setDraftSpamThreshold] = useState(
    String(spamThreshold),
  );

  useEffect(() => {
    setDraftSpamThreshold(String(spamThreshold));
  }, [spamThreshold]);

  function commitSpamThreshold() {
    onSetSpamThreshold(
      draftSpamThreshold.trim() === ""
        ? spamThreshold
        : Number(draftSpamThreshold),
    );
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-2">
        <div role="tablist" className="tabs tabs-box w-fit">
          <TabButton
            activeTab={activeTab}
            tab="backlinks"
            onClick={onSetActiveTab}
          >
            Backlinks
          </TabButton>
          <TabButton
            activeTab={activeTab}
            tab="domains"
            onClick={onSetActiveTab}
          >
            Referring Domains
          </TabButton>
          <TabButton activeTab={activeTab} tab="pages" onClick={onSetActiveTab}>
            Top Pages
          </TabButton>
        </div>
        <p className="max-w-xl text-sm text-base-content/60">
          {TAB_DESCRIPTIONS[activeTab]}
        </p>
      </div>

      <div className="flex flex-col items-end gap-2">
        <button
          className="btn btn-sm btn-ghost w-full max-w-xs justify-start lg:justify-center"
          onClick={() =>
            exportBacklinksTabCsv({
              tab: activeTab,
              target: exportTarget,
              rows: filteredData,
            })
          }
        >
          <Download className="size-4" />
          Export CSV
        </button>
        <label className="input input-bordered input-sm flex w-full max-w-xs items-center gap-2">
          <Search className="size-4 text-base-content/60" />
          <input
            placeholder="Filter current tab"
            value={filterText}
            onChange={(event) => onFilterTextChange(event.target.value)}
          />
        </label>
        {activeTab === "backlinks" ? (
          <div className="flex items-center gap-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="checkbox checkbox-xs"
                checked={hideSpam}
                onChange={(event) => onSetHideSpam(event.target.checked)}
              />
              <span className="text-base-content/70">Hide spam</span>
            </label>
            <label className="flex items-center gap-2 text-base-content/70">
              <span>Max spam</span>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={draftSpamThreshold}
                disabled={!hideSpam}
                className="input input-bordered input-xs w-20"
                onBlur={commitSpamThreshold}
                onChange={(event) => setDraftSpamThreshold(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commitSpamThreshold();
                    event.currentTarget.blur();
                  }
                }}
              />
            </label>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function TabButton({
  activeTab,
  children,
  onClick,
  tab,
}: {
  activeTab: BacklinksSearchState["tab"];
  children: string;
  onClick: (tab: BacklinksSearchState["tab"]) => void;
  tab: BacklinksSearchState["tab"];
}) {
  return (
    <button
      role="tab"
      className={`tab ${activeTab === tab ? "tab-active" : ""}`}
      onClick={() => onClick(tab)}
    >
      {children}
    </button>
  );
}
