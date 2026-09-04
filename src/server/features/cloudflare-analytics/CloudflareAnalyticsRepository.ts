import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cloudflareAnalyticsConnections } from "@/db/schema";
import type { CloudflareCapabilities } from "./schemas";

export type CloudflareAnalyticsConnection =
  typeof cloudflareAnalyticsConnections.$inferSelect;

async function getByProjectId(
  projectId: string,
): Promise<CloudflareAnalyticsConnection | null> {
  const rows = await db
    .select()
    .from(cloudflareAnalyticsConnections)
    .where(eq(cloudflareAnalyticsConnections.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function replace(input: {
  projectId: string;
  organizationId: string;
  encryptedApiToken: string;
  tokenHint: string;
  zoneId: string;
  zoneLabel: string | null;
  capabilities: CloudflareCapabilities;
  connectedByUserId: string;
  now: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .insert(cloudflareAnalyticsConnections)
    .values({
      id,
      projectId: input.projectId,
      organizationId: input.organizationId,
      encryptedApiToken: input.encryptedApiToken,
      tokenHint: input.tokenHint,
      zoneId: input.zoneId,
      zoneLabel: input.zoneLabel,
      trafficAvailable: input.capabilities.traffic.available,
      trafficReason: input.capabilities.traffic.reason,
      securityEventsAvailable: input.capabilities.securityEvents.available,
      securityEventsReason: input.capabilities.securityEvents.reason,
      crawlerAccessAvailable: input.capabilities.crawlerAccess.available,
      crawlerAccessReason: input.capabilities.crawlerAccess.reason,
      connectedByUserId: input.connectedByUserId,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: cloudflareAnalyticsConnections.projectId,
      set: {
        id,
        organizationId: input.organizationId,
        encryptedApiToken: input.encryptedApiToken,
        tokenHint: input.tokenHint,
        zoneId: input.zoneId,
        zoneLabel: input.zoneLabel,
        trafficAvailable: input.capabilities.traffic.available,
        trafficReason: input.capabilities.traffic.reason,
        securityEventsAvailable: input.capabilities.securityEvents.available,
        securityEventsReason: input.capabilities.securityEvents.reason,
        crawlerAccessAvailable: input.capabilities.crawlerAccess.available,
        crawlerAccessReason: input.capabilities.crawlerAccess.reason,
        connectedByUserId: input.connectedByUserId,
        createdAt: input.now,
        updatedAt: input.now,
      },
    });
  return id;
}

async function disconnect(projectId: string): Promise<void> {
  await db
    .delete(cloudflareAnalyticsConnections)
    .where(eq(cloudflareAnalyticsConnections.projectId, projectId));
}

function capabilitiesFromConnection(
  connection: CloudflareAnalyticsConnection,
): CloudflareCapabilities {
  return {
    traffic: {
      available: connection.trafficAvailable,
      reason: connection.trafficReason,
    },
    securityEvents: {
      available: connection.securityEventsAvailable,
      reason: connection.securityEventsReason,
    },
    crawlerAccess: {
      available: connection.crawlerAccessAvailable,
      reason: connection.crawlerAccessReason,
    },
  };
}

export const CloudflareAnalyticsRepository = {
  getByProjectId,
  replace,
  disconnect,
  capabilitiesFromConnection,
};
