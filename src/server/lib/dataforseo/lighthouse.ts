import { dataforseoPostResponse } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  DataforseoChargedTaskError,
  type DataforseoApiResponse,
  type DataforseoResponseLike,
  type DataforseoTaskLike,
} from "@/server/lib/dataforseo/envelope";
import {
  parseDataforseoLighthousePayload,
  requestCategories,
  type LighthouseStrategy,
} from "@/server/lib/dataforseoLighthousePayload";
import type { StoredLighthousePayload } from "@/server/lib/lighthouseStoredPayload";

const LIGHTHOUSE_PATH = "/v3/on_page/lighthouse/live/json";
const REQUEST_TIMEOUT_MS = 60_000;

// One payload read+parse at a time per isolate. This module runs in the
// open-seo-audit worker, and the raw Lighthouse payload (1-10MB, held several
// times over while parsing) is the operation that OOMed the main worker;
// concurrent checks bursting onto one isolate could do the same here. The
// DataForSEO fetches themselves stay concurrent — parsing (well under a
// second each) is cheap against a 30-60s fetch, and workerd streams un-read
// response bodies, so queued siblings don't buffer.
let parseChain: Promise<unknown> = Promise.resolve();
function withParseLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = parseChain.then(fn, fn);
  parseChain = run.catch(() => {});
  return run;
}

export async function fetchLighthouseResult(input: {
  url: string;
  strategy: LighthouseStrategy;
}): Promise<DataforseoApiResponse<StoredLighthousePayload>> {
  // Billed, non-idempotent POST: a 5xx does not prove the provider skipped
  // the charge, so never replay it. The response is taken un-consumed (unlike
  // dataforseoPost) so the multi-MB body read happens inside the parse lock,
  // and the timeout is cleared once headers arrive — an armed signal would
  // otherwise cover a body read queued behind the lock past 60s and abort an
  // already-billed call unmetered.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await dataforseoPostResponse(
      LIGHTHOUSE_PATH,
      [
        {
          url: input.url,
          for_mobile: input.strategy === "mobile",
          categories: [...requestCategories],
        },
      ],
      { maxServerErrorRetries: 0, signal: controller.signal },
    );
  } finally {
    clearTimeout(timeout);
  }

  return withParseLock(async () => {
    const body =
      await response.json<DataforseoResponseLike<DataforseoTaskLike>>();
    // Build the metering envelope before parsing. The provider has already
    // charged a successful task, so a malformed payload must carry its
    // billing metadata out to the metered client instead of looking
    // retryable.
    const task = assertOk(body);
    const billing = buildTaskBilling(task);
    try {
      const data = parseDataforseoLighthousePayload(body, input);
      return { data, billing };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DataforseoChargedTaskError(message, billing);
    }
  });
}
