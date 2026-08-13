import { env } from "cloudflare:workers";
import { and, eq, inArray, isNull, like } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import { getAuthMode } from "@/lib/auth-mode";
import { AppError } from "@/server/lib/errors";
import {
  ga4Connections,
  gscConnections,
  organization,
  organizationActivationState,
  projects,
  userOnboardingAnswers,
} from "@/db/schema";
import { SHARED_WORKSPACE_ORGANIZATION_ID } from "./delegated-organization";

// Earliest-wins pick across nullable UTC timestamp strings (string compare is
// chronological for these).
function earliest(values: (string | null)[]) {
  return (
    values.filter((value): value is string => value !== null).toSorted()[0] ??
    null
  );
}

// Before the shared workspace, every Cloudflare Access user got their own
// `delegated-${userId}` organization (and local_noauth got delegated-local-admin,
// which an operator switching modes wants folded in too). The shared workspace
// id has no such prefix, so this matches exactly the legacy set.
const legacyWorkspaceFilter = like(organization.id, "delegated-%");

async function countLegacyWorkspaces() {
  const rows = await db
    .select({ id: organization.id })
    .from(organization)
    .where(legacyWorkspaceFilter);

  return rows.length;
}

// Folds every legacy per-user workspace into the shared workspace: projects
// (which carry all their keywords, rank tracking, audits, and agent data with
// them) plus the org-scoped rows, then deletes the emptied legacy orgs. Safe
// to re-run and safe under concurrent clicks — every statement is a no-op once
// the legacy orgs are gone.
async function mergeLegacyWorkspaces() {
  // Hard gate, independent of any caller-side check: outside cloudflare_access
  // mode the "delegated-%" orgs are either live (local_noauth resolves to
  // delegated-local-admin — merging would strand its data in a workspace that
  // mode never shows) or should not exist at all (hosted).
  if (getAuthMode(env.AUTH_MODE) !== "cloudflare_access") {
    throw new AppError(
      "FORBIDDEN",
      "Workspace merge is only available in cloudflare_access auth mode.",
    );
  }

  const legacyOrgs = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(legacyWorkspaceFilter);

  if (legacyOrgs.length === 0) {
    return { mergedWorkspaces: 0 };
  }

  const legacyIds = legacyOrgs.map((org) => org.id);
  // Legacy org names are "<email localpart> workspace" — reuse the localpart
  // to label renamed projects with their previous owner.
  const ownerLabelByOrgId = new Map(
    legacyOrgs.map((org) => [org.id, org.name.replace(/ workspace$/, "")]),
  );

  // Each legacy workspace auto-created a ("Default", no-domain) project, and
  // the shared workspace allows only one active such project. Rename them
  // before repointing so the partial unique index can't reject the move —
  // renaming (never deleting) means a Default that holds work survives intact.
  const conflictingDefaults = await db
    .select({ id: projects.id, organizationId: projects.organizationId })
    .from(projects)
    .where(
      and(
        inArray(projects.organizationId, legacyIds),
        eq(projects.name, "Default"),
        isNull(projects.domain),
        isNull(projects.archivedAt),
      ),
    );

  // Earliest-wins merge of activation milestones across the shared row and
  // all legacy rows.
  const activationRows = await db
    .select()
    .from(organizationActivationState)
    .where(
      inArray(organizationActivationState.organizationId, [
        SHARED_WORKSPACE_ORGANIZATION_ID,
        ...legacyIds,
      ]),
    );
  const mergedActivation = {
    firstMcpAuthorizedAt: earliest(
      activationRows.map((row) => row.firstMcpAuthorizedAt),
    ),
    firstMcpToolCallAt: earliest(
      activationRows.map((row) => row.firstMcpToolCallAt),
    ),
  };

  const repointToShared = { organizationId: SHARED_WORKSPACE_ORGANIZATION_ID };

  await runBatch((tx) => [
    ...conflictingDefaults.map((project) =>
      tx
        .update(projects)
        .set({
          name: `Default (${ownerLabelByOrgId.get(project.organizationId) ?? "imported"})`,
        })
        .where(eq(projects.id, project.id)),
    ),
    tx
      .update(projects)
      .set(repointToShared)
      .where(inArray(projects.organizationId, legacyIds)),
    tx
      .update(userOnboardingAnswers)
      .set(repointToShared)
      .where(inArray(userOnboardingAnswers.organizationId, legacyIds)),
    tx
      .update(gscConnections)
      .set(repointToShared)
      .where(inArray(gscConnections.organizationId, legacyIds)),
    tx
      .update(ga4Connections)
      .set(repointToShared)
      .where(inArray(ga4Connections.organizationId, legacyIds)),
    ...(activationRows.length > 0
      ? [
          tx
            .insert(organizationActivationState)
            .values({
              organizationId: SHARED_WORKSPACE_ORGANIZATION_ID,
              ...mergedActivation,
            })
            .onConflictDoUpdate({
              target: organizationActivationState.organizationId,
              set: mergedActivation,
            }),
        ]
      : []),
    // Everything user-visible is repointed above; deleting the legacy orgs
    // cascades away only the per-org leftovers (members, billing status,
    // legacy activation rows).
    tx.delete(organization).where(inArray(organization.id, legacyIds)),
  ]);

  return { mergedWorkspaces: legacyOrgs.length };
}

export const WorkspaceMergeService = {
  countLegacyWorkspaces,
  mergeLegacyWorkspaces,
} as const;
