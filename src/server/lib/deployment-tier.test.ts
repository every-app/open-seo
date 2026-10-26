import { describe, expect, it } from "vitest";
import {
  deploymentTierFor,
  deploymentTierLabel,
  scheduledChecksEnabled,
} from "./deployment-tier";

describe("deploymentTierFor", () => {
  it("derives the tier from AUTH_MODE alone outside Every App, whatever DEPLOYMENT_TIER says", () => {
    expect(deploymentTierFor({ AUTH_MODE: "hosted" })).toBe("hosted");
    expect(
      deploymentTierFor({ AUTH_MODE: "hosted", DEPLOYMENT_TIER: "fork" }),
    ).toBe("hosted");
    for (const AUTH_MODE of ["cloudflare_access", "local_noauth", undefined]) {
      expect(
        deploymentTierFor({ AUTH_MODE, DEPLOYMENT_TIER: "first_party" }),
      ).toBe("self_hosted");
    }
  });

  it("makes an unpinned everyapp deployment first party and a pinned one a fork", () => {
    expect(deploymentTierFor({ AUTH_MODE: "everyapp" })).toBe("first_party");
    expect(
      deploymentTierFor({ AUTH_MODE: "everyapp", EVERY_APP_ORG_ID: "org_1" }),
    ).toBe("fork");
  });

  it("lets DEPLOYMENT_TIER name the everyapp tier, and ignores an invalid one", () => {
    expect(
      deploymentTierFor({ AUTH_MODE: "everyapp", DEPLOYMENT_TIER: "fork" }),
    ).toBe("fork");
    expect(
      deploymentTierFor({
        AUTH_MODE: "everyapp",
        EVERY_APP_ORG_ID: "org_1",
        DEPLOYMENT_TIER: "first_party",
      }),
    ).toBe("first_party");
    expect(
      deploymentTierFor({ AUTH_MODE: "everyapp", DEPLOYMENT_TIER: "hosted" }),
    ).toBe("first_party");
  });
});

describe("scheduledChecksEnabled", () => {
  it("runs scheduled checks in the first-party tier unless switched off", () => {
    expect(scheduledChecksEnabled({ AUTH_MODE: "everyapp" })).toBe(true);
    expect(
      scheduledChecksEnabled({
        AUTH_MODE: "everyapp",
        FIRST_PARTY_SCHEDULED_CHECKS: "on",
      }),
    ).toBe(true);
    expect(
      scheduledChecksEnabled({
        AUTH_MODE: "everyapp",
        FIRST_PARTY_SCHEDULED_CHECKS: "off",
      }),
    ).toBe(false);
  });

  it("keeps them running in every other tier, whatever the switch says", () => {
    for (const env of [
      { AUTH_MODE: "hosted", FIRST_PARTY_SCHEDULED_CHECKS: "off" },
      { AUTH_MODE: "cloudflare_access" },
      { AUTH_MODE: "local_noauth" },
      {},
      {
        AUTH_MODE: "everyapp",
        EVERY_APP_ORG_ID: "org_1",
        FIRST_PARTY_SCHEDULED_CHECKS: "off",
      },
    ]) {
      expect(scheduledChecksEnabled(env)).toBe(true);
    }
  });
});

it("labels each tier for whoami", () => {
  expect(deploymentTierLabel("hosted")).toBe("hosted");
  expect(deploymentTierLabel("self_hosted")).toBe("self-hosted");
  expect(deploymentTierLabel("first_party")).toBe("Every App (first party)");
  expect(deploymentTierLabel("fork")).toBe("Every App (fork)");
});
