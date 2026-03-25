import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  deleteAudit,
  getAuditHistory,
  startAudit,
} from "@/serverFunctions/audit";
import {
  MAX_PAGES_LIMIT,
  MIN_PAGES,
  useLaunchForm,
  type LaunchState,
} from "@/client/features/audit/launch/types";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

export function useLaunchController({
  projectId,
  onAuditStarted,
}: {
  projectId: string;
  onAuditStarted: (auditId: string) => void;
}) {
  const launchForm = useLaunchForm();
  const [state, setState] = useState<LaunchState>({
    urlError: null,
    startError: null,
  });

  const historyQuery = useQuery({
    queryKey: ["audit-history", projectId],
    queryFn: () => getAuditHistory({ data: { projectId } }),
  });
  const { startMutation, deleteMutation } = useLaunchMutations({
    projectId,
    historyRefetch: historyQuery.refetch,
  });

  const applyMaxPages = (value: number) => {
    const safeValue = Number.isFinite(value)
      ? Math.max(MIN_PAGES, Math.min(MAX_PAGES_LIMIT, Math.round(value)))
      : MIN_PAGES;
    launchForm.setFieldValue("maxPagesInput", String(safeValue));
    return safeValue;
  };

  const commitMaxPagesInput = () => {
    const maxPagesInput = launchForm.state.values.maxPagesInput;
    if (!maxPagesInput) return applyMaxPages(MIN_PAGES);
    return applyMaxPages(Number.parseInt(maxPagesInput, 10));
  };

  const handleStart = () => {
    const launchValues = launchForm.state.values;
    const effectiveMaxPages = commitMaxPagesInput();
    setState((prev) => ({ ...prev, startError: null }));

    if (!launchValues.url.trim()) {
      return setState((prev) => ({ ...prev, urlError: "Please enter a URL." }));
    }

    if (effectiveMaxPages > 500) {
      const confirmed = window.confirm(
        `You are about to crawl ${effectiveMaxPages.toLocaleString()} pages. This is okay, but it may take a while. Continue?`,
      );
      if (!confirmed) return;
    }

    startMutation.mutate(
      {
        projectId,
        startUrl: launchValues.url,
        maxPages: effectiveMaxPages,
        lighthouseStrategy: launchValues.runLighthouse
          ? launchValues.lighthouseMode
          : "none",
      },
      {
        onSuccess: (result) => {
          setState({ urlError: null, startError: null });
          toast.success("Audit started!");
          onAuditStarted(result.auditId);
        },
        onError: (error) => {
          setState((prev) => ({
            ...prev,
            startError: getStandardErrorMessage(error, "Failed to start audit"),
          }));
        },
      },
    );
  };

  return {
    launchForm,
    state,
    setState,
    historyQuery,
    startMutation,
    commitMaxPagesInput,
    handleSubmit: (event: FormEvent) => {
      event.preventDefault();
      handleStart();
    },
    onRunLighthouseToggle: (checked: boolean) =>
      handleRunLighthouseToggle(checked, launchForm),
    deleteAudit: (auditId: string) => deleteMutation.mutate(auditId),
  };
}

function useLaunchMutations({
  projectId,
  historyRefetch,
}: {
  projectId: string;
  historyRefetch: () => Promise<unknown>;
}) {
  const startMutation = useMutation({
    mutationFn: (data: {
      projectId: string;
      startUrl: string;
      maxPages: number;
      lighthouseStrategy: "auto" | "all" | "none";
    }) => startAudit({ data }),
  });

  const deleteMutation = useMutation({
    mutationFn: (auditId: string) =>
      deleteAudit({ data: { projectId, auditId } }),
    onSuccess: () => {
      void historyRefetch();
      toast.success("Audit deleted");
    },
  });

  return { startMutation, deleteMutation };
}

function handleRunLighthouseToggle(
  checked: boolean,
  launchForm: ReturnType<typeof useLaunchForm>,
) {
  launchForm.setFieldValue("runLighthouse", checked);
}
