import { stopClientErrorCapture } from "./posthog";

const RELOADED_AT_KEY = "new-deploy-reloaded-at";

// Reloads a tab still running an older build so it picks up the new deploy.
// At most once per 30s, so a failure a reload can't fix surfaces as an error
// instead of looping. Returns whether it reloaded.
//
// Error capture is stopped first: errors thrown while the reload is pending
// are side effects of the old build, not bugs.
export function reloadForNewDeploy(): boolean {
  try {
    const reloadedAt = Number(
      window.sessionStorage.getItem(RELOADED_AT_KEY) ?? 0,
    );
    if (Date.now() - reloadedAt < 30_000) return false;
    window.sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
  } catch {
    // Without sessionStorage we can't bound reload attempts, so let the
    // error surface instead of risking a reload loop.
    return false;
  }
  stopClientErrorCapture();
  window.location.reload();
  return true;
}
