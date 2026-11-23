import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import type { DistanceUnit } from "@/shared/distance-unit";

/** The user's saved unit, or `fallback` when they haven't picked one. */
async function get(input: { userId: string; fallback: DistanceUnit }) {
  const saved = await AuthRepository.getDistanceUnit(input.userId);
  return saved ?? input.fallback;
}

async function set(input: { userId: string; unit: DistanceUnit }) {
  await AuthRepository.setDistanceUnit(input.userId, input.unit);
}

export const DistanceUnitService = { get, set };
