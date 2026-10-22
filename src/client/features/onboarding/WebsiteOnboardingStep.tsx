import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { revalidateLogic } from "@tanstack/react-form";
import { cn } from "cn";
import { ArrowRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useAppForm } from "@/client/components/form/useAppForm";
import { QueryError } from "@/client/components/QueryState";
import { Spinner } from "@/client/components/Spinner";
import { Button } from "@/client/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/client/components/ui/collapsible";
import { Spinner as SpinnerIcon } from "@/client/components/ui/spinner";
import { WizardFooter } from "@/client/features/onboarding/WizardFooter";
import { ProjectMarketFields } from "@/client/features/projects/ProjectMarketFields";
import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import type { ProjectSummary } from "@/client/features/projects/types";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { captureClientEvent } from "@/client/lib/posthog";
import { saveOnboardingWebsite } from "@/serverFunctions/projects";

/**
 * First onboarding step: save the website and country on the user's first
 * project. Saving a new website starts its first site audit in the background,
 * so the dashboard has results by the time the user reaches it.
 */
export function WebsiteOnboardingStep({
  onNext,
  onSkip,
  suggestedDomain,
}: {
  onNext: () => void;
  onSkip: () => void;
  suggestedDomain?: string;
}) {
  const projectsQuery = useQuery(projectsQueryOptions());
  const project = projectsQuery.data?.[0];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          What’s your website?
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          We’ll start a site audit for you.
        </p>
      </div>
      {project ? (
        <WebsiteForm
          key={project.id}
          project={project}
          suggestedDomain={suggestedDomain}
          onNext={onNext}
          onSkip={onSkip}
        />
      ) : projectsQuery.isError ? (
        <QueryError
          error={projectsQuery.error}
          fallback="Couldn't load your project."
          onRetry={() => void projectsQuery.refetch()}
          isRetrying={projectsQuery.isFetching}
        />
      ) : (
        <Spinner size="sm" label="Checking…" />
      )}
    </div>
  );
}

const websiteSchema = z.object({
  domain: z.string().trim().min(1, "Enter your website."),
  market: z.object({ locationCode: z.number(), languageCode: z.string() }),
});

function WebsiteForm({
  project,
  suggestedDomain,
  onNext,
  onSkip,
}: {
  project: ProjectSummary;
  suggestedDomain?: string;
  onNext: () => void;
  onSkip: () => void;
}) {
  const queryClient = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: (values: z.infer<typeof websiteSchema>) =>
      saveOnboardingWebsite({
        data: {
          projectId: project.id,
          domain: values.domain.trim(),
          ...values.market,
        },
      }),
    // The form shows the domain error inline and toasts the rest itself.
    meta: { errorToast: false },
    onSuccess: (saved) => {
      // Move on without refetching: the save returned the project as stored.
      queryClient.setQueryData(projectsQueryOptions().queryKey, (projects) =>
        projects?.map((p) => (p.id === saved.id ? saved : p)),
      );
      captureClientEvent("onboarding:website_saved");
      onNext();
    },
  });

  const form = useAppForm({
    defaultValues: {
      domain: project.domain ?? suggestedDomain ?? "",
      // New projects default to the United States.
      market: {
        locationCode: project.locationCode,
        languageCode: project.languageCode,
      },
    },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: websiteSchema },
    onSubmit: async ({ value, formApi }) => {
      try {
        await saveMutation.mutateAsync(value);
      } catch (error) {
        const errorCode = getErrorCode(error);
        captureClientEvent("onboarding:website_save_failed", {
          error_code: errorCode ?? "UNKNOWN",
        });
        if (errorCode === "VALIDATION_ERROR")
          formApi.setErrorMap({
            onSubmit: {
              fields: { domain: "Enter a valid domain, like acme.com." },
            },
          });
        else toast.error(getStandardErrorMessage(error));
      }
    },
  });

  return (
    <form.AppForm>
      <form.Form className="flex flex-col gap-4">
        <form.AppField name="domain">
          {(field) => (
            <field.TextField
              label="Website"
              placeholder="example.com"
              maxLength={255}
            />
          )}
        </form.AppField>
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ChevronDown className="size-4 transition-transform group-data-panel-open:rotate-180" />
            Choose default country &amp; language
          </CollapsibleTrigger>
          <CollapsibleContent keepMounted className="pt-4">
            <form.Field name="market">
              {(field) => (
                <ProjectMarketFields
                  value={field.state.value}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
          </CollapsibleContent>
        </Collapsible>
        <WizardFooter
          className="mt-4"
          onSkip={onSkip}
          skipLabel="Skip for now"
          continueAction={
            <form.Subscribe
              selector={(state) => ({
                empty: !state.values.domain.trim(),
                submitting: state.isSubmitting,
              })}
            >
              {({ empty, submitting }) => (
                <Button
                  type="submit"
                  className="relative font-semibold disabled:bg-foreground/10 disabled:text-foreground/20 disabled:opacity-100"
                  disabled={empty || submitting}
                  aria-busy={submitting || undefined}
                >
                  {/* Hidden, not removed, so the button keeps its width. */}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5",
                      submitting && "invisible",
                    )}
                  >
                    Save and continue <ArrowRight className="size-4" />
                  </span>
                  {submitting ? (
                    <SpinnerIcon className="absolute inset-0 m-auto text-muted-foreground" />
                  ) : null}
                </Button>
              )}
            </form.Subscribe>
          }
        />
      </form.Form>
    </form.AppForm>
  );
}
