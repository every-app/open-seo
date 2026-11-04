import { env, waitUntil } from "cloudflare:workers";
import { parseCookies } from "better-auth/cookies";
import { TIER_PLAN_OFFERS } from "@/client/features/billing/plan-offers";
import { captureServerError } from "@/server/lib/posthog";
import { requestPrivacyChoices } from "@/shared/privacy-choices";

// Meta ad conversions (hosted only): a signup, an organization's setup steps
// (website added, Search Console or an agent connected), a click through to
// checkout, and a subscription to a tier plan (Base, Pro or Agency; YC deal
// subscriptions aren't reported). Sent only when the visitor's advertising
// (Meta) choice allows it, read from the privacy cookie, location and GPC header
// of their own request, and the pixel on openseo.so left its cookies.
// Deliberately no name or email, and nothing about the website or Google account.
//
// The subscription is confirmed by Autumn's webhook, which carries no browser
// cookies. So starting a checkout pins the buyer's Meta ids to the
// organization, under the same check, and the webhook sends the Purchase from
// the pin. The pin expires in a day, so account erasure needn't touch it.

const META_GRAPH_API_URL = "https://graph.facebook.com/v23.0";
const META_CHECKOUT_KV_PREFIX = "meta:checkout:";
const SUBSCRIBE_PATH = "/subscribe";
// Autumn checkout links expire after an hour, and the webhook follows
// payment within seconds.
const CHECKOUT_PIN_TTL_SECONDS = 24 * 60 * 60;
const META_SETUP_KV_PREFIX = "meta:setup:";
// A fixed page, so no project id or OAuth parameter in a request's URL reaches
// Meta.
const SETUP_PATH = "/onboarding";
// Outlasts Meta's 7-day click window. The marker holds no personal data, so
// account erasure needn't touch it.
const SETUP_MARKER_TTL_SECONDS = 30 * 24 * 60 * 60;

enum MetaEvent {
  CompleteRegistration = "CompleteRegistration",
  InitiateCheckout = "InitiateCheckout",
  Purchase = "Purchase",
}

/** Custom events for the setup steps that come before paying. */
export enum MetaSetupEvent {
  AgentConnected = "AgentConnected",
  SearchConsoleConnected = "SearchConsoleConnected",
  WebsiteAdded = "WebsiteAdded",
}

type MetaVisit = {
  eventSourceUrl: string;
  userData: {
    client_ip_address?: string;
    client_user_agent?: string;
    fbp?: string;
    fbc?: string;
  };
};

/** The visitor's page and Meta identifiers, or null when their advertising
 *  choice doesn't allow Meta or the pixel left no cookies. */
function requestVisit(request: Request, path: string): MetaVisit | null {
  if (!requestPrivacyChoices(request).advertising) return null;
  const headers = request.headers;
  const cookies = parseCookies(headers.get("cookie") ?? "");
  const fbp = cookies.get("_fbp");
  const fbc = cookies.get("_fbc");
  if (!fbp && !fbc) return null;
  return {
    eventSourceUrl: new URL(path, request.url).href,
    userData: {
      client_ip_address: headers.get("cf-connecting-ip") ?? undefined,
      client_user_agent: headers.get("user-agent") ?? undefined,
      fbp,
      fbc,
    },
  };
}

function isMetaConfigured() {
  return Boolean(env.META_PIXEL_ID && env.META_CONVERSIONS_API_TOKEN);
}

/** What a tier plan is worth to report, or undefined for any other plan. */
function tierPlanValue(planId: string) {
  const offer = TIER_PLAN_OFFERS.find((tier) => tier.planId === planId);
  return offer && { currency: "USD", value: offer.priceUsd };
}

function sendMetaEvent(
  name: MetaEvent | MetaSetupEvent,
  visit: MetaVisit,
  customData?: { currency: string; value: number },
) {
  const event = {
    event_name: name,
    event_time: Math.floor(Date.now() / 1000),
    action_source: "website",
    event_source_url: visit.eventSourceUrl,
    user_data: visit.userData,
    custom_data: customData,
  };

  waitUntil(
    fetch(`${META_GRAPH_API_URL}/${env.META_PIXEL_ID}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [event],
        access_token: env.META_CONVERSIONS_API_TOKEN,
      }),
      signal: AbortSignal.timeout(10_000),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Meta ${name} tracking failed (${response.status})`);
        }
      })
      .catch(async (error: unknown) => {
        console.error(`Meta ${name} tracking failed`, { error });
        await captureServerError(error, {
          source: "meta_conversion",
          event_name: name,
        });
      }),
  );
}

/** Must never fail the signup. */
export function captureMetaSignup(request: Request | null | undefined) {
  if (!isMetaConfigured() || !request) return;
  const visit = requestVisit(request, "/sign-up");
  if (!visit) return;
  sendMetaEvent(MetaEvent.CompleteRegistration, visit);
}

/** Reports an organization reaching a setup step in a browser, once. Without
 *  advertising permission no marker is written, so a later allowed browser can
 *  still report it. Must never fail the step. */
export async function captureMetaSetupStep(
  event: MetaSetupEvent,
  organizationId: string,
  request: Request | null | undefined,
) {
  if (!isMetaConfigured() || !request) return;
  try {
    const visit = requestVisit(request, SETUP_PATH);
    if (!visit) return;
    const key = `${META_SETUP_KV_PREFIX}${event}:${organizationId}`;
    if (await env.KV.get(key)) return;
    await env.KV.put(key, "1", { expirationTtl: SETUP_MARKER_TTL_SECONDS });
    sendMetaEvent(event, visit);
  } catch (error) {
    console.error("Meta setup step tracking failed", {
      event,
      organizationId,
      error,
    });
  }
}

/** Reports a click through to a tier plan's checkout. */
export function captureMetaCheckoutStart(request: Request, planId: string) {
  const value = tierPlanValue(planId);
  if (!value || !isMetaConfigured()) return;
  const visit = requestVisit(request, SUBSCRIBE_PATH);
  if (!visit) return;
  sendMetaEvent(MetaEvent.InitiateCheckout, visit, value);
}

/** Pins the buyer's Meta ids for the organization's checkout, or clears an
 *  earlier pin when advertising is no longer allowed. Must never fail the
 *  checkout. */
export async function pinMetaCheckout(
  organizationId: string,
  request: Request,
) {
  if (!isMetaConfigured()) return;
  const key = `${META_CHECKOUT_KV_PREFIX}${organizationId}`;
  try {
    const pin = requestVisit(request, SUBSCRIBE_PATH);
    if (!pin) {
      await env.KV.delete(key);
      return;
    }
    await env.KV.put(key, JSON.stringify(pin), {
      expirationTtl: CHECKOUT_PIN_TTL_SECONDS,
    });
  } catch (error) {
    console.error("Meta checkout pin failed", { organizationId, error });
  }
}

/** Reports a new tier plan subscription for an organization whose checkout
 *  was pinned. Must never fail the webhook. */
export async function captureMetaPurchase(
  organizationId: string,
  planId: string,
) {
  const value = tierPlanValue(planId);
  if (!value || !isMetaConfigured()) return;
  try {
    const pin = await env.KV.get<MetaVisit>(
      `${META_CHECKOUT_KV_PREFIX}${organizationId}`,
      "json",
    );
    if (!pin) return;
    sendMetaEvent(MetaEvent.Purchase, pin, value);
  } catch (error) {
    console.error("Meta purchase tracking failed", { organizationId, error });
    await captureServerError(error, {
      source: "meta_conversion",
      customer_id: organizationId,
    });
  }
}
