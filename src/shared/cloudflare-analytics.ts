export const CLOUDFLARE_ANALYTICS_TOOL_NAMES = {
  trafficHealth: "get_cloudflare_traffic_health",
  securityEvents: "get_cloudflare_security_events",
  crawlerAccess: "get_cloudflare_crawler_access",
} as const;

export const CLOUDFLARE_ANALYTICS_TOOL_NAME_LIST = Object.values(
  CLOUDFLARE_ANALYTICS_TOOL_NAMES,
);

export const CLOUDFLARE_TRANSIENT_CAPABILITY_PREFIX = "transient:";
