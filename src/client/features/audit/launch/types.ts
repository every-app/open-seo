export const MIN_PAGES = 10;
export const MAX_PAGES_LIMIT = 10_000;

export type LaunchFormValues = {
  url: string;
  maxPagesInput: string;
  runLighthouse: boolean;
};

export const DEFAULT_LAUNCH_FORM_VALUES: LaunchFormValues = {
  url: "",
  maxPagesInput: "50",
  // On by default: without Lighthouse the results view has no Performance tab
  // and the only way to add one is re-crawling the whole site.
  runLighthouse: true,
};
