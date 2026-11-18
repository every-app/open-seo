import { afterEach, expect, test, vi } from "vitest";
import { getClientAuthMode, setRuntimeAuthMode } from "./auth-mode";

afterEach(() => {
  setRuntimeAuthMode(undefined);
  vi.unstubAllEnvs();
});

test("the server's runtime mode wins over the bundle's build-time mode", () => {
  vi.stubEnv("AUTH_MODE", "password");
  expect(getClientAuthMode()).toBe("password");
  setRuntimeAuthMode("local_noauth");
  expect(getClientAuthMode()).toBe("local_noauth");
});
