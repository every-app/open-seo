import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, RotateCcw } from "lucide-react";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { captureClientEvent } from "@/client/lib/posthog";
import { setDashboardStepDismissed } from "@/serverFunctions/dashboard";
import type { DashboardActivation } from "@/server/features/dashboard/services/DashboardService";
import type { DashboardSetupStep } from "@/types/schemas/dashboard";
import { getStepStatus, setupSteps } from "./dashboardSteps";
import { DashboardSetupAction } from "./DashboardSetupAction";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/client/components/ui/accordion";
import { Button } from "@/client/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/client/components/ui/collapsible";

export function DashboardOnboarding({
  projectId,
  activation,
}: {
  projectId: string;
  activation: DashboardActivation;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<DashboardSetupStep | null>(null);
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

  if (remaining.length === 0 && deferred.length === 0) return null;

  return (
    <section
      aria-label="Onboarding checklist"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <header className="border-b border-border px-5 py-5 sm:px-6">
        <h2 className="text-lg font-semibold">Get started</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Research competitors and keywords, audit your site, and connect your
          tools.
        </p>
      </header>
      <Accordion
        value={selected ? [selected] : []}
        onValueChange={(value) => {
          const next = remaining.find((step) => step.id === value[0])?.id;
          setSelected(next ?? null);
          if (next)
            captureClientEvent("dashboard:next_move_click", { step: next });
        }}
      >
        {remaining.map((item) => {
          const Icon = item.icon;
          return (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger className="items-center gap-3 rounded-none border-0 px-5 py-4 hover:bg-foreground/5 hover:no-underline focus-visible:ring-inset aria-expanded:bg-primary/5 sm:px-6">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-foreground/5">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">{item.label}</span>
                  <span className="mt-1 hidden text-xs font-normal text-muted-foreground sm:block">
                    {item.detail}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-5 px-5 py-5 sm:px-6">
                <DashboardSetupAction
                  step={item.id}
                  projectId={projectId}
                  domain={activation.domain}
                  onComplete={() => setSelected(null)}
                />
                <div className="border-t border-border pt-3">
                  <Button
                    variant="ghost"
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
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
      {deferred.length > 0 && (
        <Collapsible className="border-t border-border">
          <CollapsibleTrigger className="group flex w-full items-center gap-2 px-5 py-4 text-left text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset sm:px-6">
            <ChevronRight className="size-4 transition-transform group-data-panel-open:rotate-90" />
            {deferred.length} saved for later
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="space-y-1 px-5 pb-4 sm:px-6">
              {deferred.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-foreground/5 px-3 py-2"
                >
                  <span className="text-sm">{item.label}</span>
                  <Button
                    variant="ghost"
                    aria-label={`Restore ${item.label}`}
                    disabled={dismiss.isPending}
                    onClick={() =>
                      dismiss.mutate({ step: item.id, dismissed: false })
                    }
                  >
                    <RotateCcw data-icon="inline-start" /> Restore
                  </Button>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
      {completed.length > 0 && (
        <Collapsible className="border-t border-border">
          <CollapsibleTrigger className="group flex w-full items-center gap-2 px-5 py-4 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset sm:px-6">
            <Check className="size-4 text-success" />
            {completed.length} completed
            <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-data-panel-open:rotate-90" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="space-y-3 px-5 pb-5 sm:px-6">
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
          </CollapsibleContent>
        </Collapsible>
      )}
    </section>
  );
}
