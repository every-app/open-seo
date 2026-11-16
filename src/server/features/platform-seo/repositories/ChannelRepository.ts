import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { psChannels } from "@/db/schema";
import type { PsChannelType } from "@/shared/platform-seo";

// Channels belong to the organization; every query takes its id.

const summary = {
  id: psChannels.id,
  type: psChannels.type,
  displayName: psChannels.displayName,
  publicationId: psChannels.publicationId,
  accountUrl: psChannels.accountUrl,
  createdAt: psChannels.createdAt,
};

async function listChannels(organizationId: string) {
  return db
    .select(summary)
    .from(psChannels)
    .where(eq(psChannels.organizationId, organizationId))
    .orderBy(asc(psChannels.createdAt));
}

// With the sealed token, for sending. Never returned to the client.
async function getChannelWithToken(organizationId: string, channelId: string) {
  const [row] = await db
    .select()
    .from(psChannels)
    .where(
      and(
        eq(psChannels.id, channelId),
        eq(psChannels.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

// The same account connected again: a Dev.to profile or a Hashnode blog.
async function findSameAccount(params: {
  organizationId: string;
  type: PsChannelType;
  publicationId: string | null;
  accountUrl: string | null;
}) {
  const [row] = await db
    .select({ id: psChannels.id })
    .from(psChannels)
    .where(
      and(
        eq(psChannels.organizationId, params.organizationId),
        eq(psChannels.type, params.type),
        params.type === "hashnode"
          ? eq(psChannels.publicationId, params.publicationId ?? "")
          : eq(psChannels.accountUrl, params.accountUrl ?? ""),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

async function insertChannel(params: {
  organizationId: string;
  type: PsChannelType;
  displayName: string;
  publicationId: string | null;
  accountUrl: string | null;
  tokenCiphertext: string;
}) {
  // Reconnecting replaces the token in place, so copies already sent through
  // the channel keep working with the new one.
  const existing = await findSameAccount(params);
  if (existing) {
    await db
      .update(psChannels)
      .set({
        displayName: params.displayName,
        tokenCiphertext: params.tokenCiphertext,
      })
      .where(eq(psChannels.id, existing));
    return { id: existing, replaced: true };
  }
  const id = crypto.randomUUID();
  await db
    .insert(psChannels)
    .values({ id, ...params, createdAt: new Date().toISOString() });
  return { id, replaced: false };
}

async function deleteChannel(organizationId: string, channelId: string) {
  const rows = await db
    .delete(psChannels)
    .where(
      and(
        eq(psChannels.id, channelId),
        eq(psChannels.organizationId, organizationId),
      ),
    )
    .returning({ id: psChannels.id });
  return rows.length > 0;
}

export const ChannelRepository = {
  listChannels,
  getChannelWithToken,
  insertChannel,
  deleteChannel,
} as const;
