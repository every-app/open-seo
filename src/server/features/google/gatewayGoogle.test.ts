import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  integrationStatus: vi.fn(),
  integrationFetch: vi.fn(),
  connectUrl: vi.fn(),
  gatewayCallFor: vi.fn(),
  env: {} as Record<string, unknown>,
}));

vi.mock("@every-app/sdk/server", () => ({
  ConfigurationError: class ConfigurationError extends Error {},
  integrationStatus: mocks.integrationStatus,
  integrationFetch: mocks.integrationFetch,
  connectUrl: mocks.connectUrl,
}));
vi.mock("@/server/lib/gateway-attribution", () => ({
  gatewayCallFor: mocks.gatewayCallFor,
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getWorkersEnv: async () => mocks.env,
  getOptionalEnvValue: async (name: string) => mocks.env[name],
}));

import { ConfigurationError } from "@every-app/sdk/server";
import {
  GATEWAY_GOOGLE_PROVIDER,
  getGatewayGoogleConnectUrl,
  getGatewayGoogleFetch,
  getGatewayGoogleStatus,
} from "./gatewayGoogle";
import { isGatewayGoogleAvailable } from "./googleAccess";

const served = { background: true, organizationId: "org_1" } as const;

describe("Google through the Every App gateway", () => {
  beforeEach(() => {
    mocks.env.AUTH_MODE = "everyapp";
    mocks.gatewayCallFor.mockReturnValue(served);
  });
  afterEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mocks.env)) delete mocks.env[key];
  });

  it("asks the gateway for google-workspace on behalf of the served call", async () => {
    mocks.integrationStatus.mockResolvedValue({
      requested: true,
      configured: true,
      ready: true,
      flow: "both",
      connectPath: "/connect/google-workspace",
      connection: {
        account: "user",
        label: "ben@example.com",
        scopeSets: ["identity", "search-console.read", "analytics.read"],
        ready: true,
      },
    });

    const status = await getGatewayGoogleStatus();

    // `for: served` joins the call once the published SDK takes it (rc.4).
    expect(mocks.integrationStatus).toHaveBeenCalledWith({
      env: mocks.env,
      provider: GATEWAY_GOOGLE_PROVIDER,
    });
    expect(status).toEqual({
      available: true,
      connected: true,
      reconnect: false,
      label: "ben@example.com",
    });
    expect(await isGatewayGoogleAvailable()).toBe(true);
  });

  it("is available but not connected while the member has no connection", async () => {
    mocks.integrationStatus.mockResolvedValue({
      requested: true,
      configured: true,
      ready: true,
      connection: null,
    });

    expect(await getGatewayGoogleStatus()).toEqual({
      available: true,
      connected: false,
      reconnect: false,
      label: null,
    });
  });

  it("asks to reconnect when the connection lacks a set or expired", async () => {
    mocks.integrationStatus.mockResolvedValue({
      requested: true,
      configured: true,
      ready: true,
      connection: {
        account: "user",
        label: "ben@example.com",
        scopeSets: ["identity"],
        ready: false,
        reconnect: true,
      },
    });

    const status = await getGatewayGoogleStatus();
    expect(status.connected).toBe(false);
    expect(status.reconnect).toBe(true);
  });

  it("is not available when the gateway holds no Google client", async () => {
    mocks.integrationStatus.mockResolvedValue({
      requested: true,
      configured: false,
      ready: false,
    });

    expect((await getGatewayGoogleStatus()).available).toBe(false);
    expect(await isGatewayGoogleAvailable()).toBe(false);
  });

  it("reads as not available, not an error, with no gateway binding in local dev", async () => {
    mocks.integrationStatus.mockRejectedValue(
      new ConfigurationError("no binding"),
    );
    mocks.integrationFetch.mockImplementation(() => {
      throw new ConfigurationError("no binding");
    });

    expect((await getGatewayGoogleStatus()).available).toBe(false);
    expect(await getGatewayGoogleFetch()).toBeNull();
  });

  it("hands out the gateway's fetch for the served call", async () => {
    const gatewayFetch = vi.fn();
    mocks.integrationFetch.mockReturnValue(gatewayFetch);

    expect(await getGatewayGoogleFetch()).toBe(gatewayFetch);
    expect(mocks.integrationFetch).toHaveBeenCalledWith({
      env: mocks.env,
      provider: GATEWAY_GOOGLE_PROVIDER,
      for: served,
    });
  });

  it("sends a Connect click to the gateway's connect page and back", async () => {
    mocks.connectUrl.mockReturnValue(
      "https://apps.example.com/connect/google-workspace?return=https%3A%2F%2Fopen-seo.example.com%2Fintegrations",
    );

    const url = await getGatewayGoogleConnectUrl(
      "https://open-seo.example.com/integrations",
    );

    expect(mocks.connectUrl).toHaveBeenCalledWith({
      env: mocks.env,
      provider: GATEWAY_GOOGLE_PROVIDER,
      returnTo: "https://open-seo.example.com/integrations",
    });
    expect(url).toContain("/connect/google-workspace");
  });
});
