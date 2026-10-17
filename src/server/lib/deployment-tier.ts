import { getAuthMode } from "@/lib/auth-mode";

/**
 * Who runs this deployment and for whom, separate from how people sign in
 * (AUTH_MODE). Plan limits read this, not the auth mode: behind an Every App
 * gateway there is no Autumn plan to read, so a limit keyed on "hosted or
 * not" would fall to the self-host limits, which assume the operator pays
 * for their own compute.
 *
 * - `hosted`: app.openseo.so (AUTH_MODE=hosted). Autumn plans apply.
 * - `self_hosted`: Cloudflare Access, local or Docker. The operator's own
 *   deployment; no limits beyond the technical ones.
 * - `first_party`: OpenSEO run by Every App for every organization on the
 *   platform, from one Worker and one Postgres database. The gateway holds the
 *   provider keys and meters them; OpenSEO bounds the compute it pays for.
 * - `fork`: an organization's own copy of OpenSEO on Every App, pinned to that
 *   organization (EVERY_APP_ORG_ID).
 *
 * Only AUTH_MODE=everyapp reads DEPLOYMENT_TIER; every other mode derives its
 * tier from AUTH_MODE alone, so setting it elsewhere changes nothing. Unset,
 * an everyapp deployment pinned to one organization is a fork and an unpinned
 * one is first party.
 */
const DEPLOYMENT_TIERS = [
  "hosted",
  "self_hosted",
  "first_party",
  "fork",
] as const;

type DeploymentTier = (typeof DEPLOYMENT_TIERS)[number];

type EveryAppTier = Extract<DeploymentTier, "first_party" | "fork">;

const warnedInvalidTiers = new Set<string>();

function read(env: object, name: string): string | undefined {
  const processValue =
    typeof process !== "undefined" ? process.env?.[name] : undefined;
  if (processValue) return processValue;
  const value: unknown = Reflect.get(env, name);
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

/** The tier for an env record (a Worker's env, or a Durable Object's). */
export function deploymentTierFor(env: object): DeploymentTier {
  const authMode = getAuthMode(read(env, "AUTH_MODE"));
  if (authMode === "hosted") return "hosted";
  if (authMode !== "everyapp") return "self_hosted";

  const declared = read(env, "DEPLOYMENT_TIER");
  if (declared === "first_party" || declared === "fork") return declared;
  if (declared && !warnedInvalidTiers.has(declared)) {
    warnedInvalidTiers.add(declared);
    console.error(
      `Invalid DEPLOYMENT_TIER "${declared}" for AUTH_MODE=everyapp; deriving it from EVERY_APP_ORG_ID. Valid values: first_party, fork.`,
    );
  }
  return read(env, "EVERY_APP_ORG_ID") ? "fork" : "first_party";
}

export function isEveryAppTier(tier: DeploymentTier): tier is EveryAppTier {
  return tier === "first_party" || tier === "fork";
}

// Loaded here rather than through runtime-env so that the many tests which
// mock runtime-env with only the functions they use keep working unchanged.
let workersEnv: Promise<object> | null = null;
function loadWorkersEnv(): Promise<object> {
  workersEnv ??= import("cloudflare:workers").then(
    (workers) =>
      typeof workers.env === "object" && workers.env !== null
        ? workers.env
        : {},
    // Outside workerd (unit tests, scripts) there is no Worker env.
    () => ({}),
  );
  return workersEnv;
}

/** This deployment's tier. */
export async function getDeploymentTier(): Promise<DeploymentTier> {
  return deploymentTierFor(await loadWorkersEnv());
}

/**
 * Whether the five-minute cron starts due rank checks and AI visibility runs.
 *
 * On in every tier. The runs are Workflows, which name the organization that
 * owns them on each gateway call (`x-everyapp-org`, server/lib/
 * gateway-attribution.ts), so the gateway attributes and caps them per
 * organization. FIRST_PARTY_SCHEDULED_CHECKS=off holds them in the
 * first-party tier, the deployment that pays for every organization's
 * scheduled work at once.
 */
export function scheduledChecksEnabled(env: object): boolean {
  if (deploymentTierFor(env) !== "first_party") return true;
  return read(env, "FIRST_PARTY_SCHEDULED_CHECKS") !== "off";
}

/** The label `whoami` and the logs show for the tier. */
export function deploymentTierLabel(tier: DeploymentTier): string {
  switch (tier) {
    case "hosted":
      return "hosted";
    case "self_hosted":
      return "self-hosted";
    case "first_party":
      return "Every App (first party)";
    case "fork":
      return "Every App (fork)";
  }
}
