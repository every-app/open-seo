import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  integrationStatus: vi.fn(),
  integrationFetch: vi.fn(),
  connectUrl: vi.fn(),
  env: {} as Record<string, unknown>,
  /** What `gatewayCallFor()` answers: the served request. */
  served: new Request("https://openseo.example.com/"),
}));

vi.mock("@every-app/sdk/server", () => ({
  ConfigurationError: class ConfigurationError extends Error {},
  integrationStatus: mocks.integrationStatus,
  integrationFetch: mocks.integrationFetch,
  connectUrl: mocks.connectUrl,
}));
vi.mock("@/server/lib/gateway-attribution", () => ({
  gatewayCallFor: () => mocks.served,
  gatewayCallForUser: (userId: string) => ({ background: true, userId }),
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

describe("Google through the Every App gateway", () => {
  beforeEach(() => {
    mocks.env.AUTH_MODE = "everyapp";
  });
  afterEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mocks.env)) delete mocks.env[key];
  });

  it("asks the gateway for the served member's google-workspace connection", async () => {
    mocks.integrationStatus.mockResolvedValue({
      requested: true,
      configured: true,
      ready: true,
      flow: "both",
      connectPath: "/connect/google-workspace",
      connection: {
        label: "ben@example.com",
        ready: true,
      },
    });

    const status = await getGatewayGoogleStatus();

    // The member's own connection to OpenSEO: there is no organization
    // connection any more.
    expect(mocks.integrationStatus).toHaveBeenCalledWith({
      env: mocks.env,
      provider: GATEWAY_GOOGLE_PROVIDER,
      for: mocks.served,
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

  it("asks to reconnect when the connection expired or was revoked", async () => {
    mocks.integrationStatus.mockResolvedValue({
      requested: true,
      configured: true,
      ready: true,
      connection: {
        label: "ben@example.com",
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
    expect(await getGatewayGoogleFetch("u1")).toBeNull();
  });

  it("hands out the gateway's fetch on the named member's connection", async () => {
    const gatewayFetch = vi.fn();
    mocks.integrationFetch.mockReturnValue(gatewayFetch);

    // A project's reads name the member who connected its property.
    expect(await getGatewayGoogleFetch("u_connector")).toBe(gatewayFetch);
    expect(mocks.integrationFetch).toHaveBeenCalledWith({
      env: mocks.env,
      provider: GATEWAY_GOOGLE_PROVIDER,
      for: { background: true, userId: "u_connector" },
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
