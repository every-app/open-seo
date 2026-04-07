import { useEffect, useState } from "react";
import {
  DEFAULT_BACKLINKS_SPAM_THRESHOLD,
  normalizeBacklinksSpamThreshold,
} from "@/types/schemas/backlinks";

const STORAGE_KEY = "backlinks-spam-preferences";

type BacklinksSpamPreferences = {
  hideSpam: boolean;
  spamThreshold: number;
};

const DEFAULT_PREFERENCES: BacklinksSpamPreferences = {
  hideSpam: true,
  spamThreshold: DEFAULT_BACKLINKS_SPAM_THRESHOLD,
};

function normalizeBacklinksSpamPreferences(
  value: unknown,
): BacklinksSpamPreferences {
  if (!value || typeof value !== "object") {
    return DEFAULT_PREFERENCES;
  }

  const preferences = value as {
    hideSpam?: unknown;
    spamThreshold?: unknown;
  };

  return {
    hideSpam:
      typeof preferences.hideSpam === "boolean"
        ? preferences.hideSpam
        : DEFAULT_PREFERENCES.hideSpam,
    spamThreshold: normalizeBacklinksSpamThreshold(
      typeof preferences.spamThreshold === "number"
        ? preferences.spamThreshold
        : DEFAULT_PREFERENCES.spamThreshold,
    ),
  };
}

function loadBacklinksSpamPreferences() {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCES;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;

    return normalizeBacklinksSpamPreferences(JSON.parse(raw));
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function saveBacklinksSpamPreferences(preferences: BacklinksSpamPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // storage full or unavailable - silently ignore
  }
}

export function useBacklinksSpamPreferences() {
  const [preferences, setPreferences] = useState<BacklinksSpamPreferences>(
    loadBacklinksSpamPreferences,
  );

  useEffect(() => {
    saveBacklinksSpamPreferences(preferences);
  }, [preferences]);

  function setHideSpam(nextHideSpam: boolean) {
    setPreferences((current) => ({
      ...current,
      hideSpam: nextHideSpam,
    }));
  }

  function setSpamThreshold(nextSpamThreshold: number) {
    setPreferences((current) => ({
      ...current,
      spamThreshold: normalizeBacklinksSpamThreshold(nextSpamThreshold),
    }));
  }

  return {
    hideSpam: preferences.hideSpam,
    setHideSpam,
    setSpamThreshold,
    spamThreshold: preferences.spamThreshold,
  };
}
