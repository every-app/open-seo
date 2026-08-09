import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { Ga4Service } from "@/server/features/ga4/services/Ga4Service";
import { hasSelfHostedGa4Config } from "@/server/features/ga4/oauth-config";
import { createSelfHostedGa4AuthorizationUrl } from "@/server/features/ga4/selfHostedOAuth";
import { captureServerEvent } from "@/server/lib/posthog";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const setPropertySchema = projectScopedSchema.extend({
  accountId: z.string().min(1),
  propertyId: z.string().min(1),
});
const startSelfHostedLinkSchema = z.object({
  callbackURL: z.string().min(1),
});

// Account-level grant check (no project needed) for surfaces like onboarding
// where the user hasn't picked a project yet. The OAuth grant is per-account;
// binding a property to a project happens later in Integrations.
export const getGa4GrantStatus = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    return { connected: await Ga4Service.userHasGrant(context.userId) };
  });

export const getGa4Connection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [connection, currentUserHasGrant, hosted, ga4Configured] =
      await Promise.all([
        Ga4Service.getConnection(context.projectId),
        Ga4Service.userHasGrant(context.userId),
        isHostedServerAuthMode(),
        hasSelfHostedGa4Config(),
      ]);
    return {
      connected: Boolean(connection),
      currentUserHasGrant,
      googleOAuthConfigured: hosted || ga4Configured,
      propertyId: connection?.propertyId ?? null,
      propertyDisplayName: connection?.propertyDisplayName ?? null,
      connectedByEmail: connection?.connectedAccountEmail ?? null,
      connectedAt: connection?.createdAt ?? null,
    };
  });

export const listGa4Properties = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const { accounts } = await Ga4Service.listPropertiesForUserWithGrantStatus(
      context.userId,
      context.projectId,
    );
    return { accounts };
  });

export const setGa4Property = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setPropertySchema)
  .handler(async ({ data, context }) => {
    const connection = await Ga4Service.setProperty({
      projectId: context.projectId,
      organizationId: context.organizationId,
      accountId: data.accountId,
      propertyId: data.propertyId,
      userId: context.userId,
    });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "ga4:property_select",
        organizationId: context.organizationId,
        properties: {
          project_id: context.projectId,
          property_id: data.propertyId,
        },
      }),
    );
    return { connected: true as const, propertyId: connection.propertyId };
  });

export const disconnectGa4 = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    await Ga4Service.disconnect({
      projectId: context.projectId,
      userId: context.userId,
    });
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "ga4:disconnect",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId },
      }),
    );
    return { connected: false as const };
  });

export const startSelfHostedGa4Link = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(startSelfHostedLinkSchema)
  .handler(async ({ data, context }) => {
    const publicOrigin = getPublicOrigin(getRequest());
    const url = await createSelfHostedGa4AuthorizationUrl({
      user: {
        userId: context.userId,
        userEmail: context.userEmail,
      },
      callbackURL: data.callbackURL,
      publicOrigin,
    });

    return { url };
  });
