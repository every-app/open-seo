import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { GoogleMapsViewport } from "@/types/schemas/google-maps";

const sessionSchema = z.object({
  session: z.string().min(1),
  expiry: z.string().regex(/^\d+$/).transform(Number),
  tileWidth: z.number().int().positive(),
  tileHeight: z.number().int().positive(),
});
type MapSession = z.infer<typeof sessionSchema>;
const SESSION_REFRESH_MARGIN_MS = 60_000;

// Session tokens are reusable. Keep them on the server and renew before expiry.
let cachedSession: MapSession | null = null;

async function googleRequest(path: string, init: RequestInit = {}) {
  const apiKey = (await getOptionalEnvValue("GOOGLE_MAPS_API_KEY"))?.trim();
  if (!apiKey)
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "Google Maps is not configured.",
    );
  const url = new URL(path, "https://tile.googleapis.com");
  url.searchParams.set("key", apiKey);
  // Never forward browser credentials or Google's error bodies/URLs to clients.
  return fetch(url, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
}

async function googleJson(path: string, init?: RequestInit) {
  const response = await googleRequest(path, init);
  if (!response.ok) {
    await response.body?.cancel();
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      `Google Maps request failed (${response.status}).`,
    );
  }
  return response.json();
}

async function getSession() {
  if (
    cachedSession &&
    cachedSession.expiry * 1000 > Date.now() + SESSION_REFRESH_MARGIN_MS
  ) {
    return cachedSession;
  }
  const session = sessionSchema.parse(
    await googleJson("/v1/createSession", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mapType: "roadmap",
        language: "en-US",
        region: "US",
      }),
    }),
  );
  cachedSession = session;
  return session;
}

async function getCopyright(viewport: GoogleMapsViewport) {
  const session = await getSession();
  const params = new URLSearchParams({ session: session.session });
  for (const [name, value] of Object.entries(viewport))
    params.set(name, String(value));
  const data = z
    .object({ copyright: z.string().min(1) })
    .parse(await googleJson(`/tile/v1/viewport?${params}`));
  return data.copyright;
}

async function getTile(zoom: number, x: number, y: number) {
  const session = await getSession();
  const params = new URLSearchParams({ session: session.session });
  const response = await googleRequest(
    `/v1/2dtiles/${zoom}/${x}/${y}?${params}`,
  );
  if (!response.ok) {
    await response.body?.cancel();
    return new Response("Google Maps tile unavailable.", {
      status: response.status,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) {
    await response.body?.cancel();
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "Google Maps returned an invalid tile.",
    );
  }
  // Keep Google's browser freshness window without creating a shared CDN cache
  // or storing imagery ourselves.
  const maxAge = /max-age=(\d+)/.exec(
    response.headers.get("Cache-Control") ?? "",
  )?.[1];
  return new Response(response.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": maxAge
        ? `private, max-age=${maxAge}`
        : "private, no-store",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const GoogleMapsService = { getCopyright, getTile };
