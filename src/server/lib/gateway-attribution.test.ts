import type { EveryAppUser } from "@every-app/sdk/server";
import { UnsecuredJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  carryOrganization,
  forOrganization,
  gatewayCallFor,
  serveEveryAppRequest,
} from "./gateway-attribution";

const SHARED = { EVERYAPP_SHARED: "1" };

function user(orgId: string): EveryAppUser {
  return {
    id: "user_ana",
    email: "ana@example.com",
    orgId,
    orgRole: "member",
    channel: "web",
    actor: { sub: "user_ana" },
    scopes: ["*"],
    jti: "jti_1",
  };
}

/** A forwarded request; the SDK verified its token before OpenSEO sees it. */
function forwarded(orgId: string, expiresInSeconds: number) {
  const token = new UnsecuredJWT({ org_id: orgId })
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .encode();
  return new Request("https://openseo.app.everyapp.com/", {
    headers: { "x-everyapp-identity": token },
  });
}

describe("gatewayCallFor", () => {
  it("names nobody outside a request or an organization's work", () => {
    expect(gatewayCallFor(SHARED)).toBeUndefined();
  });

  it("names the organization work runs for, as background work", () => {
    expect(forOrganization("org_a", () => gatewayCallFor(SHARED))).toEqual({
      background: true,
      organizationId: "org_a",
    });
    expect(gatewayCallFor(SHARED, "org_b")).toEqual({
      background: true,
      organizationId: "org_b",
    });
  });

  it("names a fork's own organization for its shared workspace", () => {
    expect(
      gatewayCallFor({ EVERY_APP_ORG_ID: "org_pinned" }, "shared-workspace"),
    ).toEqual({ background: true, organizationId: "org_pinned" });
  });

  it("forwards the request being served, the organization's own included", () => {
    const request = forwarded("org_a", 120);
    serveEveryAppRequest(request, user("org_a"), () => {
      expect(gatewayCallFor(SHARED)).toBe(request);
      expect(forOrganization("org_a", () => gatewayCallFor(SHARED))).toBe(
        request,
      );
    });
  });

  it("refuses a call for another organization while serving a request", () => {
    serveEveryAppRequest(forwarded("org_a", 120), user("org_a"), () => {
      expect(() => gatewayCallFor(SHARED, "org_b")).toThrow(
        /for organization org_b .* request of organization org_a/,
      );
    });
  });

  it("goes on as the request's organization once its identity is about to expire", () => {
    serveEveryAppRequest(forwarded("org_a", 10), user("org_a"), () => {
      expect(gatewayCallFor(SHARED)).toEqual({
        background: true,
        organizationId: "org_a",
      });
    });
  });

  it("forwards nothing for a request with no user", () => {
    serveEveryAppRequest(forwarded("org_a", 120), null, () => {
      expect(gatewayCallFor(SHARED)).toBeUndefined();
    });
  });
});

describe("carryOrganization", () => {
  it("carries the organization, and only it, into code run elsewhere", async () => {
    let step: (() => unknown) | undefined;
    forOrganization("org_a", () => {
      step = carryOrganization(() => gatewayCallFor(SHARED));
    });
    // Run outside the scope, as a Workflow step runs outside run()'s.
    expect(step?.()).toEqual({ background: true, organizationId: "org_a" });

    const nothing = carryOrganization(() => gatewayCallFor(SHARED));
    expect(nothing()).toBeUndefined();
  });
});
