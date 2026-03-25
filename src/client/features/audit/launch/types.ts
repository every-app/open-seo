import { useForm } from "@tanstack/react-form";

export type LaunchState = {
  urlError: string | null;
  startError: string | null;
};

export const MIN_PAGES = 10;
export const MAX_PAGES_LIMIT = 10_000;

export function useLaunchForm() {
  return useForm({
    defaultValues: {
      url: "",
      maxPagesInput: "50",
      runLighthouse: false,
      lighthouseMode: "auto" as "auto" | "all",
    },
  });
}

export type LaunchFormApi = ReturnType<typeof useLaunchForm>;
