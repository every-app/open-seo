import { useMutation, useQuery } from "@tanstack/react-query";
import { AutumnProvider } from "autumn-js/react";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  DEFAULT_LOCATION_CODE,
  LOCATION_OPTIONS,
} from "@/shared/keyword-locations";
import { saveOnboardingSite } from "@/serverFunctions/onboardingStrategy";
import { StrategyChat } from "./OnboardingStrategyChat";
import {
  invalidateStrategyState,
  strategyStateQueryOptions,
} from "./onboardingStrategyQueries";

// Full-viewport chat surface. Breaks out of the centered, padded AuthPageShell
// with `fixed inset-0` so the chat fills the screen. There's no header bar —
// the strategy's first message carries the context — and inner content is
// constrained to a narrow column for comfortable reading width.
function StrategyShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex flex-col bg-base-100">{children}</div>
  );
}

export function OnboardingStrategy() {
  const stateQuery = useQuery(strategyStateQueryOptions());

  if (stateQuery.isError) {
    return (
      <StrategyShell>
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-error">
          Couldn’t load your strategy. Please refresh to try again.
        </div>
      </StrategyShell>
    );
  }

  if (!stateQuery.data) {
    return (
      <StrategyShell>
        <div className="flex flex-1 items-center justify-center gap-2 p-6 text-sm text-base-content/60">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      </StrategyShell>
    );
  }

  const { projectId, domain } = stateQuery.data;

  return (
    <StrategyShell>
      {!domain ? (
        <SiteForm projectId={projectId} />
      ) : (
        <AutumnProvider>
          <StrategyChat projectId={projectId} domain={domain} />
        </AutumnProvider>
      )}
    </StrategyShell>
  );
}

function SiteForm({ projectId }: { projectId: string }) {
  const [domain, setDomain] = useState("");
  const [locationCode, setLocationCode] = useState(DEFAULT_LOCATION_CODE);

  const save = useMutation({
    mutationFn: () =>
      saveOnboardingSite({ data: { projectId, domain, locationCode } }),
    onSuccess: invalidateStrategyState,
  });

  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
      <form
        className="w-full max-w-sm space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (domain.trim()) {
            save.mutate();
          }
        }}
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium">Your website</span>
          <input
            type="text"
            className="input input-bordered w-full"
            placeholder="example.com"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
          />
          <span className="text-xs text-base-content/50">
            You can add more projects with different websites later.
          </span>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Primary country</span>
          <select
            className="select select-bordered w-full"
            value={locationCode}
            onChange={(event) => setLocationCode(Number(event.target.value))}
          >
            {LOCATION_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={!domain.trim() || save.isPending}
        >
          {save.isPending ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
