import { useEffect, useState } from "react";
import { z } from "zod";
import {
  DEFAULT_LOCATION_CODE,
  isSupportedLocationCode,
} from "@/client/features/keywords/locations";

// Scoped per project: a location picked while working on one project must not
// shadow another project's own default market.
const storageKey = (projectId: string) =>
  `keyword-preferred-location:${projectId}`;
const locationCodeSchema = z.number().int().positive();

function loadPreferredLocationCode(projectId: string) {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return null;

    const parsed = locationCodeSchema.parse(JSON.parse(raw));
    return isSupportedLocationCode(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function savePreferredLocationCode(projectId: string, locationCode: number) {
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(locationCode));
  } catch {
    // storage full or unavailable - silently ignore
  }
}

/**
 * Preference order: the user's explicit choice for this project (persisted per
 * browser) > the project's default market (may arrive async from the projects
 * query) > the US fallback.
 */
export function usePreferredKeywordLocation(
  projectId: string,
  projectDefaultLocationCode?: number,
) {
  const [preference, setPreference] = useState(() => ({
    projectId,
    locationCode: loadPreferredLocationCode(projectId),
  }));
  const chosenLocationCode =
    preference.projectId === projectId
      ? preference.locationCode
      : loadPreferredLocationCode(projectId);

  useEffect(() => {
    if (preference.projectId === projectId) return;
    setPreference({ projectId, locationCode: chosenLocationCode });
  }, [chosenLocationCode, preference.projectId, projectId]);

  const preferredLocationCode =
    chosenLocationCode ?? projectDefaultLocationCode ?? DEFAULT_LOCATION_CODE;

  function setPreferredLocationCode(locationCode: number) {
    if (!isSupportedLocationCode(locationCode)) return;
    setPreference({ projectId, locationCode });
    savePreferredLocationCode(projectId, locationCode);
  }

  return {
    preferredLocationCode,
    selectedLocationCode: chosenLocationCode ?? undefined,
    setPreferredLocationCode,
  };
}
