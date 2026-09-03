export const CONTENT_EXECUTION_STATUSES = [
  "backlog",
  "ready_to_assign",
  "briefing",
  "writing",
  "review",
  "ready_to_publish",
  "published",
  "blocked",
] as const;

export type ContentExecutionStatus =
  (typeof CONTENT_EXECUTION_STATUSES)[number];

const contentExecutionStatusByValue = new Map<string, ContentExecutionStatus>(
  CONTENT_EXECUTION_STATUSES.map((status) => [status, status]),
);

export function parseContentExecutionStatus(
  value: string,
): ContentExecutionStatus {
  const status = contentExecutionStatusByValue.get(value);
  if (!status) throw new Error(`Unknown content execution status: ${value}`);
  return status;
}

export type ContentExecutionSummary = {
  id: string;
  title: string;
  status: ContentExecutionStatus;
  owner: string | null;
  dueDate: string | null;
  jiraIssueKey: string | null;
  jiraIssueUrl: string | null;
};

export type ContentExecutionKeyword = {
  id: string;
  keyword: string;
  isPrimary: boolean;
};

export type ContentExecutionItem = ContentExecutionSummary & {
  projectId: string;
  targetUrl: string | null;
  primaryKeyword: string;
  keywordCount: number;
  keywords: ContentExecutionKeyword[];
  createdAt: string;
  updatedAt: string;
};
