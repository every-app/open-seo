import { waitUntil } from "cloudflare:workers";

/**
 * For side effects the response doesn't depend on (analytics, contact
 * syncs): inside a request, `work` finishes in the background after the
 * response is sent; with no request to outlive (a Workflow step), it is
 * awaited instead. `work` should handle its own errors.
 */
export async function runAfterResponse(work: Promise<unknown>) {
  try {
    waitUntil(work);
  } catch {
    await work;
  }
}
