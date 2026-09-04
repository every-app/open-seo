import { describe, expect, it } from "vitest";
import {
  CLOUDFLARE_ANALYTICS_TOOL_NAME_LIST,
  CLOUDFLARE_ANALYTICS_TOOL_NAMES,
} from "@/shared/cloudflare-analytics";
import { availableToolNames } from "./AvailableTools";

describe("Cloudflare Analytics tool catalog", () => {
  it("includes every shared Cloudflare Analytics tool exactly once", () => {
    expect(
      CLOUDFLARE_ANALYTICS_TOOL_NAME_LIST.filter((name) =>
        availableToolNames.includes(name),
      ),
    ).toEqual(CLOUDFLARE_ANALYTICS_TOOL_NAME_LIST);
    expect(
      availableToolNames.filter((name) => name.startsWith("get_cloudflare_")),
    ).toEqual(CLOUDFLARE_ANALYTICS_TOOL_NAME_LIST);
    expect(new Set(CLOUDFLARE_ANALYTICS_TOOL_NAME_LIST).size).toBe(3);
    expect(CLOUDFLARE_ANALYTICS_TOOL_NAMES).toEqual({
      trafficHealth: "get_cloudflare_traffic_health",
      securityEvents: "get_cloudflare_security_events",
      crawlerAccess: "get_cloudflare_crawler_access",
    });
  });
});
