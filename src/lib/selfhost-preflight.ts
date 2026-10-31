import { AUTH_MODES } from "@/lib/auth-mode";
import {
  looksLikeDataForSeoKey,
  MIN_BETTER_AUTH_SECRET_LENGTH,
  validateTeamDomain,
} from "@/shared/selfhost-checks";

// Startup preflight for self-host containers: validate the environment BEFORE
// the multi-minute build/boot so misconfiguration fails in seconds with the
// exact fix, instead of surfacing minutes later as a generic in-app error.
// "fail" aborts startup; "warn" degrades a feature; "info" is orientation.

type PreflightLevel = "ok" | "info" | "warn" | "fail";

type PreflightItem = {
  // Stable identifier shared with /api/health's check map.
  key: "auth" | "dataforseo" | "gsc" | "ai" | "rendering" | "runtime";
  name: string;
  level: PreflightLevel;
  message: string;
};

type PreflightResult = {
  items: PreflightItem[];
  failed: boolean;
};

type EnvRecord = Record<string, string | undefined>;

function get(env: EnvRecord, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function checkAuthMode(env: EnvRecord, items: PreflightItem[]): void {
  const rawMode = get(env, "AUTH_MODE");

  if (rawMode && !(AUTH_MODES as readonly string[]).includes(rawMode)) {
    items.push({
      key: "auth",
      name: "AUTH_MODE",
      level: "fail",
      message: `"${rawMode}" is not a valid AUTH_MODE. Valid values: ${AUTH_MODES.join(", ")}.`,
    });
    return;
  }

  const mode = rawMode ?? "cloudflare_access";

  if (mode === "local_noauth") {
    items.push({
      key: "auth",
      name: "AUTH_MODE",
      level: "ok",
      message:
        "local_noauth — no auth, single admin user. Do not expose publicly without your own auth in front.",
    });
    return;
  }

  if (mode === "password") {
    const url = get(env, "BETTER_AUTH_URL");
    const secret = get(env, "BETTER_AUTH_SECRET");
    const missing = [
      url ? null : "BETTER_AUTH_URL",
      secret && secret.length >= MIN_BETTER_AUTH_SECRET_LENGTH
        ? null
        : `BETTER_AUTH_SECRET (at least ${MIN_BETTER_AUTH_SECRET_LENGTH} characters)`,
    ].filter(Boolean);
    items.push(
      missing.length
        ? {
            key: "auth",
            name: "AUTH_MODE",
            level: "fail",
            message: `password mode requires ${missing.join(" and ")}.`,
          }
        : {
            key: "auth",
            name: "AUTH_MODE",
            level: "ok",
            message:
              "password — email and password accounts; the first visitor creates the admin account and invitations add the rest",
          },
    );
    return;
  }

  if (mode === "everyapp") {
    // The gateway mints each identity for the Worker's name
    // (EVERYAPP_AUDIENCE); only local dev falls back to the app id.
    const audience =
      get(env, "EVERYAPP_AUDIENCE") ||
      (get(env, "EVERYAPP_DEV") && get(env, "EVERYAPP_APP_ID"));
    const deployed = get(env, "EVERYAPP_IDENTITY_PUBLIC_KEYS") && audience;
    items.push({
      key: "auth",
      name: "AUTH_MODE",
      level: deployed ? "ok" : "fail",
      message: deployed
        ? "everyapp — signed in through the Every App gateway"
        : "everyapp needs the gateway's identity keys and the Worker's name as EVERYAPP_AUDIENCE: deploy with `everyapp deploy`, or run `pnpm dev:everyapp` locally.",
    });
    return;
  }

  if (mode === "hosted") {
    const missing = [
      "BETTER_AUTH_URL",
      "BETTER_AUTH_SECRET",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
    ].filter((name) => !get(env, name));
    items.push(
      missing.length
        ? {
            key: "auth",
            name: "AUTH_MODE",
            level: "fail",
            message: `hosted mode requires ${missing.join(", ")}.`,
          }
        : { key: "auth", name: "AUTH_MODE", level: "ok", message: "hosted" },
    );
    return;
  }

  // cloudflare_access (explicit or defaulted)
  const teamDomain = get(env, "TEAM_DOMAIN");
  const policyAud = get(env, "POLICY_AUD");
  const modeLabel = rawMode
    ? "cloudflare_access"
    : "cloudflare_access (default — AUTH_MODE is unset)";

  if (!teamDomain || !policyAud) {
    const missing = [
      teamDomain ? null : "TEAM_DOMAIN",
      policyAud ? null : "POLICY_AUD",
    ]
      .filter(Boolean)
      .join(" and ");
    items.push({
      key: "auth",
      name: "AUTH_MODE",
      level: "fail",
      message: `${modeLabel} requires ${missing}. See docs/SELF_HOSTING_CLOUDFLARE.md — or set AUTH_MODE=local_noauth for a private, no-auth deployment.`,
    });
    return;
  }

  const teamDomainResult = validateTeamDomain(teamDomain);
  if (!teamDomainResult.ok) {
    items.push({
      key: "auth",
      name: "TEAM_DOMAIN",
      level: "fail",
      message: teamDomainResult.message,
    });
    return;
  }

  items.push({
    key: "auth",
    name: "AUTH_MODE",
    level: "ok",
    message: modeLabel,
  });
}

function checkDataForSeo(env: EnvRecord, items: PreflightItem[]): void {
  if (get(env, "AUTH_MODE") === "everyapp") {
    items.push({
      key: "dataforseo",
      name: "DATAFORSEO_API_KEY",
      level: "info",
      message:
        "Held by the Every App gateway. An admin sets it with `pnpm everyapp secret set DATAFORSEO_API_KEY`.",
    });
    return;
  }
  const key = get(env, "DATAFORSEO_API_KEY");

  if (!key) {
    items.push({
      key: "dataforseo",
      name: "DATAFORSEO_API_KEY",
      level: "warn",
      message:
        "Not set — all SEO data features will be unavailable until it is. It is the base64 of your DataForSEO login:password (NOT the dashboard API key). See docs/DATAFORSEO_API_KEY.md.",
    });
    return;
  }

  if (!looksLikeDataForSeoKey(key)) {
    items.push({
      key: "dataforseo",
      name: "DATAFORSEO_API_KEY",
      level: "warn",
      message:
        "Set, but does not decode as base64 of login:password. If DataForSEO rejects it, encode your account email and API password: printf 'email:password' | base64.",
    });
    return;
  }

  items.push({
    key: "dataforseo",
    name: "DATAFORSEO_API_KEY",
    level: "ok",
    message: "Set",
  });
}

function checkOptionalFeatures(env: EnvRecord, items: PreflightItem[]): void {
  const clientId = get(env, "GOOGLE_CLIENT_ID");
  const clientSecret = get(env, "GOOGLE_CLIENT_SECRET");
  const betterAuthSecret = get(env, "BETTER_AUTH_SECRET");

  if (get(env, "AUTH_MODE") === "everyapp") {
    items.push({
      key: "gsc",
      name: "Search Console",
      level: "info",
      message:
        "Held by the Every App gateway: an owner or admin adds a Google OAuth client once (pasted in Manage workspace → Providers, or `pnpm everyapp secret set GOOGLE_WORKSPACE_CLIENT_ID GOOGLE_WORKSPACE_CLIENT_SECRET`; redirect URI https://<gateway>/connect/google-workspace/callback), and Search Console and Analytics connect through it. OpenSEO's own Google client and callbacks are off in this mode.",
    });
  } else if (clientId || clientSecret) {
    if (!clientId || !clientSecret) {
      items.push({
        key: "gsc",
        name: "Search Console",
        level: "warn",
        message:
          "Only one of GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET is set — both are required.",
      });
    } else if (
      !betterAuthSecret ||
      betterAuthSecret.length < MIN_BETTER_AUTH_SECRET_LENGTH
    ) {
      items.push({
        key: "gsc",
        name: "Search Console",
        level: "warn",
        message: `Google credentials are set, but Search Console stays DISABLED until BETTER_AUTH_SECRET is at least ${MIN_BETTER_AUTH_SECRET_LENGTH} characters (it encrypts stored OAuth tokens).`,
      });
    } else {
      items.push({
        key: "gsc",
        name: "Search Console",
        level: "ok",
        message: "Configured",
      });
    }
  } else {
    items.push({
      key: "gsc",
      name: "Search Console",
      level: "info",
      message:
        "Not configured (optional). See docs/SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md.",
    });
  }

  items.push(
    get(env, "AUTH_MODE") === "everyapp"
      ? {
          key: "ai",
          name: "AI features",
          level: "info",
          message:
            "OpenRouter comes from the Every App gateway. An admin sets it with `pnpm everyapp secret set OPENROUTER_API_KEY`.",
        }
      : get(env, "OPENROUTER_API_KEY")
        ? {
            key: "ai",
            name: "AI features",
            level: "ok",
            message: "OPENROUTER_API_KEY set",
          }
        : {
            key: "ai",
            name: "AI features",
            level: "info",
            message:
              "OPENROUTER_API_KEY not set (optional) — SAM, the in-app SEO agent, is disabled.",
          },
  );

  items.push(
    get(env, "AUTH_MODE") === "everyapp"
      ? {
          key: "rendering",
          name: "JavaScript rendering",
          level: "info",
          message:
            "Context.dev comes from the Every App gateway (optional: audits run unrendered without it). An admin sets it with `pnpm everyapp secret set CONTEXT_API_KEY`.",
        }
      : get(env, "CONTEXT_API_KEY")
        ? {
            key: "rendering",
            name: "JavaScript rendering",
            level: "ok",
            message: "CONTEXT_API_KEY set",
          }
        : {
            key: "rendering",
            name: "JavaScript rendering",
            level: "info",
            message:
              'CONTEXT_API_KEY not set (optional) — on Docker the site audit "Render JavaScript" option is disabled; on Cloudflare, Browser Run renders without a fallback.',
          },
  );
}

// Shared per-feature checks: the Docker preflight prints these at boot and
// /api/health (setup-status.ts) serves the same results at runtime, so the
// two can never drift.
export function runSelfhostChecks(env: EnvRecord): PreflightItem[] {
  const items: PreflightItem[] = [];
  checkAuthMode(env, items);
  checkDataForSeo(env, items);
  checkOptionalFeatures(env, items);
  return items;
}

export function runSelfhostPreflight(env: EnvRecord): PreflightResult {
  const items = runSelfhostChecks(env);

  items.push(
    get(env, "ALLOWED_HOST")
      ? {
          key: "runtime",
          name: "ALLOWED_HOST",
          level: "ok",
          message: `Requests allowed for host ${get(env, "ALLOWED_HOST")}`,
        }
      : {
          key: "runtime",
          name: "ALLOWED_HOST",
          level: "info",
          message:
            'Not set — only localhost access will work. Behind a reverse proxy or tunnel, set ALLOWED_HOST=yourdomain.com or requests are blocked with Vite\'s "Blocked request" page.',
        },
  );

  items.push({
    key: "runtime",
    name: "Scheduled checks",
    level: "info",
    message:
      "Rank-tracking schedules do not run in Docker mode — trigger checks from the Rank Tracking page.",
  });

  return { items, failed: items.some((item) => item.level === "fail") };
}

const LEVEL_BADGES: Record<PreflightLevel, string> = {
  ok: "[ ok ]",
  info: "[info]",
  warn: "[warn]",
  fail: "[FAIL]",
};

export function formatPreflightReport(result: PreflightResult): string {
  const lines = result.items.map(
    (item) => `${LEVEL_BADGES[item.level]} ${item.name}: ${item.message}`,
  );

  lines.push(
    result.failed
      ? "\nPreflight failed — fix the [FAIL] items above and restart. Nothing was started."
      : "\nPreflight passed. The app now builds inside the container (~1-2 minutes on first start before it serves).",
  );

  return lines.join("\n");
}
