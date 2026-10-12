import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { QueryState } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { ReportTemplateForm } from "@/client/features/reports/ReportTemplateForm";
import { ReportTemplatesList } from "@/client/features/reports/ReportTemplatesList";
import {
  reportsQueryKey,
  reportTemplatesQueryKey,
} from "@/client/features/reports/shared";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  deleteReportTemplate,
  listReportTemplates,
} from "@/serverFunctions/reportTemplates";
import type { ReportTemplate } from "@/types/schemas/report-templates";

export const Route = createFileRoute("/_app/p/$projectId/reports/templates")({
  component: ReportTemplatesPage,
});

function ReportTemplatesPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  // `{}` opens the form for a new template; `{ template }` opens it for an edit.
  const [form, setForm] = useState<{ template?: ReportTemplate } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ReportTemplate | null>(
    null,
  );

  const templatesQuery = useQuery({
    queryKey: reportTemplatesQueryKey(projectId),
    queryFn: () => listReportTemplates({ data: { projectId } }),
    staleTime: 0,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: reportTemplatesQueryKey(projectId),
    });
    // The reports list renders the template name in its Type column.
    void queryClient.invalidateQueries({
      queryKey: reportsQueryKey(projectId),
    });
  };

  const deleteMutation = useMutation({
    mutationFn: (templateId: string) =>
      deleteReportTemplate({ data: { projectId, templateId } }),
    onSuccess: (_result, templateId) => {
      captureClientEvent("report_template:deleted", {
        project_id: projectId,
        template_id: templateId,
      });
      toast.success("Template deleted");
      setPendingDelete(null);
      invalidate();
    },
  });

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <PageHeader
          backLink={
            <BackLink to="/p/$projectId/reports" params={{ projectId }}>
              Reports
            </BackLink>
          }
          title="Report templates"
          description="Reusable briefs your agents follow when they write a report: who it is for, which sections it has, and how it should sound."
          actions={
            <Button onClick={() => setForm({})}>
              <Plus data-icon="inline-start" />
              New template
            </Button>
          }
        />

        <QueryState
          query={templatesQuery}
          errorFallback="Failed to load templates"
        >
          {(data) => (
            <ReportTemplatesList
              templates={data.templates}
              onEdit={(template) => setForm({ template })}
              onDelete={setPendingDelete}
            />
          )}
        </QueryState>
      </div>

      {form ? (
        <ReportTemplateForm
          projectId={projectId}
          template={form.template}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            invalidate();
          }}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title={`Delete \u201c${pendingDelete.name}\u201d?`}
          confirmLabel="Delete template"
          destructive
          pending={deleteMutation.isPending}
          onClose={() => setPendingDelete(null)}
          onConfirm={() => deleteMutation.mutate(pendingDelete.id)}
        >
          Reports already written from it are not affected.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
