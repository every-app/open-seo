import { getDatabaseProvider } from "@/db/provider";

export function toRankTrackingTimestamp(date: Date): string {
  const iso = date.toISOString();
  return getDatabaseProvider() === "postgres"
    ? iso
    : iso.slice(0, 19).replace("T", " ");
}
