import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { classifyBacklinksError } from "@/server/lib/dataforseoBacklinksSupport";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";

const API_BASE = "https://api.dataforseo.com";

const userDataResponseSchema = z
  .object({
    status_code: z.number().optional(),
    status_message: z.string().optional(),
    tasks: z
      .array(
        z
          .object({
            status_code: z.number().optional(),
            status_message: z.string().optional(),
            result: z
              .array(
                z
                  .object({
                    money: z
                      .object({
                        balance: z.number().nullable().optional(),
                      })
                      .passthrough()
                      .optional(),
                    backlinks_subscription_expiry_date: z
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

async function createAuthenticatedFetch() {
  const apiKey = await getRequiredEnvValue("DATAFORSEO_API_KEY");

  return (url: RequestInfo, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Basic ${apiKey}`);

    return fetch(url, {
      ...init,
      headers,
    });
  };
}

async function getDataforseo(path: string) {
  const authenticatedFetch = await createAuthenticatedFetch();
  const response = await authenticatedFetch(`${API_BASE}${path}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new AppError(
      "INTERNAL_ERROR",
      `DataForSEO HTTP ${response.status} on ${path}`,
    );
  }

  return await response.json();
}

async function fetchBacklinksAccountState() {
  const raw = await getDataforseo("/v3/appendix/user_data");
  const parsed = userDataResponseSchema.safeParse(raw);
  if (!parsed.success || parsed.data.status_code !== 20000) {
    return null;
  }

  const task = parsed.data.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    return null;
  }

  const result = task.result?.[0];
  if (!result) {
    return null;
  }

  return {
    balance: result.money?.balance ?? null,
    backlinksSubscriptionExpiryDate:
      result.backlinks_subscription_expiry_date ?? null,
  };
}

function hasActiveBacklinksSubscription(value: string | null) {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return true;
  return parsed.getTime() > Date.now();
}

export async function classifyBacklinksErrorWithAccountState(
  status: number | undefined,
  details: string,
  path: string,
) {
  const classifiedError = classifyBacklinksError(status, details, path);
  if (classifiedError) {
    return classifiedError;
  }

  const text = details.toLowerCase();
  const needsAccountLookup =
    path.includes("/backlinks/") &&
    (status === 402 ||
      status === 403 ||
      text.includes("backlinks") ||
      text.includes("subscription") ||
      text.includes("billing") ||
      text.includes("balance") ||
      text.includes("payment"));

  if (!needsAccountLookup) {
    return null;
  }

  const accountState = await fetchBacklinksAccountState().catch(() => null);
  if (!accountState) {
    return null;
  }

  if (
    !hasActiveBacklinksSubscription(
      accountState.backlinksSubscriptionExpiryDate,
    )
  ) {
    return new AppError(
      "BACKLINKS_NOT_ENABLED",
      "Backlinks is not enabled for the connected DataForSEO account",
    );
  }

  if (typeof accountState.balance === "number" && accountState.balance <= 0) {
    return new AppError(
      "BACKLINKS_BILLING_ISSUE",
      "The connected DataForSEO account has a billing or balance issue",
    );
  }

  return null;
}
