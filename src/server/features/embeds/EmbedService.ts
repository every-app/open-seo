import { hasOrgPermission } from "@/lib/org-permissions";
import { EmbedRepository } from "@/server/features/embeds/EmbedRepository";
import {
  SHARE_TOKEN_PATTERN,
  sharesEnabled,
} from "@/server/features/reports/shareAccess";
import { AppError } from "@/server/lib/errors";
import type { ToolAuthContext } from "@/server/mcp/context";
import { mintShareToken } from "@/shared/report-share";

// Embed links need what report share links need: accounts and a public origin.
// The same gate keeps the two from disagreeing about where a public link works.
async function requireEmbedsEnabled() {
  if (!(await sharesEnabled())) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Embed links are only available on hosted OpenSEO.",
    );
  }
}

async function getLink(projectId: string) {
  return { token: await EmbedRepository.getTokenForProject(projectId) };
}

async function enableLink(projectId: string, userId: string) {
  await requireEmbedsEnabled();
  await EmbedRepository.insertLink({
    projectId,
    token: mintShareToken(),
    userId,
  });
  return getLink(projectId);
}

/** Deleting the row is the revocation; turning it back on mints a new token. */
async function disableLink(projectId: string) {
  await EmbedRepository.deleteLink(projectId);
  return getLink(projectId);
}

/**
 * Who a public request reads as: the member who made the link, in that link's
 * project. Null for every dead end (bad shape, unknown or revoked token,
 * archived project, creator gone from the organization or no longer allowed to
 * manage integrations, embeds off), so the routes answer them all the same way.
 */
async function resolveToken(token: string, baseUrl: string) {
  if (!SHARE_TOKEN_PATTERN.test(token) || !(await sharesEnabled())) return null;
  const link = await EmbedRepository.getLinkByToken(token);
  if (
    !link ||
    link.archivedAt !== null ||
    !link.role ||
    !hasOrgPermission(link.role, { integration: ["manage"] })
  )
    return null;
  const auth: ToolAuthContext = {
    userId: link.userId,
    userEmail: link.userEmail,
    organizationId: link.organizationId,
    role: link.role,
    // First-party, like SAM: the tools run in the app, not for an OAuth client.
    clientId: null,
    scopes: [],
    baseUrl,
  };
  return { projectId: link.projectId, auth };
}

export const EmbedService = {
  getLink,
  enableLink,
  disableLink,
  resolveToken,
};
