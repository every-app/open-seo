import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { redditAttributions } from "@/db/schema";
import {
  hasRedditAttribution,
  type RedditAttributionInput,
} from "@/shared/reddit-attribution";

type RedditConversionType = "SIGN_UP" | "PURCHASE";

type CaptureRedditConversionArgs = {
  attribution: RedditAttributionInput;
  conversionId: string;
  email: string;
  eventType: RedditConversionType;
  organizationId: string;
  userId: string;
  valueDecimal?: number;
  currency?: string;
};

function getEnv(name: string) {
  const value: unknown = Reflect.get(env, name);
  return typeof value === "string" ? value.trim() : "";
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getRedditConfig() {
  const pixelId = getEnv("REDDIT_PIXEL_ID");
  const accessToken = getEnv("REDDIT_CONVERSIONS_ACCESS_TOKEN");

  if (!pixelId || !accessToken) return null;

  return { accessToken, pixelId };
}

async function upsertAttribution(args: CaptureRedditConversionArgs) {
  const existing = await db.query.redditAttributions.findFirst({
    where: eq(redditAttributions.userId, args.userId),
  });
  const now = new Date().toISOString();

  if (existing) {
    await db
      .update(redditAttributions)
      .set({
        clickId: existing.clickId ?? args.attribution.clickId,
        uuid: existing.uuid ?? args.attribution.uuid,
        landingPage: existing.landingPage ?? args.attribution.landingPage,
        referrer: existing.referrer ?? args.attribution.referrer,
        utmSource: existing.utmSource ?? args.attribution.utmSource,
        utmMedium: existing.utmMedium ?? args.attribution.utmMedium,
        utmCampaign: existing.utmCampaign ?? args.attribution.utmCampaign,
        utmTerm: existing.utmTerm ?? args.attribution.utmTerm,
        utmContent: existing.utmContent ?? args.attribution.utmContent,
        updatedAt: now,
      })
      .where(eq(redditAttributions.userId, args.userId));
  } else {
    await db.insert(redditAttributions).values({
      id: crypto.randomUUID(),
      userId: args.userId,
      organizationId: args.organizationId,
      clickId: args.attribution.clickId,
      uuid: args.attribution.uuid,
      landingPage: args.attribution.landingPage,
      referrer: args.attribution.referrer,
      utmSource: args.attribution.utmSource,
      utmMedium: args.attribution.utmMedium,
      utmCampaign: args.attribution.utmCampaign,
      utmTerm: args.attribution.utmTerm,
      utmContent: args.attribution.utmContent,
      createdAt: now,
      updatedAt: now,
    });
  }

  return args.eventType === "SIGN_UP"
    ? Boolean(existing?.signupSentAt)
    : Boolean(existing?.purchaseSentAt);
}

async function markConversionSent(args: CaptureRedditConversionArgs) {
  const now = new Date().toISOString();
  const sentColumn =
    args.eventType === "SIGN_UP" ? "signupSentAt" : "purchaseSentAt";

  await db
    .update(redditAttributions)
    .set({
      [sentColumn]: now,
      updatedAt: now,
    })
    .where(eq(redditAttributions.userId, args.userId));
}

export async function captureRedditConversion(
  args: CaptureRedditConversionArgs,
) {
  if (!hasRedditAttribution(args.attribution)) return "skipped" as const;

  const alreadySent = await upsertAttribution(args);
  if (alreadySent) return "already_sent" as const;

  const config = getRedditConfig();
  if (!config) return "stored" as const;

  const metadata: Record<string, unknown> = {
    conversion_id: args.conversionId,
  };
  if (args.valueDecimal !== undefined) {
    metadata.currency = args.currency ?? "USD";
    metadata.item_count = 1;
    metadata.value = args.valueDecimal;
  }

  const payload = {
    data: {
      events: [
        {
          action_source: "WEBSITE",
          click_id: args.attribution.clickId,
          event_at: Date.now(),
          metadata,
          type: {
            tracking_type: args.eventType,
          },
          user: {
            email: await sha256(args.email),
            external_id: await sha256(args.userId),
            uuid: args.attribution.uuid,
          },
        },
      ],
    },
  };

  const response = await fetch(
    `https://ads-api.reddit.com/api/v3/pixels/${config.pixelId}/conversion_events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    console.error("reddit conversion capture failed", {
      status: response.status,
      eventType: args.eventType,
      userId: args.userId,
    });
    return "failed" as const;
  }

  await markConversionSent(args);
  return "sent" as const;
}
