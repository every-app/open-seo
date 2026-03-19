import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  deleteAudit,
  getAuditHistory,
  startAudit,
} from "@/serverFunctions/audit";
import {
  clearProjectPsiApiKey,
  getProjectPsiApiKey,
  saveProjectPsiApiKey,
} from "@/serverFunctions/psi";
import {
  MAX_PAGES_LIMIT,
  MIN_PAGES,
  useLaunchForm,
  useSettingsForm,
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
  const settingsForm = useSettingsForm();
  const [state, setState] = useState<LaunchState>({
    isSettingsOpen: false,
    showPsiKey: false,
    urlError: null,
    psiRequirementError: null,
    startError: null,
    settingsError: null,
  });

  const historyQuery = useQuery({
    queryKey: ["audit-history", projectId],
    queryFn: () => getAuditHistory({ data: { projectId } }),
  });
  const keyQuery = useQuery({
    queryKey: ["projectPsiApiKey", projectId],
    queryFn: () => getProjectPsiApiKey({ data: { projectId } }),
  });
  const { startMutation, deleteMutation, saveKeyMutation, clearKeyMutation } =
    useLaunchMutations({
      projectId,
      historyRefetch: historyQuery.refetch,
      keyRefetch: keyQuery.refetch,
      clearPsiApiKeyField: () => settingsForm.setFieldValue("psiApiKey", ""),
    });

  useSyncPsiKeyField(keyQuery.data?.apiKey, settingsForm);

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
    const settingsValues = settingsForm.state.values;
    const effectiveMaxPages = commitMaxPagesInput();
    setState((prev) => ({ ...prev, startError: null }));

    if (!launchValues.url.trim())
      return setState((prev) => ({ ...prev, urlError: "Please enter a URL." }));
    if (launchValues.runPsi && !settingsValues.psiApiKey.trim()) {
      return setState((prev) => ({
        ...prev,
        psiRequirementError:
          "Set a Google PageSpeed Insights API key before running PSI checks.",
        isSettingsOpen: true,
      }));
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
        psiStrategy: launchValues.runPsi ? launchValues.psiMode : "none",
        psiApiKey: launchValues.runPsi
          ? settingsValues.psiApiKey || undefined
          : undefined,
      },
      {
        onSuccess: (result) => {
          setState((prev) => ({
            ...prev,
            urlError: null,
            psiRequirementError: null,
            startError: null,
          }));
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
    settingsForm,
    state,
    setState,
    historyQuery,
    startMutation,
    commitMaxPagesInput,
    handleSubmit: (event: FormEvent) => {
      event.preventDefault();
      handleStart();
    },
    openSettings: () => setState((prev) => ({ ...prev, isSettingsOpen: true })),
    onRunPsiToggle: (checked: boolean) =>
      handleRunPsiToggle(checked, launchForm, settingsForm, setState),
    saveSettings: () =>
      handleSaveSettings(settingsForm, setState, saveKeyMutation.mutate),
    clearPsiKey: () => clearKeyMutation.mutate(),
    deleteAudit: (auditId: string) => deleteMutation.mutate(auditId),
  };
}

function useSyncPsiKeyField(
  apiKey: string | null | undefined,
  settingsForm: ReturnType<typeof useSettingsForm>,
) {
  useEffect(() => {
    if (apiKey) {
      settingsForm.setFieldValue("psiApiKey", apiKey);
    }
  }, [apiKey, settingsForm]);
}

function useLaunchMutations({
  projectId,
  historyRefetch,
  keyRefetch,
  clearPsiApiKeyField,
}: {
  projectId: string;
  historyRefetch: () => Promise<unknown>;
  keyRefetch: () => Promise<unknown>;
  clearPsiApiKeyField: () => void;
}) {
  const startMutation = useMutation({
    mutationFn: (data: {
      projectId: string;
      startUrl: string;
      maxPages: number;
      psiStrategy: "auto" | "all" | "none";
      psiApiKey?: string;
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

  const saveKeyMutation = useMutation({
    mutationFn: (apiKey: string) =>
      saveProjectPsiApiKey({ data: { projectId, apiKey } }),
    onSuccess: async () => {
      toast.success("PSI API key saved for this project");
      await keyRefetch();
    },
  });

  const clearKeyMutation = useMutation({
    mutationFn: () => clearProjectPsiApiKey({ data: { projectId } }),
    onSuccess: async () => {
      clearPsiApiKeyField();
      toast.success("PSI API key cleared");
      await keyRefetch();
    },
  });

  return { startMutation, deleteMutation, saveKeyMutation, clearKeyMutation };
}

function handleRunPsiToggle(
  checked: boolean,
  launchForm: ReturnType<typeof useLaunchForm>,
  settingsForm: ReturnType<typeof useSettingsForm>,
  setState: React.Dispatch<React.SetStateAction<LaunchState>>,
) {
  if (!checked) {
    setState((prev) => ({ ...prev, psiRequirementError: null }));
    launchForm.setFieldValue("runPsi", false);
    return;
  }

  if (!settingsForm.state.values.psiApiKey.trim()) {
    setState((prev) => ({ ...prev, isSettingsOpen: true }));
    return;
  }

  launchForm.setFieldValue("runPsi", true);
}

function handleSaveSettings(
  settingsForm: ReturnType<typeof useSettingsForm>,
  setState: React.Dispatch<React.SetStateAction<LaunchState>>,
  save: (apiKey: string) => void,
) {
  const trimmed = settingsForm.state.values.psiApiKey.trim();
  if (!trimmed) {
    setState((prev) => ({
      ...prev,
      settingsError: "Please enter an API key.",
    }));
    return;
  }

  setState((prev) => ({
    ...prev,
    settingsError: null,
    psiRequirementError: null,
    showPsiKey: false,
    isSettingsOpen: false,
  }));
  save(trimmed);
}
