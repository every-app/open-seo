export const MIN_PAGES = 10;
export const MAX_PAGES_LIMIT = 10_000;

export type LaunchFormValues = {
  url: string;
  maxPagesInput: string;
  runLighthouse: boolean;
  lighthouseMode: "auto" | "all";
};

export const DEFAULT_LAUNCH_FORM_VALUES: LaunchFormValues = {
  url: "",
  maxPagesInput: "50",
  runLighthouse: false,
  lighthouseMode: "auto",
};
