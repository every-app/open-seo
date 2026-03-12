import type {
  LaunchState,
  SettingsFormApi,
} from "@/client/features/audit/launch/types";

export function SettingsModal({
  settingsForm,
  state,
  setState,
  onClear,
  onSave,
}: {
  settingsForm: SettingsFormApi;
  state: LaunchState;
  setState: React.Dispatch<React.SetStateAction<LaunchState>>;
  onClear: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="card w-full max-w-lg bg-base-100 border border-base-300 shadow-xl">
        <div className="card-body gap-4">
          <div className="flex items-center justify-between">
            <h3 className="card-title text-base">Audit Settings</h3>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                setState((prev) => ({ ...prev, isSettingsOpen: false }))
              }
            >
              Close
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-base-content/70">
              Google PageSpeed Insights API Key
            </label>
            <div className="flex gap-2">
              <settingsForm.Field name="psiApiKey">
                {(field) => (
                  <input
                    type={state.showPsiKey ? "text" : "password"}
                    className="input input-bordered flex-1"
                    placeholder="Google API key"
                    value={field.state.value}
                    onChange={(event) => {
                      field.handleChange(event.target.value);
                      if (state.settingsError || state.psiRequirementError) {
                        setState((prev) => ({
                          ...prev,
                          settingsError: null,
                          psiRequirementError: null,
                        }));
                      }
                    }}
                  />
                )}
              </settingsForm.Field>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setState((prev) => ({
                    ...prev,
                    showPsiKey: !prev.showPsiKey,
                  }))
                }
              >
                {state.showPsiKey ? "Hide" : "Show"}
              </button>
            </div>
            <p className="text-xs text-base-content/50">
              Stored on this project and reused by PSI and Site Audit. Required
              to run PSI checks in audits.
            </p>
            <PsiKeyHelp />
            {state.settingsError ? (
              <p className="text-sm text-error">{state.settingsError}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              className="btn btn-ghost btn-sm text-error"
              onClick={onClear}
            >
              Clear key
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onSave}
            >
              Save settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PsiKeyHelp() {
  return (
    <div className="rounded-md border border-base-300 bg-base-200/30 p-3 text-xs text-base-content/70 space-y-1.5">
      <p className="font-medium text-base-content/80">Need a PSI key?</p>
      <ol className="list-decimal list-inside space-y-1">
        <li>
          Open{" "}
          <a
            className="link link-primary"
            href="https://developers.google.com/speed/docs/insights/v5/get-started"
            target="_blank"
            rel="noopener noreferrer"
          >
            PageSpeed Insights getting started
          </a>{" "}
          and click "Get a key".
        </li>
        <li>Create any Google Cloud project (for example: Open SEO).</li>
        <li>Paste the key here and save.</li>
      </ol>
    </div>
  );
}
