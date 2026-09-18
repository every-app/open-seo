import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { Modal } from "@/client/components/Modal";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { getFieldError } from "@/client/lib/forms";
import { captureClientEvent } from "@/client/lib/posthog";
import { saveReportTemplate } from "@/serverFunctions/reportTemplates";
import type { ReportTemplate } from "@/types/schemas/report-templates";

// One form for create and edit. Shape only, as at every other boundary: the
// caps come back from the service with their copy and show in the alert.
const formSchema = z.object({
  name: z.string().trim().min(1, "Give the template a name."),
  description: z
    .string()
    .trim()
    .min(1, "Say in one line when to use this template."),
  instructions: z
    .string()
    .trim()
    .min(1, "Say who the report is for and which sections it has."),
});

const INSTRUCTIONS_PLACEHOLDER = `Audience: the client's marketing lead, not technical.
Sections, in order: Where we are / What we did this month / What moved / What to expect next.
Tone: plain and confident. Gloss every SEO term. No exclamation points.
Sign off as: Acme SEO
Accent: #1C4ED8`;

export function ReportTemplateForm({
  projectId,
  template,
  onClose,
  onSaved,
}: {
  projectId: string;
  /** The template being edited, or undefined when creating one. */
  template?: ReportTemplate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const saveMutation = useMutation({
    // A refusal (duplicate name, the cap) comes back as `{ ok: false }` rather
    // than an error, because thrown errors reach the client stripped to their
    // code. Rethrowing it here gives the form one error branch.
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      const result = await saveReportTemplate({
        data: { projectId, templateId: template?.id, ...values },
      });
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    onSuccess: (result) => {
      captureClientEvent("report_template:saved", {
        project_id: projectId,
        is_update: !result.created,
        source: "app",
      });
      onSaved();
    },
  });

  const error = saveMutation.error
    ? getStandardErrorMessage(saveMutation.error, "Failed to save the template")
    : null;

  const form = useForm({
    defaultValues: {
      name: template?.name ?? "",
      description: template?.description ?? "",
      instructions: template?.instructions ?? "",
    },
    validators: { onSubmit: formSchema },
    onSubmit: ({ value }) => saveMutation.mutate(value),
  });

  return (
    <Modal maxWidth="max-w-2xl" onClose={onClose} labelledBy="template-title">
      <h3 id="template-title" className="text-lg font-semibold">
        {template ? "Edit template" : "New template"}
      </h3>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field name="name">
          {(field) => (
            <Labelled
              label="Name"
              error={getFieldError(field.state.meta.errors)}
            >
              <input
                type="text"
                className="input input-bordered w-full"
                placeholder="Monthly client check-in"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </Labelled>
          )}
        </form.Field>

        <form.Field name="description">
          {(field) => (
            <Labelled
              label="Description"
              hint="One line saying when to use it. This is what an agent reads to decide."
              error={getFieldError(field.state.meta.errors)}
            >
              <input
                type="text"
                className="input input-bordered w-full"
                placeholder="The monthly update we send retainer clients."
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </Labelled>
          )}
        </form.Field>

        <form.Field name="instructions">
          {(field) => (
            <Labelled
              label="Instructions"
              hint="Brand voice for the whole project lives in Context › Writing preferences."
              error={getFieldError(field.state.meta.errors)}
            >
              <textarea
                className="textarea textarea-bordered h-56 w-full font-mono text-xs leading-relaxed"
                placeholder={INSTRUCTIONS_PLACEHOLDER}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </Labelled>
          )}
        </form.Field>

        {error ? (
          <div className="alert alert-error">
            <span className="text-sm">{error}</span>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm gap-1"
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : null}
            {template ? "Save changes" : "Create template"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Labelled({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    // The wrapping label associates the text with the control, so no id plumbing.
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      {children}
      {hint ? <p className="text-xs text-base-content/60">{hint}</p> : null}
      {error ? <p className="text-sm text-error">{error}</p> : null}
    </label>
  );
}
