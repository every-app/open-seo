export const categoryTabs = [
  "all",
  "performance",
  "accessibility",
  "best-practices",
  "seo",
] as const;

export type CategoryTab = (typeof categoryTabs)[number];
export type IssueCategory = Exclude<CategoryTab, "all">;

export type ExportPayload = {
  mode: "full" | "issues" | "category";
  category?: IssueCategory;
};

export type PsiIssue = {
  auditKey: string;
  category: IssueCategory;
  severity: "critical" | "warning" | "info";
  score?: number | null;
  title: string;
  displayValue?: string | null;
  description?: string | null;
  impactMs?: number | null;
  impactBytes?: number | null;
  items: string[];
};
