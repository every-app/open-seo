import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  agentMarketplaceEvidence,
  agentMarketplaceListings,
} from "@/db/schema";
import type {
  AddAgentMarketplaceEvidenceInput,
  AgentMarketplacePlatform,
  UpdateAgentMarketplaceInput,
} from "@/types/schemas/agent-marketplaces";

export type AgentMarketplaceListing =
  typeof agentMarketplaceListings.$inferSelect;
export type AgentMarketplaceEvidence =
  typeof agentMarketplaceEvidence.$inferSelect;

async function listForProject(
  projectId: string,
): Promise<AgentMarketplaceListing[]> {
  return db
    .select()
    .from(agentMarketplaceListings)
    .where(eq(agentMarketplaceListings.projectId, projectId));
}

async function upsert(
  input: UpdateAgentMarketplaceInput,
): Promise<AgentMarketplaceListing> {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(agentMarketplaceListings)
    .values({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      platform: input.platform,
      status: input.status,
      providerStatus: input.providerStatus ?? null,
      packageVersion: input.packageVersion ?? null,
      listingUrl: input.listingUrl ?? null,
      submittedAt: input.submittedAt ?? null,
      publishedAt: input.publishedAt ?? null,
      lastVerifiedAt: input.lastVerifiedAt ?? null,
      notes: input.notes ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        agentMarketplaceListings.projectId,
        agentMarketplaceListings.platform,
      ],
      set: {
        status: input.status,
        providerStatus: input.providerStatus ?? null,
        packageVersion: input.packageVersion ?? null,
        listingUrl: input.listingUrl ?? null,
        submittedAt: input.submittedAt ?? null,
        publishedAt: input.publishedAt ?? null,
        lastVerifiedAt: input.lastVerifiedAt ?? null,
        notes: input.notes ?? null,
        updatedAt: now,
      },
    })
    .returning();

  if (!row) throw new Error("Failed to save agent marketplace listing");
  return row;
}

async function getByPlatform(
  projectId: string,
  platform: AgentMarketplacePlatform,
): Promise<AgentMarketplaceListing | null> {
  const rows = await db
    .select()
    .from(agentMarketplaceListings)
    .where(
      and(
        eq(agentMarketplaceListings.projectId, projectId),
        eq(agentMarketplaceListings.platform, platform),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function addEvidence(
  listingId: string,
  input: AddAgentMarketplaceEvidenceInput,
): Promise<AgentMarketplaceEvidence> {
  const [row] = await db
    .insert(agentMarketplaceEvidence)
    .values({
      id: crypto.randomUUID(),
      listingId,
      capturedAt: input.capturedAt,
      source: input.source,
      views: input.views,
      uniqueViewers: input.uniqueViewers,
      clones: input.clones,
      uniqueCloners: input.uniqueCloners,
      installs: input.installs,
      oauthStarts: input.oauthStarts,
      oauthCompletions: input.oauthCompletions,
      activatedAccounts: input.activatedAccounts,
      qualifiedOutcomes: input.qualifiedOutcomes,
      notes: input.notes ?? null,
    })
    .returning();
  if (!row) throw new Error("Failed to save agent marketplace evidence");
  return row;
}

async function listLatestEvidence(
  listingIds: string[],
): Promise<AgentMarketplaceEvidence[]> {
  if (listingIds.length === 0) return [];

  return db
    .select()
    .from(agentMarketplaceEvidence)
    .where(inArray(agentMarketplaceEvidence.listingId, listingIds))
    .orderBy(desc(agentMarketplaceEvidence.capturedAt));
}

export const AgentMarketplaceRepository = {
  addEvidence,
  getByPlatform,
  listForProject,
  listLatestEvidence,
  upsert,
};
