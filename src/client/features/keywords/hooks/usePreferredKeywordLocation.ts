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

export function usePreferredKeywordLocation() {
  const [preferredLocationCode, setPreferredLocationCodeState] = useState(
    DEFAULT_LOCATION_CODE,
  );

  useEffect(() => {
    const savedLocationCode = loadPreferredLocationCode();
    if (savedLocationCode != null) {
      setPreferredLocationCodeState(savedLocationCode);
    }
  }, []);

  function setPreferredLocationCode(locationCode: number) {
    if (!isSupportedLocationCode(locationCode)) return;
    setPreferredLocationCodeState(locationCode);
    savePreferredLocationCode(locationCode);
  }

  return { preferredLocationCode, setPreferredLocationCode };
}
