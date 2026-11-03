import * as CfWorkers from "@distilled.cloud/cloudflare/workers";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { workerName } from "./alchemy.access.ts";

/**
 * The account's workers.dev subdomain (`<name>.workers.dev`): the configured
 * WORKERS_SUBDOMAIN when set, else one API read. Every worker hostname this
 * stack deploys derives from it.
 */
export const resolveWorkersSubdomain = (
  configured: string,
  scopeHint: string,
) =>
  Effect.gen(function* () {
    if (configured) return configured;
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;
    const observed = yield* CfWorkers.getSubdomain({ accountId }).pipe(
      Effect.catch((error) =>
        Effect.die(
          new Error(
            `Could not read the workers.dev subdomain: ${String(error)}${scopeHint}`,
          ),
        ),
      ),
    );
    return `${observed.subdomain}.workers.dev`;
  });

/**
 * Auth needs an absolute BETTER_AUTH_URL. Prod sets it explicitly; previews
 * always derive it from the deterministic worker name — a wrong
 * WORKERS_SUBDOMAIN surfaces in CI's post-deploy Access verify step.
 *
 * A self-host deploy serves its own hostname when BETTER_AUTH_URL names one,
 * returned as `selfHostDomain` for the worker to take as a custom domain.
 * Auth trusts exactly BETTER_AUTH_URL's origin (getTrustedOrigins in
 * src/lib/auth.ts), so the served hostname and the auth URL are one setting,
 * not two.
 */
export const resolveAuthUrl = ({
  stage,
  prod,
  authMode,
  workersSubdomain,
  explicitAuthUrl,
}: {
  stage: string;
  prod: boolean;
  authMode: string;
  workersSubdomain: string;
  explicitAuthUrl: string;
}) =>
  Effect.gen(function* () {
    if (prod) {
      if (!explicitAuthUrl) {
        return yield* Effect.die(
          new Error(
            "Set BETTER_AUTH_URL (https://app.openseo.so) in the production workflow.",
          ),
        );
      }
      return { authUrl: explicitAuthUrl, selfHostDomain: undefined };
    }

    if (authMode === "password" && explicitAuthUrl) {
      const hostname = /^https:\/\/([a-z0-9.-]+)\/?$/i.exec(
        explicitAuthUrl,
      )?.[1];
      if (!hostname) {
        return yield* Effect.die(
          new Error(
            `BETTER_AUTH_URL must be an https:// origin with no path (got "${explicitAuthUrl}").`,
          ),
        );
      }
      return {
        authUrl: `https://${hostname}`,
        // workers.dev hostnames are already served by default; only a zone on
        // this account can become a custom domain.
        selfHostDomain: hostname.endsWith(".workers.dev")
          ? undefined
          : hostname,
      };
    }

    if (workersSubdomain) {
      return {
        authUrl: `https://${workerName(stage)}.${workersSubdomain}`,
        selfHostDomain: undefined,
      };
    }

    if (authMode === "password") {
      // Password accounts need the real public URL (session cookies, the
      // OAuth callbacks MCP clients use). The self-host env file sets no
      // WORKERS_SUBDOMAIN, so read it from the account.
      const subdomain = yield* resolveWorkersSubdomain(workersSubdomain, "");
      return {
        authUrl: `https://${workerName(stage)}.${subdomain}`,
        selfHostDomain: undefined,
      };
    }

    if (authMode === "hosted") {
      return yield* Effect.die(
        new Error(
          "Hosted previews derive BETTER_AUTH_URL from WORKERS_SUBDOMAIN — set it to the account's full workers.dev subdomain (shown under Workers & Pages).",
        ),
      );
    }

    // local_noauth / cloudflare_access never read BETTER_AUTH_URL —
    // src/lib/auth.ts uses a placeholder baseURL off the hosted path.
    return { authUrl: "", selfHostDomain: undefined };
  });
