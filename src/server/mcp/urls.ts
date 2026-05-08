// Dashboard URL builder. The base URL is derived per-request from the incoming
// MCP request's origin so it works correctly across hosted, self-hosted, and
// dev environments without needing an env var.

export function buildDashboardUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string | number | undefined>,
): string {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, baseUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value == null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}
