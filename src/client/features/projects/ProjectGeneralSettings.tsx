import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { revalidateLogic } from "@tanstack/react-form";
import { useAppForm } from "@/client/components/form/useAppForm";
import { InlineConfirm } from "@/client/components/InlineConfirm";
import { SectionHeader } from "@/client/components/PageHeader";
import { QueryError, QueryState } from "@/client/components/QueryState";
import { ProjectMarketFields } from "@/client/features/projects/ProjectMarketFields";
import {
  clearLastProjectId,
  getLastProjectId,
} from "@/client/lib/active-project";
import { toastInitialAudit } from "@/client/features/projects/initialAuditToast";
import { archiveProject, updateProject } from "@/serverFunctions/projects";
import type { ProjectSummary } from "./types";

export function ProjectGeneralSettings({ projectId }: { projectId: string }) {
  const projectsQuery = useQuery(projectsQueryOptions());

  return (
    <QueryState
      query={projectsQuery}
      errorFallback="Failed to load the project"
    >
      {(projects) => {
        const project = projects.find((entry) => entry.id === projectId);
        if (!project) {
          return <QueryError fallback="This project was not found." />;
        }
        return (
          <div className="space-y-8">
            {/* key resets the form's local state when switching between projects */}
            <GeneralSection key={project.id} project={project} />
            <DangerSection project={project} canArchive={projects.length > 1} />
          </div>
        );
      }}
    </QueryState>
  );
}

const generalSchema = z.object({
  name: z.string().trim().min(1, "Enter a project name."),
  domain: z.string(),
  market: z.object({ locationCode: z.number(), languageCode: z.string() }),
});

function GeneralSection({ project }: { project: ProjectSummary }) {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (values: z.infer<typeof generalSchema>) =>
      updateProject({
        data: {
          projectId: project.id,
          name: values.name.trim(),
          domain: values.domain.trim() || undefined,
          ...values.market,
        },
      }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({
        queryKey: projectsQueryOptions().queryKey,
      });
      await queryClient.invalidateQueries({
        queryKey: ["dashboardActivation", project.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ["dashboardOverview", project.id],
      });
      toast.success("Project updated");
      toastInitialAudit(saved.initialAudit);
    },
  });

  const form = useAppForm({
    defaultValues: {
      name: project.name,
      domain: project.domain ?? "",
      market: {
        locationCode: project.locationCode,
        languageCode: project.languageCode,
      },
    },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: generalSchema },
    onSubmit: async ({ value, formApi }) => {
      await updateMutation.mutateAsync(value);
      // The saved values are the new baseline, so Save disables again. An edit
      // made while the save ran replaces the values object, and then the form
      // keeps that edit and Save stays on.
      if (formApi.state.values === value) formApi.reset(value);
    },
  });

  return (
    <section className="space-y-3">
      <SectionHeader title="General" />
      <form.AppForm>
        <form.Form className="flex flex-col gap-4">
          <form.AppField name="name">
            {(field) => (
              <field.TextField label="Name" maxLength={120} required />
            )}
          </form.AppField>

          <p className="text-sm text-muted-foreground">
            Adding your website starts a 50-page scan with JavaScript rendering.
            Rendering uses your credits.
          </p>
          <form.AppField name="domain">
            {(field) => (
              <field.TextField
                label={
                  <>
                    Domain{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </>
                }
                placeholder="example.com"
                maxLength={255}
              />
            )}
          </form.AppField>

          <div className="flex flex-col gap-1.5">
            <form.Field name="market">
              {(field) => (
                <ProjectMarketFields
                  value={field.state.value}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
            <span className="text-xs text-muted-foreground">
              Keyword, SERP, and domain data uses this country and language
              unless a call asks for a different one.
            </span>
          </div>

          <div className="flex justify-end">
            <form.Subscribe selector={(state) => state.isDefaultValue}>
              {(isDefaultValue) => (
                <form.SubmitButton disabled={isDefaultValue}>
                  Save changes
                </form.SubmitButton>
              )}
            </form.Subscribe>
          </div>
        </form.Form>
      </form.AppForm>
    </section>
  );
}

function DangerSection({
  project,
  canArchive,
}: {
  project: ProjectSummary;
  canArchive: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const archiveMutation = useMutation({
    mutationFn: () => archiveProject({ data: { projectId: project.id } }),
    onSuccess: async () => {
      if (getLastProjectId() === project.id) clearLastProjectId();
      await queryClient.invalidateQueries({
        queryKey: projectsQueryOptions().queryKey,
      });
      toast.success("Project archived");
      // Re-resolve to a remaining project via the landing redirect.
      void navigate({ to: "/" });
    },
  });

  return (
    <section className="space-y-3 border-t border-border pt-8">
      <SectionHeader title="Archive project" />
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {canArchive
            ? "Archiving removes the project from your workspace and stops its scheduled rank tracking. You can restore it later from the Projects page."
            : "You can't archive your only project."}
        </p>
        <div className="flex shrink-0 gap-2">
          <InlineConfirm
            label={`Archive ${project.name}`}
            triggerLabel="Archive project"
            confirmLabel="Yes, archive project"
            pending={archiveMutation.isPending}
            disabled={!canArchive}
            onConfirm={() => archiveMutation.mutate()}
          />
        </div>
      </div>
    </section>
  );
}
