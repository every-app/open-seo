import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";

const API_BASE = "https://api.dataforseo.com";

const userDataResponseSchema = z
  .object({
    status_code: z.number().optional(),
    tasks: z
      .array(
        z
          .object({
            status_code: z.number().optional(),
            result: z
              .array(
                z
                  .object({
                    backlinks_subscription_expiry_date: z
                      .string()
                      .nullable()
                      .optional(),
                    llm_mentions_subscription_expiry_date: z
                      .string()
                      .nullable()
                      .optional(),
                  })
                  .passthrough(),
              )
              .nullable()
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

type DataforseoAccountState = {
  backlinksSubscriptionExpiryDate: string | null;
  llmMentionsSubscriptionExpiryDate: string | null;
};

export function hasActiveDataforseoSubscription(
  expiryDate: string | null,
): boolean {
  if (!expiryDate) return false;

  const expiryTime = Date.parse(expiryDate);
  return Number.isFinite(expiryTime) && expiryTime > Date.now();
}

export async function fetchDataforseoAccountState(): Promise<DataforseoAccountState | null> {
  const apiKey = await getRequiredEnvValue("DATAFORSEO_API_KEY");
  const response = await fetch(`${API_BASE}/v3/appendix/user_data`, {
    method: "GET",
    headers: { Authorization: `Basic ${apiKey}` },
  });

  if (!response.ok) {
    throw new AppError(
      "INTERNAL_ERROR",
      `DataForSEO HTTP ${response.status} on /v3/appendix/user_data`,
    );
  }

  const raw = await response.json();
  const parsed = userDataResponseSchema.safeParse(raw);
  if (!parsed.success || parsed.data.status_code !== 20000) return null;

  const task = parsed.data.tasks?.[0];
  if (!task || task.status_code !== 20000) return null;

  const result = task.result?.[0];
  if (!result) return null;

  return {
    backlinksSubscriptionExpiryDate:
      result.backlinks_subscription_expiry_date ?? null,
    llmMentionsSubscriptionExpiryDate:
      result.llm_mentions_subscription_expiry_date ?? null,
  };
}
