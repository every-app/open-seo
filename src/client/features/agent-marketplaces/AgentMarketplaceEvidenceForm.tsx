import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { addAgentMarketplaceEvidence } from "@/serverFunctions/agent-marketplaces";
import type { AgentMarketplacePlatform } from "@/types/schemas/agent-marketplaces";

export function AgentMarketplaceEvidenceForm({
  projectId,
  platform,
  onSaved,
}: {
  projectId: string;
  platform: AgentMarketplacePlatform;
  onSaved: () => Promise<unknown>;
}) {
  const [open, setOpen] = React.useState(false);
  const [clones, setClones] = React.useState(0);
  const [uniqueCloners, setUniqueCloners] = React.useState(0);
  const [installs, setInstalls] = React.useState(0);
  const [oauthCompletions, setOauthCompletions] = React.useState(0);
  const [activatedAccounts, setActivatedAccounts] = React.useState(0);
  const [qualifiedOutcomes, setQualifiedOutcomes] = React.useState(0);
  const evidenceFields: Array<{
    label: string;
    name: string;
    value: number;
    setValue: React.Dispatch<React.SetStateAction<number>>;
  }> = [
    { label: "Clones", name: "clones", value: clones, setValue: setClones },
    {
      label: "Unique cloners",
      name: "unique-cloners",
      value: uniqueCloners,
      setValue: setUniqueCloners,
    },
    {
      label: "Installs",
      name: "installs",
      value: installs,
      setValue: setInstalls,
    },
    {
      label: "OAuth completions",
      name: "oauth-completions",
      value: oauthCompletions,
      setValue: setOauthCompletions,
    },
    {
      label: "Activated accounts",
      name: "activated-accounts",
      value: activatedAccounts,
      setValue: setActivatedAccounts,
    },
    {
      label: "Qualified outcomes",
      name: "qualified-outcomes",
      value: qualifiedOutcomes,
      setValue: setQualifiedOutcomes,
    },
  ];

  const save = useMutation({
    mutationFn: () =>
      addAgentMarketplaceEvidence({
        data: {
          projectId,
          platform,
          capturedAt: new Date().toISOString(),
          source: platform === "skills_sh" ? "platform" : "manual",
          views: 0,
          uniqueViewers: 0,
          clones,
          uniqueCloners,
          installs,
          oauthStarts: 0,
          oauthCompletions,
          activatedAccounts,
          qualifiedOutcomes,
          notes: null,
        },
      }),
    onSuccess: async () => {
      await onSaved();
      setOpen(false);
      toast.success("Evidence snapshot recorded");
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Could not record evidence")),
  });

  return (
    <div className="mt-3">
      <button
        type="button"
        className="btn btn-link h-auto min-h-0 px-0 text-xs"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Record evidence…
      </button>
      {open ? (
        <div className="mt-3 grid gap-3 rounded-lg border border-base-300 p-3 sm:grid-cols-3">
          {evidenceFields.map(({ label, name, value, setValue }) => (
            <label key={label} className="form-control gap-1">
              <span className="text-xs text-base-content/60">{label}</span>
              <input
                type="number"
                inputMode="numeric"
                name={`${platform}-evidence-${name}`}
                min={0}
                className="input input-bordered input-sm w-full font-mono"
                value={value}
                onChange={(event) =>
                  setValue(Math.max(0, Number(event.target.value) || 0))
                }
              />
            </label>
          ))}
          <div className="flex justify-end gap-2 sm:col-span-3">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? (
                <span className="loading loading-spinner loading-xs" />
              ) : null}
              Record snapshot
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
