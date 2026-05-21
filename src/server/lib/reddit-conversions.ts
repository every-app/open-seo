import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { redditAttributions } from "@/db/schema";
import {
  hasRedditAttribution,
  type RedditAttributionInput,
} from "@/shared/reddit-attribution";

type RedditConversionType = "SignUp" | "Purchase";

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
  const accountId = getEnv("REDDIT_AD_ACCOUNT_ID") || getEnv("REDDIT_PIXEL_ID");
  const accessToken = getEnv("REDDIT_CONVERSIONS_ACCESS_TOKEN");

  if (!accountId || !accessToken) return null;

  return { accountId, accessToken };
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
}

async function hasSentConversion(args: CaptureRedditConversionArgs) {
  const existing = await db.query.redditAttributions.findFirst({
    where: eq(redditAttributions.userId, args.userId),
  });
  return args.eventType === "SignUp"
    ? Boolean(existing?.signupSentAt)
    : Boolean(existing?.purchaseSentAt);
}

async function markConversionSent(args: CaptureRedditConversionArgs) {
  const now = new Date().toISOString();
  const sentColumn =
    args.eventType === "SignUp" ? "signupSentAt" : "purchaseSentAt";

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

  await upsertAttribution(args);
  if (await hasSentConversion(args)) return "already_sent" as const;

  const config = getRedditConfig();
  if (!config) return "stored" as const;

  const eventMetadata: Record<string, unknown> = {
    conversion_id: args.conversionId,
    transaction_id: args.conversionId,
  };
  if (args.valueDecimal !== undefined) {
    eventMetadata.value_decimal = args.valueDecimal;
    eventMetadata.currency = args.currency ?? "USD";
    eventMetadata.item_count = 1;
  }

  const payload = {
    events: [
      {
        click_id: args.attribution.clickId,
        event_at: new Date().toISOString(),
        event_type: {
          tracking_type: args.eventType,
        },
        event_metadata: eventMetadata,
        user: {
          email: await sha256(args.email),
          external_id: await sha256(args.userId),
          uuid: args.attribution.uuid,
        },
      },
    ],
  };

  const response = await fetch(
    `https://ads-api.reddit.com/api/v2.0/conversions/events/${config.accountId}`,
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
