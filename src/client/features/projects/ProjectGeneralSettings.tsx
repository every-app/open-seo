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
import { useLocale } from "@/client/lib/i18n";
import { isEveryAppClientAuthMode } from "@/lib/auth-mode";
import type { ProjectSummary } from "./types";

export function ProjectGeneralSettings({ projectId }: { projectId: string }) {
  const { t } = useLocale();
  const projectsQuery = useQuery(projectsQueryOptions());

  return (
    <QueryState
      query={projectsQuery}
      errorFallback={t("project_settings.general.error_loading")}
    >
      {(projects) => {
        const project = projects.find((entry) => entry.id === projectId);
        if (!project) {
          return (
            <QueryError fallback={t("project_settings.general.not_found")} />
          );
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
  const { t } = useLocale();

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
      toast.success(t("project_settings.general.updated"));
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
      <SectionHeader title={t("project_settings.general.title")} />
      <form.AppForm>
        <form.Form className="flex flex-col gap-4">
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                label={t("project_settings.general.name")}
                maxLength={120}
                required
              />
            )}
          </form.AppField>

          <p className="text-sm text-muted-foreground">
            {isEveryAppClientAuthMode()
              ? t("project_settings.general.scan_notice_everyapp")
              : t("project_settings.general.scan_notice")}
          </p>
          <form.AppField name="domain">
            {(field) => (
              <field.TextField
                label={
                  <>
                    {t("project_settings.general.domain")}{" "}
                    <span className="font-normal text-muted-foreground">
                      {t("project_settings.general.optional")}
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
              {t("project_settings.general.market_help")}
            </span>
          </div>

          <div className="flex justify-end">
            <form.Subscribe selector={(state) => state.isDefaultValue}>
              {(isDefaultValue) => (
                <form.SubmitButton disabled={isDefaultValue}>
                  {t("project_settings.general.save_changes")}
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
  const { t } = useLocale();

  const archiveMutation = useMutation({
    mutationFn: () => archiveProject({ data: { projectId: project.id } }),
    onSuccess: async () => {
      if (getLastProjectId() === project.id) clearLastProjectId();
      await queryClient.invalidateQueries({
        queryKey: projectsQueryOptions().queryKey,
      });
      toast.success(t("project_settings.danger.archived"));
      // Re-resolve to a remaining project via the landing redirect.
      void navigate({ to: "/" });
    },
  });

  return (
    <section className="space-y-3 border-t border-border pt-8">
      <SectionHeader title={t("project_settings.danger.title")} />
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {canArchive
            ? t("project_settings.danger.description")
            : t("project_settings.danger.only_project")}
        </p>
        <div className="flex shrink-0 gap-2">
          <InlineConfirm
            label={`${t("project_settings.danger.archive_button")}: ${project.name}`}
            triggerLabel={t("project_settings.danger.archive_button")}
            confirmLabel={t("project_settings.danger.confirm_button")}
            pending={archiveMutation.isPending}
            disabled={!canArchive}
            onConfirm={() => archiveMutation.mutate()}
          />
        </div>
      </div>
    </section>
  );
}
