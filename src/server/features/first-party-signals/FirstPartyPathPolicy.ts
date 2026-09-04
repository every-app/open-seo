const ALWAYS_PRIVATE_PREFIXES = [
  "/api",
  "/_",
  "/admin",
  "/auth",
  "/account",
  "/accounts",
  "/billing",
  "/callback",
  "/checkout",
  "/dashboard",
  "/login",
  "/oauth",
  "/order",
  "/orders",
  "/p",
  "/payment",
  "/payments",
  "/profile",
  "/profiles",
  "/register",
  "/session",
  "/sessions",
  "/sign-in",
  "/sign-up",
  "/signin",
  "/signup",
  "/settings",
  "/user",
  "/users",
] as const;

const MAX_PERCENT_DECODE_PASSES = 8;

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

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x1f || codeUnit === 0x7f) return true;
  }
  return false;
}

function canonicalizeSegment(value: string): string | null {
  let decoded = value;
  try {
    let stable = false;
    for (let pass = 0; pass < MAX_PERCENT_DECODE_PASSES; pass += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) {
        stable = true;
        break;
      }
      decoded = next;
    }
    decoded = decoded.normalize("NFKC");
    if (
      !stable ||
      /%[0-9a-f]{2}/i.test(decoded) ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      decoded === "." ||
      decoded === ".." ||
      hasControlCharacter(decoded)
    ) {
      return null;
    }
  } catch {
    return null;
  }

  // Re-encode each segment after decoding so equivalent spellings such as
  // `/pr%69cing` and `/pricing` have one allowlist identity. Uppercase escapes
  // make the representation deterministic across runtimes.
  return encodeURIComponent(decoded)
    .replace(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    )
    .replace(/%[0-9a-f]{2}/gi, (escape) => escape.toUpperCase());
}

function canonicalizePath(value: string): string | null {
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

  const segments = trimmed.slice(1).split("/");
  const canonical = segments.map(canonicalizeSegment);
  if (canonical.some((segment) => segment === null)) return null;
  return `/${canonical.join("/")}`;
}

export function hasSensitivePathIdentifier(path: string): boolean {
  const canonical = canonicalizePath(path);
  if (!canonical) return true;

  return canonical
    .split("/")
    .filter(Boolean)
    .some((segment) => {
      const decoded = decodeURIComponent(segment);
      return (
        decoded.includes("@") ||
        looksLikeOpaqueIdentifier(decoded) ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          decoded,
        )
      );
    });
}

function normalizeAllowedPath(value: string): string | null {
  const path = canonicalizePath(value);
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
  const path = canonicalizePath(input.value);
  if (!path || isAlwaysPrivatePath(path) || hasSensitivePathIdentifier(path)) {
    return null;
  }
  return input.allowedPaths.includes(path) ? path : null;
}
