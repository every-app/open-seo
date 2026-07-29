import { OnPageLighthouseLiveJsonRequestInfo } from "dataforseo-client";
import {
  parseDataforseoLighthousePayload,
  requestCategories,
  type LighthouseStrategy,
} from "@/server/lib/dataforseoLighthousePayload";
import type { StoredLighthousePayload } from "@/server/lib/lighthouseStoredPayload";
import { onPageApi } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  DataforseoChargedTaskError,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";

export async function fetchLighthouseResult(input: {
  url: string;
  strategy: LighthouseStrategy;
}): Promise<DataforseoApiResponse<StoredLighthousePayload>> {
  const response = await onPageApi().lighthouseLiveJson([
    new OnPageLighthouseLiveJsonRequestInfo({
      url: input.url,
      for_mobile: input.strategy === "mobile",
      categories: [...requestCategories],
    }),
  ]);

  // assertOk handles status / charged-task billing; parse extracts the scores.
  // Build billing before parse so a post-charge parse failure still meters via
  // DataforseoChargedTaskError (plain Error would skip metering and get retried).
  const task = assertOk(response);
  const billing = buildTaskBilling(task);
  try {
    const data = parseDataforseoLighthousePayload(response, input);
    return { data, billing };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DataforseoChargedTaskError(message, billing);
  }
}
