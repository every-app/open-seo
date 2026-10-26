// The contract shared by the two email-gated Cloudflare Access boundaries —
// the persistent preview wildcard (alchemy.preview-access.run.ts) and the
// per-stage self-host gate (alchemy.run.ts). Worker naming, the
// WORKERS_SUBDOMAIN shape, the allowed-emails parsing, and the
// policy/application shape define who gets through which hostnames; keep them
// in one place so the two gates cannot drift. The one copy that can't import
// this module is the shell in .github/workflows/pr-preview.yml — its
// `open-seo-<stage>` naming stays comment-synced (and is backstopped by the
// workflow's Access verify step).

import type * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as CfWorkers from "@distilled.cloud/cloudflare/workers";
import * as ZeroTrust from "@distilled.cloud/cloudflare/zero-trust";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
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

const optionalVar = (name: string) =>
  Config.string(name).pipe(
    Config.withDefault(""),
    Config.map((value) => value.trim()),
  );

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

/** The gate itself: an email allow-policy on a self-hosted Access application. */
export const emailAccessGate = (options: {
  policyId: string;
  applicationId: string;
  policyName: string;
  applicationName: string;
  domain: string;
  emails: string[];
}) =>
  Effect.gen(function* () {
    const allow = yield* Cloudflare.Access.Policy(options.policyId, {
      name: options.policyName,
      decision: "allow",
      include: options.emails.map((email) => ({ email: { email } })),
    });
    return yield* Cloudflare.Access.Application(options.applicationId, {
      type: "self_hosted",
      name: options.applicationName,
      domain: options.domain,
      policies: [allow.policyId],
    });
  });

const accessScopeHint =
  " (if this is a permissions error, re-run `pnpm alchemy login --configure`, answer yes to “Customize OAuth scopes?”, and select access:write alongside the defaults)";

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
 * Self-host auth (AUTH_MODE=cloudflare_access): derive the Access values
 * instead of making the user copy them out of the dashboard. TEAM_DOMAIN is
 * the account's Zero Trust team domain (one API read; the team is created —
 * named after the workers.dev subdomain — if the account has none);
 * POLICY_AUD is the audience tag of an alchemy-provisioned Access
 * application whose allow-policy comes from ACCESS_ALLOWED_EMAILS. Explicit
 * env values always win, so a hand-managed Access application keeps
 * working — set both TEAM_DOMAIN and POLICY_AUD and nothing here provisions.
 */
export const resolveSelfHostAccess = (
  stage: string,
  provision: boolean,
  workersSubdomain: string,
) =>
  Effect.gen(function* () {
    let teamDomain = yield* optionalVar("TEAM_DOMAIN");
    let policyAud: Alchemy.Input<string> = yield* optionalVar("POLICY_AUD");
    if (!provision || (teamDomain && policyAud)) {
      return { teamDomain, policyAud };
    }
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;

    // The workers.dev subdomain names both the Access application's hostname
    // (which must exist before the Worker resource does) and an auto-created
    // Zero Trust team.
    const subdomain = yield* resolveWorkersSubdomain(
      workersSubdomain,
      accessScopeHint,
    );

    if (!teamDomain) {
      const organization = yield* ZeroTrust.listOrganizationsForAccount({
        accountId,
      }).pipe(
        Effect.catchTag("OrganizationNotFound", () => Effect.succeed(null)),
        Effect.catch((error) =>
          Effect.die(
            new Error(
              `Could not read the Zero Trust organization: ${String(error)}${accessScopeHint}`,
            ),
          ),
        ),
      );
      if (organization?.authDomain) {
        teamDomain = `https://${organization.authDomain}`;
      } else {
        // Fresh account with no Zero Trust team: create one, named after the
        // workers.dev subdomain — both are globally unique account handles.
        const teamName = subdomain.replace(/\.workers\.dev$/, "");
        yield* ZeroTrust.createOrganizationForAccount({
          accountId,
          name: teamName,
          authDomain: `${teamName}.cloudflareaccess.com`,
        }).pipe(
          Effect.catch((error) =>
            Effect.die(
              new Error(
                `Could not create the Zero Trust team "${teamName}": ${String(error)}${accessScopeHint}. You can also create one by hand — open https://one.dash.cloudflare.com once to pick a team name (free plan is fine), then redeploy.`,
              ),
            ),
          ),
        );
        yield* Console.log(
          `Created the Zero Trust team "${teamName}" (${teamName}.cloudflareaccess.com) — its login page is where Cloudflare Access sends users to sign in.`,
        );
        teamDomain = `https://${teamName}.cloudflareaccess.com`;
      }
    }

    if (!policyAud) {
      const allowedEmails = yield* requireAllowedEmails(
        "Set ACCESS_ALLOWED_EMAILS to the comma-separated emails allowed through Cloudflare Access — or set TEAM_DOMAIN and POLICY_AUD to manage the Access application yourself.",
      );
      const application = yield* emailAccessGate({
        policyId: "SelfHostAllowUsers",
        applicationId: "SelfHostAccess",
        policyName: `open-seo ${stage} self-host users`,
        applicationName: `open-seo ${stage}`,
        domain: `${workerName(stage)}.${subdomain}`,
        emails: allowedEmails,
      });
      policyAud = application.aud;
    }

    return { teamDomain, policyAud };
  });
