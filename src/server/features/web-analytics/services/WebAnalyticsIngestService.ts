// Public ingestion pipeline for tracker events: validate, drop bots, resolve
// the site, then write the session/event rows.
//
// Ported from Minilytics (MIT, Copyright (c) 2026 surendrapandar)
// https://github.com/surendrapandar/minilytics/blob/main/src/worker/collect.ts
// (payments attribution and visitor identity intentionally not ported).

import { z } from "zod";
import type {
  IngestOp,
  WebAnalyticsSiteWithDomain,
} from "../repositories/WebAnalyticsRepository";
import { WebAnalyticsRepository } from "../repositories/WebAnalyticsRepository";
import { classify } from "../lib/sources";
import { isBot, parseUA } from "../lib/ua";

const MAX_BODY_BYTES = 8192;
const MAX_PING_MS = 10 * 60_000;
const ID_PATTERN = /^[\w-]{8,64}$/;

// The tracker's wire format: compact keys, text/plain JSON, one POST.
const payloadSchema = z.object({
  w: z.string().regex(ID_PATTERN),
  t: z.enum(["pageview", "goal", "outbound", "ping"]),
  u: z.string().min(1),
  r: z.string().optional(),
  vid: z.string().regex(ID_PATTERN),
  sid: z.string().regex(ID_PATTERN),
  sw: z.number().optional(),
  n: z.string().optional(),
  p: z.record(z.string(), z.unknown()).optional(),
  d: z.number().optional(),
});

type TrackerPayload = z.infer<typeof payloadSchema>;

interface Geo {
  country: string | null;
  region: string | null;
  city: string | null;
}

type IngestOutcome =
  | "accepted"
  | "payload_too_large"
  | "invalid_payload"
  | "bot"
  | "unknown_site"
  | "foreign_domain";

const clip = (s: unknown, n = 255): string | null =>
  typeof s === "string" && s.trim() ? s.trim().slice(0, n) : null;

export function normalizePath(pathname: string): string {
  let p = pathname || "/";
  try {
    p = decodeURI(p);
  } catch {
    // Undecodable percent sequences stay as-is.
  }
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p.slice(0, 500);
}

function stripWww(h: string): string {
  return h.replace(/^www\./, "").toLowerCase();
}

/** Is `hostname` the site's domain or one of its subdomains? */
export function belongsTo(hostname: string, domain: string): boolean {
  const h = stripWww(hostname);
  const d = stripWww(domain);
  return h === d || h.endsWith("." + d);
}

// Site rows are cached per isolate: every tracked pageview otherwise costs a
// read before the writes. Short TTL so a disabled site stops ingesting
// quickly (disable also clears the cache explicitly).
const SITE_CACHE_TTL_MS = 60_000;
const siteCache = new Map<
  string,
  { site: WebAnalyticsSiteWithDomain; expiresAt: number }
>();

export function clearSiteCache(): void {
  siteCache.clear();
}

async function getSite(id: string): Promise<WebAnalyticsSiteWithDomain | null> {
  const cached = siteCache.get(id);
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.site;
  const site = await WebAnalyticsRepository.getById(id);
  if (site) siteCache.set(id, { site, expiresAt: now + SITE_CACHE_TTL_MS });
  else siteCache.delete(id);
  return site;
}

export async function ingestEvent(input: {
  rawBody: string;
  userAgent: string;
  geo: Geo;
  now?: Date;
}): Promise<IngestOutcome> {
  if (input.rawBody.length > MAX_BODY_BYTES) return "payload_too_large";

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.rawBody);
  } catch {
    return "invalid_payload";
  }
  const body = payloadSchema.safeParse(parsed);
  if (!body.success) return "invalid_payload";
  const payload = body.data;

  // Bots get a 202-style silent drop: success to the tracker, no rows stored.
  if (isBot(input.userAgent)) return "bot";

  const site = await getSite(payload.w);
  if (!site) return "unknown_site";

  let url: URL;
  try {
    url = new URL(payload.u);
  } catch {
    return "invalid_payload";
  }
  // Only accept data for the site's own domain, so nobody can pollute stats
  // from elsewhere.
  if (!site.domain || !belongsTo(url.hostname, site.domain)) {
    return "foreign_domain";
  }

  await ingest({
    site,
    payload,
    url,
    userAgent: input.userAgent,
    geo: input.geo,
    now: input.now ?? new Date(),
  });
  return "accepted";
}

interface IngestContext {
  site: WebAnalyticsSiteWithDomain;
  payload: TrackerPayload;
  url: URL;
  userAgent: string;
  geo: Geo;
  now: Date;
}

async function ingest(ctx: IngestContext): Promise<void> {
  const { site, payload } = ctx;
  const path = normalizePath(ctx.url.pathname);
  const { t, vid, sid } = payload;
  const nowIso = ctx.now.toISOString();
  const ops: IngestOp[] = [];

  if (t === "ping") {
    const ms = Math.max(
      0,
      Math.min(MAX_PING_MS, Math.round(Number(payload.d) || 0)),
    );
    ops.push({
      kind: "addPing",
      siteId: site.id,
      sessionId: sid,
      durationMs: ms,
      now: nowIso,
    });
    await WebAnalyticsRepository.applyIngestOps(ops);
    return;
  }

  const existing = await WebAnalyticsRepository.sessionExists(site.id, sid);
  if (!existing) ops.push(...newSessionOps(ctx, path));

  if (t === "pageview") {
    // The new-session insert carries pageviews = 0; both paths increment
    // separately so racing first events never double count.
    ops.push({
      kind: "markPageview",
      siteId: site.id,
      sessionId: sid,
      path,
      now: nowIso,
    });
    ops.push(
      insertEventOp({
        siteId: site.id,
        sessionId: sid,
        visitorId: vid,
        ts: nowIso,
        type: "pageview",
        name: null,
        path,
        props: null,
      }),
    );
  } else if (t === "goal") {
    const name = clip(payload.n, 64);
    if (!name) return;
    const props =
      payload.p && typeof payload.p === "object"
        ? JSON.stringify(payload.p).slice(0, 1000)
        : null;
    ops.push({
      kind: "markGoal",
      siteId: site.id,
      sessionId: sid,
      now: nowIso,
    });
    ops.push(
      insertEventOp({
        siteId: site.id,
        sessionId: sid,
        visitorId: vid,
        ts: nowIso,
        type: "goal",
        name,
        path,
        props,
      }),
    );
  } else if (t === "outbound") {
    const target = clip(payload.n, 500);
    if (!target) return;
    ops.push({
      kind: "touchSession",
      siteId: site.id,
      sessionId: sid,
      now: nowIso,
    });
    ops.push(
      insertEventOp({
        siteId: site.id,
        sessionId: sid,
        visitorId: vid,
        ts: nowIso,
        type: "outbound",
        name: target,
        path,
        props: null,
      }),
    );
  }
  await WebAnalyticsRepository.applyIngestOps(ops);
}

function insertEventOp(event: {
  siteId: string;
  sessionId: string;
  visitorId: string;
  ts: string;
  type: "pageview" | "goal" | "outbound";
  name: string | null;
  path: string;
  props: string | null;
}): IngestOp {
  return {
    kind: "insertEvent",
    event: { id: crypto.randomUUID(), ...event },
  };
}

function newSessionOps(ctx: IngestContext, path: string): IngestOp[] {
  const { site, payload, url, userAgent, geo } = ctx;
  let referrer: string | null = null;
  let referrerDomain: string | null = null;
  if (payload.r) {
    try {
      const r = new URL(payload.r);
      // Navigation between the site's own pages/subdomains is not a referral.
      if (
        /^https?:$/.test(r.protocol) &&
        !belongsTo(r.hostname, site.domain ?? "")
      ) {
        referrerDomain = stripWww(r.hostname);
        referrer = (r.hostname + normalizePath(r.pathname)).slice(0, 500);
      }
    } catch {
      // android-app://com.google.android.gm (Gmail in-app link) and friends.
      const m = /^android-app:\/\/([\w.]+)/.exec(payload.r);
      if (m) referrerDomain = m[1];
    }
  }
  const q = url.searchParams;
  const utm = {
    source: clip(q.get("utm_source"), 100),
    medium: clip(q.get("utm_medium"), 100),
    campaign: clip(q.get("utm_campaign"), 200),
    term: clip(q.get("utm_term"), 200),
    content: clip(q.get("utm_content"), 200),
  };
  const ref = clip(q.get("ref") ?? q.get("via"), 100);
  const { source, channel } = classify({
    referrerDomain,
    utmSource: utm.source,
    utmMedium: utm.medium,
    ref,
  });
  const { browser, os, device } = parseUA(
    userAgent,
    Number(payload.sw) || undefined,
  );

  return [
    {
      kind: "insertSession",
      session: {
        siteId: site.id,
        id: payload.sid,
        visitorId: payload.vid,
        startedAt: ctx.now.toISOString(),
        lastSeenAt: ctx.now.toISOString(),
        durationMs: 0,
        pageviews: 0,
        goals: 0,
        hostname: stripWww(url.hostname),
        entryPage: path,
        exitPage: path,
        referrer,
        referrerDomain,
        source,
        channel,
        utmSource: utm.source,
        utmMedium: utm.medium,
        utmCampaign: utm.campaign,
        utmTerm: utm.term,
        utmContent: utm.content,
        ref,
        country: geo.country,
        region: geo.region,
        city: geo.city,
        browser,
        os,
        device,
      },
    },
  ];
}
