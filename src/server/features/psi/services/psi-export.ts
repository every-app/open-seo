import {
  PsiIssuesService,
  type PsiIssueCategory,
} from "@/server/features/psi/services/PsiIssuesService";

type PsiStrategy = "mobile" | "desktop";
type ExportMode = "full" | "issues" | "category";

export function buildPsiExportFile(input: {
  idField: "auditId" | "resultId";
  idValue: string;
  finalUrl: string;
  strategy: PsiStrategy;
  createdAt: string;
  payloadJson: string;
  mode: ExportMode;
  category?: PsiIssueCategory;
}) {
  const safeDate = input.createdAt.replace(/[:.]/g, "-");
  const baseName = `psi-${input.strategy}-${safeDate}`;

  if (input.mode === "full") {
    return {
      filename: `${baseName}-full.json`,
      content: input.payloadJson,
    };
  }

  const issues = PsiIssuesService.parseIssues(
    input.payloadJson,
    input.category,
  );

  return {
    filename:
      input.mode === "category" && input.category
        ? `${baseName}-${input.category}-issues.json`
        : `${baseName}-issues.json`,
    content: JSON.stringify(
      {
        [input.idField]: input.idValue,
        finalUrl: input.finalUrl,
        strategy: input.strategy,
        createdAt: input.createdAt,
        category: input.category ?? "all",
        issues,
      },
      null,
      2,
    ),
  };
}
