import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { revalidateLogic } from "@tanstack/react-form";
import { toast } from "sonner";
import { z } from "zod";
import { useAppForm } from "@/client/components/form/useAppForm";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { FieldDescription } from "@/client/components/ui/field";
import { setLastProjectId } from "@/client/lib/active-project";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import {
  DEFAULT_LOCATION_CODE,
  getLanguageCode,
} from "@/client/features/keywords/locations";
import { ProjectMarketFields } from "@/client/features/projects/ProjectMarketFields";
import { toastInitialAudit } from "@/client/features/projects/initialAuditToast";
import { createProject } from "@/serverFunctions/projects";

const createProjectSchema = z.object({
  name: z.string().trim().min(1, "Project name is required"),
  domain: z.string(),
  market: z.object({ locationCode: z.number(), languageCode: z.string() }),
});

// The server sends only the error code, so the field messages live here.
const SERVER_FIELD_ERRORS: Record<string, Record<string, string>> = {
  VALIDATION_ERROR: { domain: "Enter a valid domain, like acme.com." },
  CONFLICT: {
    name: 'A project named "Default" with no domain already exists. Pick a different name or add a domain.',
  },
};

export function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (values: z.infer<typeof createProjectSchema>) =>
      createProject({
        data: {
          name: values.name.trim(),
          domain: values.domain.trim() || undefined,
          ...values.market,
        },
      }),
    // The form shows field errors inline and toasts the rest itself.
    meta: { errorToast: false },
    onSuccess: async (created) => {
      setLastProjectId(created.id);
      await queryClient.invalidateQueries({
        queryKey: projectsQueryOptions().queryKey,
      });
      await queryClient.invalidateQueries({
        queryKey: ["dashboardActivation"],
      });
      onClose();
      toast.success("Project created");
      toastInitialAudit(created.initialAudit);
      // Continue setup through the new project’s dashboard.
      void navigate({
        to: "/p/$projectId",
        params: { projectId: created.id },
      });
    },
  });

  const form = useAppForm({
    defaultValues: {
      name: "",
      domain: "",
      market: {
        locationCode: DEFAULT_LOCATION_CODE,
        languageCode: getLanguageCode(DEFAULT_LOCATION_CODE),
      },
    },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: createProjectSchema },
    onSubmit: async ({ value, formApi }) => {
      try {
        await createMutation.mutateAsync(value);
      } catch (error) {
        const fields = SERVER_FIELD_ERRORS[getErrorCode(error) ?? ""];
        if (fields) {
          formApi.setErrorMap({ onSubmit: { fields } });
        } else {
          toast.error(getStandardErrorMessage(error));
        }
      }
    },
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !createMutation.isPending) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <form.AppForm>
          <form.Form className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>New project</DialogTitle>
            </DialogHeader>

            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  label="Name"
                  placeholder="Acme Inc."
                  maxLength={120}
                  required
                />
              )}
            </form.AppField>

            <p className="text-sm text-muted-foreground">
              Adding your website starts a 50-page scan with JavaScript
              rendering. Rendering uses your credits.
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
                  description="You can connect Search Console and set up rank tracking after creating the project."
                  placeholder="example.com"
                  maxLength={255}
                />
              )}
            </form.AppField>

            <div className="flex flex-col gap-2">
              <form.Field name="market">
                {(field) => (
                  <ProjectMarketFields
                    value={field.state.value}
                    onChange={field.handleChange}
                  />
                )}
              </form.Field>
              <FieldDescription>
                Keyword, SERP, and domain data uses this country and language
                unless a call asks for a different one. Change it later in
                project settings.
              </FieldDescription>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <form.SubmitButton>Create project</form.SubmitButton>
            </DialogFooter>
          </form.Form>
        </form.AppForm>
      </DialogContent>
    </Dialog>
  );
}
