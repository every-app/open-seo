import { useRef, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  deleteAudit,
  getAuditHistory,
  startAudit,
} from "@/serverFunctions/audit";
import {
  DEFAULT_LAUNCH_FORM_VALUES,
  getMaxPagesLimit,
  clampMaxPagesInput,
  type LaunchFormValues,
} from "@/client/features/audit/launch/types";
import {
  createFormValidationErrors,
  shouldValidateFieldOnChange,
} from "@/client/lib/forms";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import { renderingCreditsNeededText } from "@/shared/audit-rendering";
import { useAuditCapabilities } from "@/client/features/audit/shared";
import {
  excludePathsSchema,
  findExcludingPath,
  splitExcludePathsInput,
} from "@/shared/audit-exclude-paths";

function getLaunchValidationErrors(
  value: LaunchFormValues,
  // Untouched fields stay quiet until the form is submitted.
  validate: { url: boolean; excludePaths: boolean },
) {
  return createFormValidationErrors({
    fields: {
      url: !value.url.trim() && validate.url ? "Please enter a URL." : null,
      excludePathsInput: validate.excludePaths
        ? getExcludePathsError(value)
        : null,
    },
  });
}

function getExcludePathsError(value: LaunchFormValues) {
  const parsed = excludePathsSchema.safeParse(
    splitExcludePathsInput(value.excludePathsInput),
  );
  if (!parsed.success) return parsed.error.issues[0].message;
  // The form takes a bare domain; the server adds the scheme the same way.
  const url = value.url.trim();
  const excludingPath = findExcludingPath(
    parsed.data,
    /^https?:\/\//i.test(url) ? url : `https://${url}`,
  );
  return excludingPath
    ? `"${excludingPath}" excludes the URL the audit starts from.`
    : null;
}

export function useLaunchController({
  projectId,
  initialUrl,
  isFreePlan,
  onAuditStarted,
}: {
  projectId: string;
  initialUrl: string;
  isFreePlan: boolean;
  onAuditStarted: (auditId: string) => void;
}) {
  const capabilitiesQuery = useAuditCapabilities(projectId);
  const historyQuery = useQuery({
    queryKey: ["audit-history", projectId],
    queryFn: () => getAuditHistory({ data: { projectId } }),
    // Keep in-progress rows live so status and page counts don't need a reload.
    refetchInterval: (query) =>
      query.state.data?.some((audit) => audit.status === "running")
        ? 5000
        : false,
  });
  const { startMutation, deleteMutation } = useLaunchMutations({ projectId });
  // Pages of a large crawl waiting for the user to confirm it.
  const [largeCrawlPages, setLargeCrawlPages] = useState<number | null>(null);
  const [outOfCredits, setOutOfCredits] = useState(false);
  const largeCrawlConfirmed = useRef(false);

  const launchForm = useForm({
    defaultValues: { ...DEFAULT_LAUNCH_FORM_VALUES, url: initialUrl },
    validators: {
      onChange: ({ formApi, value }) =>
        getLaunchValidationErrors(value, {
          url: shouldValidateFieldOnChange(formApi, "url"),
          excludePaths: shouldValidateFieldOnChange(
            formApi,
            "excludePathsInput",
          ),
        }),
      onSubmit: ({ value }) =>
        getLaunchValidationErrors(value, { url: true, excludePaths: true }),
    },
    onSubmit: async ({ formApi, value }) => {
      const effectiveMaxPages = commitMaxPagesInput(
        launchForm,
        getMaxPagesLimit(isFreePlan),
      );
      formApi.setErrorMap({ onSubmit: undefined });

      if (effectiveMaxPages > 500 && !largeCrawlConfirmed.current) {
        setLargeCrawlPages(effectiveMaxPages);
        return;
      }
      largeCrawlConfirmed.current = false;

      try {
        const result = await startMutation.mutateAsync({
          projectId,
          startUrl: value.url,
          maxPages: effectiveMaxPages,
          lighthouseStrategy: value.runLighthouse ? "auto" : "none",
          renderJavaScript: value.renderJavaScript,
          excludePaths: splitExcludePathsInput(value.excludePathsInput),
        });
        toast.success("Audit started!");
        onAuditStarted(result.auditId);
      } catch (error) {
        // Starting an audit refuses for credits only when the rendering hold
        // does not fit, so the form can say how much the audit needs.
        const creditsShort =
          value.renderJavaScript &&
          getErrorCode(error) === "INSUFFICIENT_CREDITS";
        setOutOfCredits(creditsShort);
        const message = creditsShort
          ? renderingCreditsNeededText(effectiveMaxPages)
          : getStandardErrorMessage(error, "Failed to start audit");
        formApi.setErrorMap({
          onSubmit: createFormValidationErrors({ form: message }),
        });
      }
    },
  });

  const renderJavaScript = useStore(
    launchForm.store,
    (state) => state.values.renderJavaScript,
  );
  const maxPagesLimit = getMaxPagesLimit(isFreePlan);

  return {
    launchForm,
    historyQuery,
    canRenderJavaScript: capabilitiesQuery.data?.canRenderJavaScript,
    maxPagesLimit,
    renderJavaScript,
    commitMaxPagesInput: () => commitMaxPagesInput(launchForm, maxPagesLimit),
    deleteAudit: (auditId: string) => deleteMutation.mutate(auditId),
    largeCrawlPages,
    outOfCredits,
    cancelLargeCrawl: () => setLargeCrawlPages(null),
    confirmLargeCrawl: () => {
      setLargeCrawlPages(null);
      largeCrawlConfirmed.current = true;
      void launchForm.handleSubmit();
    },
  };
}

function useLaunchMutations({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  // Invalidate rather than refetch: starting an audit navigates away from the
  // list, so the stale mark is what makes it reload when the user comes back.
  const invalidateHistory = () =>
    queryClient.invalidateQueries({ queryKey: ["audit-history", projectId] });

  const startMutation = useMutation({
    meta: { errorToast: false },
    mutationFn: (data: {
      projectId: string;
      startUrl: string;
      maxPages: number;
      lighthouseStrategy: "auto" | "none";
      renderJavaScript: boolean;
      excludePaths: string[];
    }) => startAudit({ data }),
    onSuccess: () => {
      void invalidateHistory();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (auditId: string) =>
      deleteAudit({ data: { projectId, auditId } }),
    onSuccess: () => {
      void invalidateHistory();
      toast.success("Audit deleted");
    },
  });

  return { startMutation, deleteMutation };
}

function commitMaxPagesInput(
  launchForm: {
    state: { values: { maxPagesInput: string } };
    setFieldValue: (field: "maxPagesInput", value: string) => void;
  },
  maxPagesLimit: number,
) {
  const safeValue = clampMaxPagesInput(
    launchForm.state.values.maxPagesInput,
    maxPagesLimit,
  );
  launchForm.setFieldValue("maxPagesInput", String(safeValue));
  return safeValue;
}
