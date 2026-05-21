import type { RedditAttributionInput } from "@/shared/reddit-attribution";
import { redditAttributionSchema } from "@/shared/reddit-attribution";

const STORAGE_KEY = "openseo:reddit-attribution";
const SIGNUP_SENT_KEY = "openseo:reddit-signup-conversion-sent";

function readCookie(name: string) {
  const prefix = `${name}=`;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

function firstSearchValue(searchParams: URLSearchParams, names: string[]) {
  for (const name of names) {
    const value = searchParams.get(name)?.trim();
    if (value) return value;
  }
  return undefined;
}

export function captureRedditAttributionFromLocation() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const current = getStoredRedditAttribution();
  const next = redditAttributionSchema.parse({
    clickId:
      firstSearchValue(url.searchParams, ["rdt_cid", "reddit_click_id"]) ??
      current?.clickId,
    uuid: readCookie("_rdt_uuid") ?? current?.uuid,
    landingPage: current?.landingPage ?? url.toString(),
    referrer: (current?.referrer ?? document.referrer) || undefined,
    utmSource:
      firstSearchValue(url.searchParams, ["utm_source"]) ?? current?.utmSource,
    utmMedium:
      firstSearchValue(url.searchParams, ["utm_medium"]) ?? current?.utmMedium,
    utmCampaign:
      firstSearchValue(url.searchParams, ["utm_campaign"]) ??
      current?.utmCampaign,
    utmTerm:
      firstSearchValue(url.searchParams, ["utm_term"]) ?? current?.utmTerm,
    utmContent:
      firstSearchValue(url.searchParams, ["utm_content"]) ??
      current?.utmContent,
  });

  if (!next.clickId && next.utmSource?.toLowerCase() !== "reddit") return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function getStoredRedditAttribution(): RedditAttributionInput | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    const result = redditAttributionSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function hasMarkedRedditSignupConversion(userId: string) {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SIGNUP_SENT_KEY) === userId;
}

export function markRedditSignupConversion(userId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SIGNUP_SENT_KEY, userId);
}

export function unmarkRedditSignupConversion() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SIGNUP_SENT_KEY);
}
