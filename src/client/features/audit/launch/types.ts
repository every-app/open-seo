import {
  DEFAULT_AUDIT_PAGES,
  FREE_MAX_AUDIT_PAGES,
  MIN_AUDIT_PAGES,
  PAID_MAX_AUDIT_PAGES,
  RENDERED_MAX_AUDIT_PAGES,
} from "@/shared/audit-limits";

export const MIN_PAGES = MIN_AUDIT_PAGES;

export function getMaxPagesLimit(
  isFreePlan: boolean,
  renderJavaScript: boolean,
) {
  const planLimit = isFreePlan ? FREE_MAX_AUDIT_PAGES : PAID_MAX_AUDIT_PAGES;
  return renderJavaScript
    ? Math.min(planLimit, RENDERED_MAX_AUDIT_PAGES)
    : planLimit;
}

/** The page limit an audit runs with for what is typed in the form. */
export function clampMaxPagesInput(input: string, maxPagesLimit: number) {
  const value = input ? Number.parseInt(input, 10) : MIN_PAGES;
  return Number.isFinite(value)
    ? Math.max(MIN_PAGES, Math.min(maxPagesLimit, Math.round(value)))
    : MIN_PAGES;
}

export type LaunchFormValues = {
  url: string;
  maxPagesInput: string;
  runLighthouse: boolean;
  renderJavaScript: boolean;
};

export const DEFAULT_LAUNCH_FORM_VALUES: LaunchFormValues = {
  url: "",
  maxPagesInput: String(DEFAULT_AUDIT_PAGES),
  runLighthouse: false,
  renderJavaScript: false,
};
