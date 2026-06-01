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
  const task = assertOk(response);
  const data = parseDataforseoLighthousePayload(response, input);

  return { data, billing: buildTaskBilling(task) };
}
