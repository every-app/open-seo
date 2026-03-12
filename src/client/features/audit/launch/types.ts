import { useForm } from "@tanstack/react-form";

export type LaunchState = {
  isSettingsOpen: boolean;
  showPsiKey: boolean;
  urlError: string | null;
  psiRequirementError: string | null;
  startError: string | null;
  settingsError: string | null;
};

export const MIN_PAGES = 10;
export const MAX_PAGES_LIMIT = 10_000;

export function useLaunchForm() {
  return useForm({
    defaultValues: {
      url: "",
      maxPagesInput: "50",
      runPsi: false,
      psiMode: "auto" as "auto" | "all",
    },
  });
}

export function useSettingsForm() {
  return useForm({ defaultValues: { psiApiKey: "" } });
}

export type LaunchFormApi = ReturnType<typeof useLaunchForm>;
export type SettingsFormApi = ReturnType<typeof useSettingsForm>;
