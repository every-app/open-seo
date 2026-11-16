import { PS_TOPIC_STATUSES, type PsTopicStatus } from "@/shared/platform-seo";

export const STATUS_LABELS: Record<PsTopicStatus, string> = {
  idea: "Idea",
  drafting: "Drafting",
  ready: "Ready",
  published: "Published",
};

export const STATUS_ITEMS = PS_TOPIC_STATUSES.map((value) => ({
  value,
  label: STATUS_LABELS[value],
}));

export function asTopicStatus(value: unknown): PsTopicStatus | null {
  return PS_TOPIC_STATUSES.find((status) => status === value) ?? null;
}

// The column a topic moves to with the card's arrows.
export function neighbourStatus(status: PsTopicStatus, step: -1 | 1) {
  return PS_TOPIC_STATUSES[PS_TOPIC_STATUSES.indexOf(status) + step] ?? null;
}
