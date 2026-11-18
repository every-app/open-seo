import { UnsecuredJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  gatewayCallFor,
  gatewayCallForUser,
  serveEveryAppRequest,
} from "./gateway-attribution";

function served(userId: string, expiresIn = "2m") {
  const token = new UnsecuredJWT({ sub: userId, org_id: "org_a" })
    .setExpirationTime(expiresIn)
    .encode();
  const request = new Request("https://openseo.app.everyapp.com/", {
    headers: { "x-everyapp-identity": token },
  });
  const user = {
    id: userId,
    email: `${userId}@example.com`,
    orgId: "org_a",
    orgRole: "member" as const,
    channel: "web" as const,
    actor: { sub: userId },
    scopes: ["*"],
    jti: "jti_1",
  };
  return { request, user };
}

describe("whose Google connection a call uses (gatewayCallForUser)", () => {
  it("forwards the served request when the connection is that member's own", () => {
    const { request, user } = served("user_ana");
    expect(
      serveEveryAppRequest(request, user, () => gatewayCallForUser("user_ana")),
    ).toBe(request);
  });

  it("names the connecting member's connection when another member is reading", () => {
    const { request, user } = served("user_bo");
    expect(
      serveEveryAppRequest(request, user, () => gatewayCallForUser("user_ana")),
    ).toEqual({ background: true, userId: "user_ana" });
    // The request itself still forwards the reader's identity.
    expect(serveEveryAppRequest(request, user, () => gatewayCallFor())).toBe(
      request,
    );
  });

  it("names the member's connection from work no request started", () => {
    expect(gatewayCallForUser("user_ana")).toEqual({
      background: true,
      userId: "user_ana",
    });
  });

  it("names the member's connection once the served identity is about to expire", () => {
    const { request, user } = served("user_ana", "10s");
    expect(
      serveEveryAppRequest(request, user, () => gatewayCallForUser("user_ana")),
    ).toEqual({ background: true, userId: "user_ana" });
  });
});
