import { useEffect, useState } from "react";
import { z } from "zod";
import {
  DEFAULT_LOCATION_CODE,
  isSupportedLocationCode,
} from "@/client/features/keywords/locations";

const STORAGE_KEY = "keyword-preferred-location";
const locationCodeSchema = z.number().int().positive();

function loadPreferredLocationCode() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = locationCodeSchema.parse(JSON.parse(raw));
    return isSupportedLocationCode(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function savePreferredLocationCode(locationCode: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(locationCode));
  } catch {
    // storage full or unavailable - silently ignore
  }
}

/**
 * Preference order: the user's explicit choice (persisted per browser) >
 * the project's default market (may arrive async from the projects query) >
 * the US fallback.
 */
export function usePreferredKeywordLocation(
  projectDefaultLocationCode?: number,
) {
  const [chosenLocationCode, setChosenLocationCode] = useState<number | null>(
    null,
  );

  useEffect(() => {
    const savedLocationCode = loadPreferredLocationCode();
    if (savedLocationCode != null) {
      setChosenLocationCode(savedLocationCode);
    }
  }, []);

  const preferredLocationCode =
    chosenLocationCode ?? projectDefaultLocationCode ?? DEFAULT_LOCATION_CODE;

  function setPreferredLocationCode(locationCode: number) {
    if (!isSupportedLocationCode(locationCode)) return;
    setChosenLocationCode(locationCode);
    savePreferredLocationCode(locationCode);
  }

  return { preferredLocationCode, setPreferredLocationCode };
}
