// The contract shared by the two email-gated Cloudflare Access boundaries —
// the persistent preview wildcard (alchemy.preview-access.run.ts) and the
// per-stage self-host gate (alchemy.run.ts). Worker naming, the
// WORKERS_SUBDOMAIN shape, the allowed-emails parsing, and the
// policy/application shape define who gets through which hostnames; keep them
// in one place so the two gates cannot drift. The one copy that can't import
// this module is the shell in .github/workflows/pr-preview.yml — its
// `open-seo-<stage>` naming stays comment-synced (and is backstopped by the
// workflow's Access verify step).

import * as Cloudflare from "alchemy/Cloudflare";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";

const WORKER_PREFIX = "open-seo";

// The one stage that adopts openseo.so's live hosted resources (unsuffixed
// names, app.openseo.so domain, Postgres). Deliberately not "prod" so a
// self-hoster's stage name can't collide with the adoption path.
export const HOSTED_PROD_STAGE = "hosted-prod";

export const workerName = (stage: string) =>
  stage === HOSTED_PROD_STAGE ? WORKER_PREFIX : `${WORKER_PREFIX}-${stage}`;

// Matches every preview worker hostname; production's unsuffixed worker does
// not match (Access allows one wildcard per dot-label).
export const previewWildcard = (subdomain: string) =>
  `${WORKER_PREFIX}-*.${subdomain}`;

export const readWorkersSubdomain = ({ required }: { required: boolean }) =>
  Effect.gen(function* () {
    const subdomain = (yield* Config.string("WORKERS_SUBDOMAIN").pipe(
      Config.withDefault(""),
    )).trim();
    if (subdomain.endsWith(".workers.dev") || (!subdomain && !required)) {
      return subdomain;
    }
    return yield* Effect.die(
      new Error(
        `Set WORKERS_SUBDOMAIN to the account's full workers.dev subdomain (shown under Workers & Pages)${required ? "." : ", or leave it unset."}`,
      ),
    );
  });

/** Reads ACCESS_ALLOWED_EMAILS; dies with `remedy` when none are set. */
export const requireAllowedEmails = (remedy: string) =>
  Effect.gen(function* () {
    const emails = (yield* Config.string("ACCESS_ALLOWED_EMAILS").pipe(
      Config.withDefault(""),
    ))
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      return yield* Effect.die(new Error(remedy));
    }
    return emails;
  });

/**
 * Reads ACCESS_SERVICE_TOKEN_IDS: the Access service tokens (UUIDs, not Client
 * IDs) allowed through the gate without an interactive login. Optional — an
 * empty list leaves the gate email-only.
 */
export const readServiceTokenIds = () =>
  Effect.gen(function* () {
    return (yield* Config.string("ACCESS_SERVICE_TOKEN_IDS").pipe(
      Config.withDefault(""),
    ))
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  });

/**
 * The gate itself: an email allow-policy on a self-hosted Access application,
 * plus an optional Service Auth policy for machine callers.
 *
 * `domains` is the full set of hostnames the gate covers. Every hostname the
 * worker answers on must be listed — Cloudflare reconciles this app's
 * destinations on each deploy, so a hostname missing here is a hostname that
 * silently loses its Access gate and starts serving unauthenticated requests
 * to the worker.
 */
export const emailAccessGate = (options: {
  policyId: string;
  serviceTokenPolicyId: string;
  applicationId: string;
  policyName: string;
  serviceTokenPolicyName: string;
  applicationName: string;
  domains: readonly [string, ...string[]];
  emails: string[];
  serviceTokenIds?: readonly string[];
}) =>
  Effect.gen(function* () {
    const [primaryDomain] = options.domains;
    const allow = yield* Cloudflare.Access.Policy(options.policyId, {
      name: options.policyName,
      decision: "allow",
      include: options.emails.map((email) => ({ email: { email } })),
    });

    // `non_identity` is the API spelling of the dashboard's "Service Auth"
    // action: match on the token alone and skip the IdP round-trip that a
    // headless client cannot complete.
    const serviceTokenIds = options.serviceTokenIds ?? [];
    const serviceTokens =
      serviceTokenIds.length > 0
        ? yield* Cloudflare.Access.Policy(options.serviceTokenPolicyId, {
            name: options.serviceTokenPolicyName,
            decision: "non_identity",
            include: serviceTokenIds.map((tokenId) => ({
              serviceToken: { tokenId },
            })),
          })
        : null;

    return yield* Cloudflare.Access.Application(options.applicationId, {
      type: "self_hosted",
      name: options.applicationName,
      domain: primaryDomain,
      destinations: options.domains.map((uri) => ({
        type: "public" as const,
        uri,
      })),
      policies: serviceTokens
        ? [allow.policyId, serviceTokens.policyId]
        : [allow.policyId],
    });
  });
