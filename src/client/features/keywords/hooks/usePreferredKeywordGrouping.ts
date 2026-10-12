import { useEffect, useState } from "react";
import { z } from "zod";

const storageKey = (projectId: string) =>
  `keyword-preferred-grouping:${projectId}`;

function loadPreferredGrouping(projectId: string): boolean {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return false;
    return z.boolean().parse(JSON.parse(raw));
  } catch {
    return false;
  }
}

/** Like country selection, grouping is a per-project browser preference. */
export function usePreferredKeywordGrouping(projectId: string) {
  const [preference, setPreference] = useState(() => ({
    projectId,
    groupKeywords: loadPreferredGrouping(projectId),
  }));
  const groupKeywords =
    preference.projectId === projectId
      ? preference.groupKeywords
      : loadPreferredGrouping(projectId);

  useEffect(() => {
    if (preference.projectId === projectId) return;
    setPreference({ projectId, groupKeywords });
  }, [groupKeywords, preference.projectId, projectId]);

  function setGroupKeywords(nextGroupKeywords: boolean) {
    setPreference({ projectId, groupKeywords: nextGroupKeywords });
    try {
      localStorage.setItem(
        storageKey(projectId),
        JSON.stringify(nextGroupKeywords),
      );
    } catch {
      // Keep the current choice usable when browser storage is unavailable.
    }
  }

  return { groupKeywords, setGroupKeywords };
}
