import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

// Base-URL handling for user/deployment-configured OpenAI-compatible
// endpoints (Phase Q). Two concerns live here:
//
//   1. Normalization (pure): trim whitespace, strip trailing slashes — never
//      touch the path shape, so "…/v1" stays "/v1" and custom gateways keep
//      their prefixes ("…/api/v1"). Adapters join exactly one slash when they
//      append "/models" or "/chat/completions", so "/v1/v1/" can never occur.
//
//   2. Validation (SSRF): base URLs are user-controlled in self-hosted
//      deployments and must never become a tunnel into private networks or
//      cloud metadata services from the hosted deployment. Hosted mode
//      (AUTH_MODE=hosted) allows public HTTPS only; self-hosted/local runtimes
//      may explicitly opt into HTTP and private addresses (local Ollama,
//      LM Studio, vLLM). Cloud metadata endpoints are blocked everywhere.

export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const lowered = host.toLowerCase();
  if (lowered === "::1" || lowered === "::") return true;
  // IPv4-mapped forms — Node's URL normalizes to hex (::ffff:c0a8:7), while
  // raw input may carry dotted-quad (::ffff:10.0.0.1). Decode both.
  const mappedDotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lowered);
  if (mappedDotted) return isPrivateIpv4(mappedDotted[1]);
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lowered);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isPrivateIpv4(
      `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`,
    );
  }
  // Unique-local fc00::/7 and link-local fe80::/10.
  return /^(f[c-d][0-9a-f]{2}|fe[89ab][0-9a-f]{2}):/.test(lowered);
}

/** Cloud metadata services: unreachable through user Base URLs, period. */
function isCloudMetadataHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "metadata.google.internal" ||
    host === "metadata" ||
    host === "metadata.goog" ||
    host === "169.254.169.254"
  );
}

/**
 * Private/loopback/link-local targets: reachable only when the deployment
 * explicitly opts in (self-hosted/local runtimes).
 */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) return true;
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".internal") ||
    host === "host.docker.internal"
  );
}

export type BaseUrlCheck =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/**
 * Validate a user-supplied OpenAI-compatible Base URL.
 *
 * `allowPrivateNetwork` must come from the deployment mode, not the request:
 * hosted builds pass `false` (public HTTPS only), self-hosted/local runtimes
 * pass `true` so local gateways (Ollama at localhost/host.docker.internal)
 * work when the operator explicitly configures them.
 */
export function checkBaseUrl(
  raw: string,
  options: { allowPrivateNetwork: boolean },
): BaseUrlCheck {
  const normalized = normalizeBaseUrl(raw);
  if (!normalized) {
    return { ok: false, reason: "Base URL is required." };
  }
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return { ok: false, reason: "Base URL is not a valid absolute URL." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, reason: "Base URL must use http or https." };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "Base URL must not embed credentials." };
  }
  const hostIsMetadata = isCloudMetadataHost(parsed.hostname);
  if (hostIsMetadata) {
    return {
      ok: false,
      reason: "Base URL points at a cloud metadata service, which is never allowed.",
    };
  }
  const hostIsPrivate = isPrivateHost(parsed.hostname);
  if (hostIsPrivate && !options.allowPrivateNetwork) {
    return {
      ok: false,
      reason:
        "Base URL points at a private/loopback address, which is not allowed on hosted deployments.",
    };
  }
  if (parsed.protocol === "http:" && !options.allowPrivateNetwork) {
    return {
      ok: false,
      reason: "Base URL must use HTTPS on hosted deployments.",
    };
  }
  return { ok: true, url: normalized };
}

/**
 * Deployment-aware check used by adapters: strict (HTTPS, public hosts only)
 * on the hosted deployment, permissive for explicit self-hosted/local setups.
 */
export async function checkBaseUrlForDeployment(raw: string): Promise<BaseUrlCheck> {
  let allowPrivate = true;
  try {
    allowPrivate = !(await isHostedServerAuthMode());
  } catch {
    // Runtime env unavailable (unit tests): default to the strict posture.
    allowPrivate = false;
  }
  return checkBaseUrl(raw, { allowPrivateNetwork: allowPrivate });
}
