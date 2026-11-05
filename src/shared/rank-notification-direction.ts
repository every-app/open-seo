import type { RankPositionChangeDirection } from "@/types/schemas/notifications";

const LABELS: Record<RankPositionChangeDirection, string> = {
  either: "Any direction",
  improved: "Rank improved only",
  worsened: "Rank dropped only",
};

export function rankDirectionLabel(
  direction: RankPositionChangeDirection,
): string {
  return LABELS[direction];
}
