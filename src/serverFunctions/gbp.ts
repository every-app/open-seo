import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { GbpService } from "@/server/features/gbp/services/GbpService";
import { hasSelfHostedGbpConfig } from "@/server/features/gbp/oauth-config";
import { createSelfHostedGbpAuthorizationUrl } from "@/server/features/gbp/selfHostedOAuth";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const setLocationSchema = projectScopedSchema.extend({
  accountId: z.string().min(1),
  locationName: z.string().min(1),
});
const startSelfHostedLinkSchema = z.object({
  callbackURL: z.string().min(1),
});

// Account-level grant check (no project needed) for surfaces like onboarding
// where the user hasn't picked a project yet. The OAuth grant is per-account;
// binding a location to a project happens later in Integrations.
export const getGbpGrantStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    return { connected: await GbpService.userHasGrant(context.userId) };
  });

export const getGbpConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [connection, currentUserHasGrant, hosted, gbpConfigured] =
      await Promise.all([
        GbpService.getConnection(context.projectId),
        GbpService.userHasGrant(context.userId),
        isHostedServerAuthMode(),
        hasSelfHostedGbpConfig(),
      ]);
    return {
      connected: Boolean(connection),
      currentUserHasGrant,
      googleOAuthConfigured: hosted || gbpConfigured,
      locationName: connection?.locationName ?? null,
      connectedByEmail: connection?.connectedAccountEmail ?? null,
      connectedAt: connection?.createdAt ?? null,
    };
  });

export const listGbpLocations = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [accountList, connection] = await Promise.all([
      GbpService.listAccountsForUserWithGrantStatus(context.userId),
      GbpService.getConnection(context.projectId),
    ]);
    return {
      accounts: accountList.accounts.map((grant) => ({
        accountId: grant.accountId,
        email: grant.email,
        requiresReconnect: grant.requiresReconnect,
        locations: grant.locations.map((location) => ({
          locationName: location.name,
          title: location.title ?? location.name,
          isSelected:
            connection?.gbpAccountId === grant.accountId &&
            connection?.locationName === location.name,
        })),
      })),
    };
  });

export const setGbpLocation = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setLocationSchema)
  .handler(async ({ data, context }) => {
    const connection = await GbpService.setLocation({
      projectId: context.projectId,
      organizationId: context.organizationId,
      accountId: data.accountId,
      locationName: data.locationName,
      userId: context.userId,
    });
    return { connected: true as const, locationName: connection.locationName };
  });

export const disconnectGbp = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    await GbpService.disconnect({
      projectId: context.projectId,
      userId: context.userId,
    });
    return { disconnected: true as const };
  });

export const getGbpLocationInfo = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    return GbpService.getLocationInfo({ projectId: context.projectId });
  });

export const startGbpSelfHostedLink = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(startSelfHostedLinkSchema)
  .handler(async ({ data, context }) => {
    const publicOrigin = getPublicOrigin(getRequest());
    return {
      url: await createSelfHostedGbpAuthorizationUrl({
        user: { userId: context.userId, userEmail: context.userEmail },
        callbackURL: data.callbackURL,
        publicOrigin,
      }),
    };
  });
