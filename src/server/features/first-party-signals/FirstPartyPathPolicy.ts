const ALWAYS_PRIVATE_PREFIXES = [
  "/api",
  "/_",
  "/admin",
  "/auth",
  "/account",
  "/checkout",
  "/login",
  "/p",
  "/settings",
] as const;

function projectOrigin(domain: string): string | null {
  const value = domain.trim();
  if (!value) return null;
  try {
    const url = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    );
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname)
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  return prefix === "/"
    ? path === "/"
    : path === prefix || path.startsWith(`${prefix}/`);
}

function isAlwaysPrivatePath(path: string): boolean {
  return ALWAYS_PRIVATE_PREFIXES.some((prefix) =>
    pathMatchesPrefix(path.toLowerCase(), prefix),
  );
}

function looksLikeOpaqueIdentifier(segment: string): boolean {
  const compact = segment.replace(/[.\s()+-]/g, "");
  return (
    /^\d{7,15}$/.test(compact) ||
    /^(?:[a-z]{3}\d{3}|[a-z]{2}\d{3}[a-z]{2})$/i.test(compact) ||
    /^(?=[a-z\d_-]*[a-z])(?=[a-z\d_-]*\d)[a-z\d_-]{16,}$/i.test(segment) ||
    /^(?:user|usr|session|sess|order|ord|account|acct)[_-](?=[a-z\d_-]*\d)[a-z\d_-]{4,}$/i.test(
      segment,
    )
  );
}

export function hasSensitivePathIdentifier(path: string): boolean {
  let decoded = path;
  try {
    for (let pass = 0; pass < 8; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    if (/%[0-9a-f]{2}/i.test(decoded)) return true;
    decoded = decoded.normalize("NFKC");
  } catch {
    return true;
  }

  return decoded
    .split("/")
    .filter(Boolean)
    .some((segment) => {
      return (
        segment.includes("@") ||
        looksLikeOpaqueIdentifier(segment) ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          segment,
        )
      );
    });
}

function normalizePath(value: string, origin: string): string | null {
  const trimmed = value.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("?") ||
    trimmed.includes("#") ||
    trimmed.includes("\\") ||
    trimmed.length > 1_024
  ) {
    return null;
  }
  try {
    const url = new URL(trimmed, origin);
    if (url.origin !== origin) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

function normalizeAllowedPath(value: string): string | null {
  const path = normalizePath(value, "https://paths.invalid");
  if (!path || isAlwaysPrivatePath(path) || hasSensitivePathIdentifier(path)) {
    return null;
  }
  return path;
}

export function normalizeAllowedPaths(values: string[]): string[] {
  const normalized = values.map(normalizeAllowedPath);
  if (
    normalized.some((path) => path === null) ||
    new Set(normalized).size !== normalized.length ||
    normalized.length === 0
  ) {
    throw new Error(
      "Every allowed landing path must be unique, public, and identifier-free.",
    );
  }
  return normalized.filter((path): path is string => path !== null);
}

export function normalizePublicLandingPath(input: {
  value: string;
  projectDomain: string;
  allowedPaths: string[];
}): string | null {
  const origin = projectOrigin(input.projectDomain);
  if (!origin) return null;
  const path = normalizePath(input.value, origin);
  if (!path || isAlwaysPrivatePath(path) || hasSensitivePathIdentifier(path)) {
    return null;
  }
  return input.allowedPaths.includes(path) ? path : null;
}
