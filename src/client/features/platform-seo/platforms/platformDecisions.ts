import type { PsPlatformDecision } from "@/shared/platform-seo";

export const DECISION_ITEMS: Array<{
  value: PsPlatformDecision;
  label: string;
}> = [
  { value: "parasite", label: "Parasite" },
  { value: "not_parasite", label: "Not parasite" },
  { value: "tool", label: "Tool" },
  { value: "sponsorship", label: "Sponsorship marketplace" },
];

export function asDecision(value: unknown): PsPlatformDecision | null {
  return DECISION_ITEMS.find((item) => item.value === value)?.value ?? null;
}
