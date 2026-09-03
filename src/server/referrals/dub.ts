import { env, waitUntil } from "cloudflare:workers";
import { parseCookies } from "better-auth/cookies";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { autumn } from "@/server/billing/autumn";
import { captureServerError } from "@/server/lib/posthog";
import { buildDubSaleRequest } from "./dub-sale";

// Dub referral attribution (hosted only). Flow:
//  1. links.openseo.so/<partner> redirects to openseo.so/?dub_id=<clickId>;
//     the marketing site persists it as a `dub_id` cookie on `.openseo.so`.
//  2. On signup we send a Dub lead and pin `referred-user:<userId>` in KV.
//     The lead creates a pseudonymous Dub customer record (random name +
//     our user id) — GDPR erasure deletes the KV pins here and the Dub-side
//     record via the erasure runbook.
//  3. The pin is copied to `referred-org:<orgId>` (= the Autumn customer id)
//     on every session, so billing events need no member lookup.
//  4. Paid Autumn invoices for referred orgs are sent as Dub sales — from the
//     billing webhook for promptness, and from a daily cron sweep because
//     Autumn's `billing.updated` isn't documented to fire for renewals or
//     one-time top-up purchases.
// Every entry point no-ops without DUB_API_KEY, so self-host and previews
// are inert.

const DUB_API_URL = "https://api.dub.co";
const DUB_COOKIE_NAME = "dub_id";
export const DUB_REFERRED_USER_KV_PREFIX = "dub:referred-user:";
export const DUB_REFERRED_ORG_KV_PREFIX = "dub:referred-org:";
const TRACKED_SALE_KV_PREFIX = "dub:sale:";
// User pin: matches Dub's 90-day attribution cookie. Org pin: refreshed on
// every session while the user pin lives, then ages out so the daily sweep
// doesn't grow forever.
const USER_PIN_TTL_SECONDS = 90 * 24 * 60 * 60;
const ORG_PIN_TTL_SECONDS = 400 * 24 * 60 * 60;
// Dub can answer "customer: null" for a referred org whose lead hasn't
// materialized yet; a short suppression window lets the next webhook or the
// daily cron retry. Dub's invoiceId idempotency makes re-sends safe.
const NOT_REFERRED_RETRY_TTL_SECONDS = 60 * 60;
// Only sweep recent invoices: everything older has either been tracked (and
// permanently marked) or has failed long enough that retrying is pointless.
// Keeps per-org KV reads and Dub calls bounded.
const SALE_SWEEP_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;

function getDubApiKey() {
  const value: unknown = Reflect.get(env, "DUB_API_KEY");
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

async function postDub(apiKey: string, path: string, body: unknown) {
  return fetch(`${DUB_API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

/** Records a Dub lead and pins the referral in KV when the signup request
 *  carries a `dub_id` cookie. Must never fail the signup. */
export async function captureDubReferralSignup(
  userId: string,
  request: Request | null | undefined,
) {
  const apiKey = getDubApiKey();
  const cookieHeader = request?.headers.get("cookie");
  if (!apiKey || !cookieHeader) return;

  try {
    const clickId = parseCookies(cookieHeader).get(DUB_COOKIE_NAME)?.trim();
    if (!clickId) return;

    await env.KV.put(`${DUB_REFERRED_USER_KV_PREFIX}${userId}`, clickId, {
      expirationTtl: USER_PIN_TTL_SECONDS,
    });

    waitUntil(
      (async () => {
        // One retry: leads dedupe Dub-side on customerExternalId+eventName,
        // and a lost lead leaves the org's sales unattributable. mode "wait"
        // materializes the customer before a near-immediate checkout's sale.
        let lastError: unknown;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const response = await postDub(apiKey, "/track/lead", {
              clickId,
              eventName: "Sign up",
              mode: "wait",
              // Deliberately no name/email: keeps the Dub record pseudonymous.
              customerExternalId: userId,
            });
            if (response.ok) return;
            lastError = new Error(
              `Dub lead tracking failed (${response.status})`,
            );
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError;
      })().catch(async (error: unknown) => {
        console.error("Dub lead tracking failed", { userId, error });
        await captureServerError(error, {
          source: "dub_lead",
          user_id: userId,
        });
      }),
    );
  } catch (error) {
    console.error("Dub referral capture failed", { userId, error });
  }
}

/** Copies a user's referral pin onto the organization they FOUNDED, keyed by
 *  org id (= Autumn customer id) so billing events resolve it directly.
 *  Founded, not merely owned or joined: commission is only for net-new users
 *  creating their own workspace — an invitee (even one later promoted to
 *  owner) must never attribute an existing org's revenue to their referrer.
 *  Called on every session (only touches the DB when a user pin exists);
 *  must never fail session creation. */
export async function markDubReferredOrganization(userId: string) {
  if (!getDubApiKey()) return;

  try {
    const clickId = await env.KV.get(`${DUB_REFERRED_USER_KV_PREFIX}${userId}`);
    if (!clickId) return;

    const organizationId =
      await AuthRepository.findFirstFoundedOrganizationIdForUser(userId);
    if (!organizationId) return;

    await env.KV.put(`${DUB_REFERRED_ORG_KV_PREFIX}${organizationId}`, userId, {
      expirationTtl: ORG_PIN_TTL_SECONDS,
    });
  } catch (error) {
    console.error("Dub referred-org marking failed", { userId, error });
  }
}

async function trackDubSale(
  apiKey: string,
  userId: string,
  sale: NonNullable<ReturnType<typeof buildDubSaleRequest>>,
): Promise<"tracked" | "not_referred" | "failed"> {
  const response = await postDub(apiKey, "/track/sale", {
    ...sale,
    customerExternalId: userId,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Dub sale tracking failed", {
      status: response.status,
      invoiceId: sale.invoiceId,
      detail,
    });
    return "failed";
  }

  // An unknown customer (the lead never landed, or hasn't materialized yet)
  // returns 200 with `customer: null` and records nothing.
  const payload = await response.json<{ customer: unknown }>();
  return payload.customer ? "tracked" : "not_referred";
}

function isAutumnNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    (error as { statusCode: unknown }).statusCode === 404
  );
}

async function sweepDubSalesForOrganization(
  organizationId: string,
  userId: string,
) {
  const apiKey = getDubApiKey();
  if (!apiKey) return;

  let customer;
  try {
    customer = await autumn.customers.get({
      customerId: organizationId,
      expand: ["invoices"],
    });
  } catch (error) {
    // Autumn customers are created lazily on first billing interaction, so a
    // referred org that never used a paid feature (or was GDPR-erased)
    // doesn't exist there. Not an error.
    if (isAutumnNotFound(error)) return;
    throw error;
  }

  const oldestSweepable = Date.now() - SALE_SWEEP_WINDOW_MS;
  for (const invoice of customer.invoices ?? []) {
    if (invoice.createdAt < oldestSweepable) continue;

    const sale = buildDubSaleRequest(invoice, organizationId);
    if (!sale) continue;

    // One bad invoice must not abort the org's remaining invoices.
    try {
      const trackedKey = `${TRACKED_SALE_KV_PREFIX}${sale.invoiceId}`;
      if (await env.KV.get(trackedKey)) continue;

      const result = await trackDubSale(apiKey, userId, sale);
      // "failed" is left unmarked so the next webhook or cron sweep retries.
      if (result === "tracked") {
        await env.KV.put(trackedKey, "1");
      } else if (result === "not_referred") {
        await env.KV.put(trackedKey, "1", {
          expirationTtl: NOT_REFERRED_RETRY_TTL_SECONDS,
        });
      }
    } catch (error) {
      console.error("Dub sale tracking errored", {
        organizationId,
        invoiceId: sale.invoiceId,
        error,
      });
    }
  }
}

/** Billing-webhook entry point: fire-and-forget sale sweep for referred orgs.
 *  Must never fail the webhook response. */
export async function trackDubSalesForOrganization(organizationId: string) {
  try {
    if (!getDubApiKey()) return;

    const userId = await env.KV.get(
      `${DUB_REFERRED_ORG_KV_PREFIX}${organizationId}`,
    );
    if (!userId) return;

    waitUntil(
      sweepDubSalesForOrganization(organizationId, userId).catch(
        async (error: unknown) => {
          console.error("Dub sale sweep failed", { organizationId, error });
          await captureServerError(error, {
            source: "dub_sale_sweep",
            organization_id: organizationId,
          });
        },
      ),
    );
  } catch (error) {
    console.error("Dub sale tracking skipped", { organizationId, error });
  }
}

/** Daily cron: sweep every referred org. Catches revenue the webhook path
 *  misses (renewals, one-time top-ups, invoices that were still open). */
export async function sweepDubReferredOrganizations() {
  if (!getDubApiKey()) return;

  let cursor: string | undefined;
  do {
    const page = await env.KV.list({
      prefix: DUB_REFERRED_ORG_KV_PREFIX,
      cursor,
    });

    for (const key of page.keys) {
      const organizationId = key.name.slice(DUB_REFERRED_ORG_KV_PREFIX.length);
      try {
        const userId = await env.KV.get(key.name);
        if (userId) {
          await sweepDubSalesForOrganization(organizationId, userId);
        }
      } catch (error) {
        console.error("Dub cron sweep failed for org", {
          organizationId,
          error,
        });
        await captureServerError(error, {
          source: "dub_cron_sweep",
          organization_id: organizationId,
        });
      }
    }

    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}
