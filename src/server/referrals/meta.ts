import { env, waitUntil } from "cloudflare:workers";
import { parseCookies } from "better-auth/cookies";
import { BASE_PLAN_OFFER } from "@/client/features/billing/plan-offers";
import { captureServerError } from "@/server/lib/posthog";
import { requestPrivacyChoices } from "@/shared/privacy-choices";

// Meta ad conversions (hosted only): a signup, and a subscription to the base
// plan. Sent only when the visitor's advertising (Meta) choice allows it, read
// from the privacy cookie, location and GPC header of their own request, and
// the pixel on openseo.so left its cookies. Deliberately no name or email.
//
// The subscription is confirmed by Autumn's webhook, which carries no browser
// cookies. So starting a checkout pins the buyer's Meta ids to the
// organization, under the same check, and the webhook sends the Purchase from
// the pin. The pin expires in a day, so account erasure needn't touch it.

const META_GRAPH_API_URL = "https://graph.facebook.com/v23.0";
const META_CHECKOUT_KV_PREFIX = "meta:checkout:";
// Autumn checkout links expire after an hour, and the webhook follows
// payment within seconds.
const CHECKOUT_PIN_TTL_SECONDS = 24 * 60 * 60;

type MetaVisit = {
  eventSourceUrl: string;
  userData: {
    client_ip_address?: string;
    client_user_agent?: string;
    fbp?: string;
    fbc?: string;
  };
};

/** The visitor's Meta identifiers, or null when their advertising choice
 *  doesn't allow Meta or the pixel left no cookies. */
function requestUserData(request: Request): MetaVisit["userData"] | null {
  if (!requestPrivacyChoices(request).advertising) return null;
  const headers = request.headers;
  const cookies = parseCookies(headers.get("cookie") ?? "");
  const fbp = cookies.get("_fbp");
  const fbc = cookies.get("_fbc");
  if (!fbp && !fbc) return null;
  return {
    client_ip_address: headers.get("cf-connecting-ip") ?? undefined,
    client_user_agent: headers.get("user-agent") ?? undefined,
    fbp,
    fbc,
  };
}

function isMetaConfigured() {
  return Boolean(env.META_PIXEL_ID && env.META_CONVERSIONS_API_TOKEN);
}

function sendMetaEvent(
  name: "CompleteRegistration" | "Purchase",
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
  const userData = requestUserData(request);
  if (!userData) return;
  sendMetaEvent("CompleteRegistration", {
    eventSourceUrl: new URL("/sign-up", request.url).href,
    userData,
  });
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
    const userData = requestUserData(request);
    if (!userData) {
      await env.KV.delete(key);
      return;
    }
    const pin: MetaVisit = {
      eventSourceUrl: new URL("/subscribe", request.url).href,
      userData,
    };
    await env.KV.put(key, JSON.stringify(pin), {
      expirationTtl: CHECKOUT_PIN_TTL_SECONDS,
    });
  } catch (error) {
    console.error("Meta checkout pin failed", { organizationId, error });
  }
}

/** Reports a new base plan subscription for an organization whose checkout
 *  was pinned. Must never fail the webhook. */
export async function captureMetaPurchase(organizationId: string) {
  if (!isMetaConfigured()) return;
  try {
    const pin = await env.KV.get<MetaVisit>(
      `${META_CHECKOUT_KV_PREFIX}${organizationId}`,
      "json",
    );
    if (!pin) return;
    sendMetaEvent("Purchase", pin, {
      currency: "USD",
      value: BASE_PLAN_OFFER.priceUsd,
    });
  } catch (error) {
    console.error("Meta purchase tracking failed", { organizationId, error });
    await captureServerError(error, {
      source: "meta_conversion",
      customer_id: organizationId,
    });
  }
}
