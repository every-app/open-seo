export const LIGHTHOUSE_CATEGORIES = [
  "performance",
  "accessibility",
  "best-practices",
  "seo",
] as const;

export const LIGHTHOUSE_CATEGORY_TABS = [
  "all",
  ...LIGHTHOUSE_CATEGORIES,
] as const;

export type LighthouseCategory = (typeof LIGHTHOUSE_CATEGORIES)[number];
export type LighthouseCategoryTab = (typeof LIGHTHOUSE_CATEGORY_TABS)[number];
