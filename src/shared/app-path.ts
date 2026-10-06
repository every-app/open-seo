/**
 * Public mount point for the application.
 *
 * The value is injected at build time by Vite. Keeping the default empty
 * makes the regular root deployment behave exactly as before.
 */
const configuredBasePath =
  typeof import.meta !== "undefined"
    ? (import.meta.env.OPEN_SEO_BASE_PATH ?? "")
    : "";

function normalizeBasePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "";
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

export const APP_BASE_PATH = normalizeBasePath(configuredBasePath);

/** Build a URL path inside the configured application mount point. */
export function appPath(path = "/"): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!APP_BASE_PATH) return normalizedPath;
  if (normalizedPath === "/") return `${APP_BASE_PATH}/`;
  return `${APP_BASE_PATH}${normalizedPath}`;
}
