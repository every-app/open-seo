import type { ContentExecutionStatus } from "@/types/content-execution";

const STATUS_LABELS: Record<ContentExecutionStatus, string> = {
  backlog: "Backlog",
  ready_to_assign: "Ready to assign",
  briefing: "Briefing",
  writing: "Writing",
  review: "Review",
  ready_to_publish: "Ready to publish",
  published: "Published",
  blocked: "Blocked",
};

const STATUS_CLASSES: Record<ContentExecutionStatus, string> = {
  backlog: "badge-ghost",
  ready_to_assign: "badge-info badge-outline",
  briefing: "badge-info",
  writing: "badge-warning",
  review: "badge-secondary",
  ready_to_publish: "badge-accent",
  published: "badge-success",
  blocked: "badge-error",
};

export function getContentExecutionStatusLabel(status: ContentExecutionStatus) {
  return STATUS_LABELS[status];
}

export function getContentExecutionStatusClass(status: ContentExecutionStatus) {
  return STATUS_CLASSES[status];
}

export function getJiraIssueLabel(issueKey: string | null) {
  return issueKey ?? "Open Jira issue";
}
