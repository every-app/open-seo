import type { FormEvent } from "react";
import { Loader2, Settings } from "lucide-react";
import {
  MAX_PAGES_LIMIT,
  MIN_PAGES,
  type LaunchFormApi,
  type LaunchState,
  type SettingsFormApi,
} from "@/client/features/audit/launch/types";

export function LaunchFormCard({
  launchForm,
  settingsForm,
  state,
  setState,
  isPending,
  onSubmit,
  onOpenSettings,
  onRunPsiToggle,
  commitMaxPagesInput,
}: {
  launchForm: LaunchFormApi;
  settingsForm: SettingsFormApi;
  state: LaunchState;
  setState: React.Dispatch<React.SetStateAction<LaunchState>>;
  isPending: boolean;
  onSubmit: (event: FormEvent) => void;
  onOpenSettings: () => void;
  onRunPsiToggle: (checked: boolean) => void;
  commitMaxPagesInput: () => number;
}) {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <div className="flex items-center justify-between">
          <h2 className="card-title text-base">Start New Audit</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onOpenSettings}
          >
            <Settings className="size-4" />
            Settings
          </button>
        </div>

        <form
          className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-center"
          onSubmit={onSubmit}
        >
          <label
            className={`input input-bordered w-full lg:col-span-9 ${state.urlError ? "input-error" : ""}`}
          >
            <launchForm.Field name="url">
              {(field) => (
                <input
                  placeholder="https://example.com"
                  value={field.state.value}
                  onChange={(event) => {
                    field.handleChange(event.target.value);
                    if (state.urlError)
                      setState((prev) => ({ ...prev, urlError: null }));
                  }}
                />
              )}
            </launchForm.Field>
          </label>

          <button
            type="submit"
            className="btn btn-primary btn-sm w-full lg:col-span-3"
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Starting...
              </>
            ) : (
              "Start Audit"
            )}
          </button>

          <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-12 lg:items-start">
            <LaunchOptions
              launchForm={launchForm}
              commitMaxPagesInput={commitMaxPagesInput}
            />
            <PsiOptions
              launchForm={launchForm}
              settingsForm={settingsForm}
              onRunPsiToggle={onRunPsiToggle}
            />
          </div>
        </form>

        <LaunchErrors state={state} />
      </div>
    </div>
  );
}

function LaunchOptions({
  launchForm,
  commitMaxPagesInput,
}: {
  launchForm: LaunchFormApi;
  commitMaxPagesInput: () => number;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-200/20 p-3 space-y-2">
      <label className="text-xs font-medium uppercase tracking-wide text-base-content/60">
        Crawl limit
      </label>
      <div className="flex items-center gap-2">
        <span className="text-sm text-base-content/70">Max pages</span>
        <launchForm.Field name="maxPagesInput">
          {(field) => (
            <input
              type="number"
              min={MIN_PAGES}
              max={MAX_PAGES_LIMIT}
              className="input input-bordered input-sm w-28"
              value={field.state.value}
              onChange={(event) => {
                const next = event.target.value;
                if (!/^\d*$/.test(next)) return;
                field.handleChange(next);
              }}
              onBlur={commitMaxPagesInput}
            />
          )}
        </launchForm.Field>
      </div>
      <p className="text-xs text-base-content/50">
        Enter any value from {MIN_PAGES} to {MAX_PAGES_LIMIT}.
      </p>
    </div>
  );
}

function PsiOptions({
  launchForm,
  settingsForm,
  onRunPsiToggle,
}: {
  launchForm: LaunchFormApi;
  settingsForm: SettingsFormApi;
  onRunPsiToggle: (checked: boolean) => void;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-200/20 p-3 space-y-2">
      <label className="label cursor-pointer justify-start gap-2 p-0">
        <launchForm.Field name="runPsi">
          {(field) => (
            <input
              type="checkbox"
              className="toggle toggle-sm toggle-primary"
              checked={Boolean(field.state.value)}
              onChange={(event) => onRunPsiToggle(event.target.checked)}
            />
          )}
        </launchForm.Field>
        <span
          className="text-sm font-medium text-base-content/80"
          title="Run Google PageSpeed Insights checks during this audit"
        >
          Include PSI checks
        </span>
      </label>

      <launchForm.Subscribe selector={(snapshot) => snapshot.values.runPsi}>
        {(runPsi) =>
          runPsi ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-base-content/60">PSI mode</span>
              <launchForm.Field name="psiMode">
                {(field) => (
                  <select
                    className="select select-bordered select-xs"
                    value={field.state.value}
                    onChange={(event) =>
                      field.handleChange(
                        event.target.value === "all" ? "all" : "auto",
                      )
                    }
                  >
                    <option value="auto">Auto sample (recommended)</option>
                    <option value="all">All crawled pages</option>
                  </select>
                )}
              </launchForm.Field>
              <settingsForm.Subscribe
                selector={(snapshot) => snapshot.values.psiApiKey}
              >
                {(psiApiKey) => (
                  <span
                    className={`text-xs ${psiApiKey.trim() ? "text-success/80" : "text-warning"}`}
                  >
                    {psiApiKey.trim() ? "PSI key saved" : "PSI key required"}
                  </span>
                )}
              </settingsForm.Subscribe>
            </div>
          ) : null
        }
      </launchForm.Subscribe>
    </div>
  );
}

function LaunchErrors({ state }: { state: LaunchState }) {
  return (
    <div className="space-y-2">
      {state.urlError ? (
        <p className="text-sm text-error">{state.urlError}</p>
      ) : null}
      {state.psiRequirementError ? (
        <div className="alert alert-warning py-2">
          <span className="text-sm">{state.psiRequirementError}</span>
        </div>
      ) : null}
      {state.startError ? (
        <div className="alert alert-error py-2">
          <span className="text-sm">{state.startError}</span>
        </div>
      ) : null}
    </div>
  );
}
