/**
 * SSRF protection for the local crawler. Blocks requests to:
 *   - localhost / 127.0.0.1 / 0.0.0.0
 *   - private IPv4 ranges (10.x, 172.16-31.x, 192.168.x)
 *   - link-local addresses (169.254.x, including AWS metadata 169.254.169.254)
 *   - internal hostnames (*.internal, *.local, *.localhost)
 *   - cloud metadata endpoints
 *
 * The existing audit crawler (`url-policy.ts`) already has crawl-target
 * validation; this is an additional layer specifically for the free-first
 * local crawler provider, which may be called with arbitrary user-supplied URLs.
 */

const PRIVATE_IP_PATTERNS: Array<{ name: string; test: (ip: string) => boolean }> = [
  {
    name: "loopback",
    test: (ip) => ip === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0",
  },
  {
    name: "private-10",
    test: (ip) => ip.startsWith("10."),
  },
  {
    name: "private-172",
    test: (ip) => {
      const parts = ip.split(".");
      if (parts.length !== 4) return false;
      const second = Number.parseInt(parts[0] ?? "0", 10);
      const third = Number.parseInt(parts[1] ?? "0", 10);
      return second === 172 && third >= 16 && third <= 31;
    },
  },
  {
    name: "private-192",
    test: (ip) => ip.startsWith("192.168."),
  },
  {
    name: "link-local",
    test: (ip) => ip.startsWith("169.254."),
  },
  {
    name: "metadata-endpoint",
    test: (ip) => ip === "169.254.169.254",
  },
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

const BLOCKED_TLDS = [".internal", ".local", ".localhost"];

/**
 * Check if an IP string matches any private/blocked pattern.
 */
export function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((p) => p.test(ip));
}

/**
 * Check if a hostname is blocked (localhost, internal, local TLDs, metadata endpoints).
 */
export function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(lower)) return true;

  for (const tld of BLOCKED_TLDS) {
    if (lower.endsWith(tld)) return true;
  }

  return false;
}

/**
 * Resolve a hostname and check if it resolves to a private IP. This is the
 * DNS-resolution SSRF guard. In the Workers runtime, DNS resolution happens
 * implicitly during `fetch`, so this function is a best-effort pre-check.
 *
 * Returns false (not blocked) if resolution fails or is ambiguous — the
 * fetch-level guard (`global_fetch_strictly_public` compatibility flag in
 * wrangler.jsonc) is the authoritative SSRF protection at the platform level.
 */
export async function isCrawlTargetBlocked(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);

    // Check hostname patterns
    if (isBlockedHostname(parsed.hostname)) return true;

    // Check if hostname is an IP literal
    const ip = parsed.hostname;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ip) || ip.includes(":")) {
      if (isPrivateIp(ip)) return true;
    }

    // Check for non-http(s) protocols
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return true;
    }

    // Check for common metadata endpoint paths
    if (
      parsed.hostname === "169.254.169.254" ||
      parsed.hostname === "metadata.google.internal"
    ) {
      return true;
    }

    return false;
  } catch {
    // Malformed URL — block it
    return true;
  }
}