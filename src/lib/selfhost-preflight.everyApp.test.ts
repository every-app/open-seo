import { describe, expect, it } from "vitest";
import { runSelfhostChecks } from "./selfhost-preflight";

const EVERY_APP = {
  AUTH_MODE: "everyapp",
  EVERYAPP_IDENTITY_PUBLIC_KEYS: "[]",
  EVERYAPP_APP_ID: "openseo",
};

function check(env: Record<string, string>, key: string) {
  return runSelfhostChecks(env).find((item) => item.key === key);
}

describe("preflight behind an Every App gateway", () => {
  it("says the gateway holds Search Console, even with a Google client set", () => {
    for (const env of [
      EVERY_APP,
      {
        ...EVERY_APP,
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
        BETTER_AUTH_SECRET: "x".repeat(64),
      },
    ]) {
      const gsc = check(env, "gsc");
      expect(gsc?.level).toBe("info");
      expect(gsc?.message).toContain("Held by the Every App gateway");
    }
  });

  it("says the gateway holds the provider keys", () => {
    expect(check(EVERY_APP, "auth")?.level).toBe("ok");
    for (const key of ["dataforseo", "ai", "rendering"]) {
      expect(check(EVERY_APP, key)?.level).toBe("info");
    }
  });
});
