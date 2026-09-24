import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, RotateCcw } from "@/client/components/icons";
import { toast } from "sonner";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { getGoogleLinkError } from "@/client/features/integrations/googleLinkError";
import { setDashboardStepDismissed } from "@/serverFunctions/dashboard";
import type { DashboardActivation } from "@/server/features/dashboard/services/DashboardService";
import type { DashboardSetupStep } from "@/types/schemas/dashboard";
import { getStepStatus, setupSteps } from "./dashboardSteps";
import { DashboardSetupAction } from "./DashboardSetupAction";
import { Card } from "@/client/components/ui/card";

import { Button } from "@/client/components/ui/button";
export function DashboardOnboarding({
  projectId,
  activation,
}: {
  projectId: string;
  activation: DashboardActivation;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<DashboardSetupStep | null>(() =>
    getGoogleLinkError("gsc") ||
    (typeof window !== "undefined" && window.location.hash === "#connect-gsc")
      ? "gsc"
      : null,
  );
  const dismiss = useMutation({
    mutationFn: ({
      step,
      dismissed,
    }: {
      step: DashboardSetupStep;
      dismissed: boolean;
    }) => setDashboardStepDismissed({ data: { projectId, step, dismissed } }),
    onSuccess: async (_, { step, dismissed }) => {
      await queryClient.invalidateQueries({
        queryKey: ["dashboardActivation", projectId],
      });
      setSelected(dismissed ? null : step);
      captureClientEvent("dashboard:setup_step_defer", { step, dismissed });
    },
    onError: (error) =>
      toast.error(
        getStandardErrorMessage(
          error,
          "Couldn’t save your preference. Try again.",
        ),
      ),
  });
  const steps = setupSteps.filter(
    (step) => step.id !== "team" || isHostedClientAuthMode(),
  );
  const remaining = steps.filter(
    (step) => getStepStatus(activation, step.id) === "todo",
  );
  const completed = steps.filter(
    (step) => getStepStatus(activation, step.id) === "done",
  );
  const deferred = steps.filter(
    (step) => getStepStatus(activation, step.id) === "skipped",
  );

  if (remaining.length === 0) return null;

  return (
    <Card
      role="region"
      aria-label="Onboarding checklist"
      className="overflow-hidden"
    >
      <header className="border-b border-border px-6 py-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight">
            Finish setting up
          </h2>
          <p className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {completed.length} of {steps.length} done
          </p>
        </div>
      </header>
      {remaining.map((item) => {
        const active = selected === item.id;
        const Icon = item.icon;
        return (
          <div key={item.id} className="border-b border-border last:border-b-0">
            <Button
              variant="ghost"
              aria-expanded={active}
              aria-controls={`setup-${item.id}`}
              onClick={() => {
                setSelected(active ? null : item.id);
                if (!active)
                  captureClientEvent("dashboard:next_move_click", {
                    step: item.id,
                  });
              }}
              className={`h-auto rounded-md justify-start whitespace-normal text-left font-normal text-inherit flex w-full items-center gap-3 px-6 py-3.5 text-left transition-colors ${active ? "bg-accent/50" : "hover:bg-muted"}`}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-link">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
                  {item.detail}
                </span>
              </span>
              {item.id === "domain" && (
                <span className="hidden text-xs text-link sm:block">
                  Start here
                </span>
              )}
              <ChevronRight
                className={`size-4 shrink-0 text-muted-foreground transition-transform ${active ? "rotate-90" : ""}`}
              />
            </Button>
            <div id={`setup-${item.id}`} hidden={!active}>
              {active && (
                <div className="space-y-5 px-6 py-5">
                  <DashboardSetupAction
                    step={item.id}
                    projectId={projectId}
                    onComplete={() => setSelected(null)}
                  />
                  <div className="border-t border-border pt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      className="text-muted-foreground"
                      disabled={dismiss.isPending}
                      onClick={() =>
                        dismiss.mutate({ step: item.id, dismissed: true })
                      }
                    >
                      {item.id === "project"
                        ? "I only need one project"
                        : "Skip for now"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {deferred.length > 0 && (
        <details className="group border-t border-border">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-6 py-3.5 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" />
            {deferred.length} saved for later
          </summary>
          <ul className="space-y-1 px-6 pb-4">
            {deferred.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2"
              >
                <span className="text-sm">{item.label}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  aria-label={`Restore ${item.label}`}
                  className="shrink-0"
                  disabled={dismiss.isPending}
                  onClick={() =>
                    dismiss.mutate({ step: item.id, dismissed: false })
                  }
                >
                  <RotateCcw className="size-3.5" /> Restore
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {completed.length > 0 && (
        <details className="group border-t border-border">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-6 py-3.5 text-sm [&::-webkit-details-marker]:hidden">
            <Check className="size-4 text-success" />
            {completed.length} completed
            <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <ul className="space-y-3 px-6 pb-5">
            {completed.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 text-sm text-muted-foreground"
              >
                <Check className="size-4 shrink-0 text-success" />
                {item.label}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
