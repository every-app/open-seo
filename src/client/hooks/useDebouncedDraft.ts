import { useEffect, useRef, useState } from "react";

/**
 * Local draft of a URL-backed value for live-typed inputs. Edits stay local
 * and commit after a pause, so each keystroke does not navigate. The draft
 * follows URL changes it did not cause (back/forward, "Clear all").
 */
export function useDebouncedDraft<T>(
  applied: T,
  commit: (value: T) => void,
  /** The draft as the URL will store it ("10." becomes "10"). */
  normalize: (value: T) => T = (value) => value,
  delayMs = 350,
) {
  const [draft, setDraft] = useState(applied);
  const appliedKey = JSON.stringify(applied);
  const [syncedKey, setSyncedKey] = useState(appliedKey);
  // True from a commit until the URL shows it.
  const [awaitingCommit, setAwaitingCommit] = useState(false);
  const callbacksRef = useRef({ commit, normalize });
  useEffect(() => {
    callbacksRef.current = { commit, normalize };
  });

  if (syncedKey !== appliedKey) {
    setSyncedKey(appliedKey);
    if (awaitingCommit) setAwaitingCommit(false);
    else setDraft(applied);
  }

  useEffect(() => {
    const next = callbacksRef.current.normalize(draft);
    if (JSON.stringify(next) === appliedKey) return;
    const timer = window.setTimeout(() => {
      setAwaitingCommit(true);
      callbacksRef.current.commit(next);
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [appliedKey, delayMs, draft]);

  return [draft, setDraft] as const;
}
