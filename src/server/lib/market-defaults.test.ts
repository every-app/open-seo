import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOptionalEnvValue: vi.fn(
    async (_name: string): Promise<string | undefined> => undefined,
  ),
}));

vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: mocks.getOptionalEnvValue,
}));

import {
  getDefaultMarket,
  resetDefaultMarketForTests,
} from "./market-defaults";

function setEnv(values: Record<string, string | undefined>) {
  mocks.getOptionalEnvValue.mockImplementation(
    async (name: string) => values[name],
  );
}

beforeEach(() => {
  resetDefaultMarketForTests();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("getDefaultMarket", () => {
  it("defaults to the United States when nothing is configured", async () => {
    expect(await getDefaultMarket()).toEqual({
      locationCode: 2840,
      languageCode: "en",
      label: "United States",
    });
  });

  it("resolves Vietnam with its native language when only the location is set", async () => {
    setEnv({ OPENSEO_DEFAULT_LOCATION_CODE: "2704" });
    expect(await getDefaultMarket()).toEqual({
      locationCode: 2704,
      languageCode: "vi",
      label: "Vietnam",
    });
  });

  it("honors an explicit language served for the location", async () => {
    setEnv({
      OPENSEO_DEFAULT_LOCATION_CODE: "2704",
      OPENSEO_DEFAULT_LANGUAGE_CODE: "en",
    });
    expect(await getDefaultMarket()).toMatchObject({
      locationCode: 2704,
      languageCode: "en",
    });
  });

  it("falls back to the location's native language when the pair is unserved", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setEnv({
      OPENSEO_DEFAULT_LOCATION_CODE: "2704",
      OPENSEO_DEFAULT_LANGUAGE_CODE: "ru",
    });
    expect(await getDefaultMarket()).toMatchObject({
      locationCode: 2704,
      languageCode: "vi",
    });
    expect(warn).toHaveBeenCalled();
  });

  it("falls back to the US defaults on an unsupported location code", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setEnv({ OPENSEO_DEFAULT_LOCATION_CODE: "99999" });
    expect(await getDefaultMarket()).toMatchObject({ locationCode: 2840 });
    expect(warn).toHaveBeenCalled();
  });

  it("treats empty strings as unset", async () => {
    setEnv({
      OPENSEO_DEFAULT_LOCATION_CODE: "",
      OPENSEO_DEFAULT_LANGUAGE_CODE: "",
    });
    expect(await getDefaultMarket()).toMatchObject({ locationCode: 2840 });
  });

  it("memoizes the resolved defaults", async () => {
    await getDefaultMarket();
    await getDefaultMarket();
    // Two env vars read exactly once each.
    expect(mocks.getOptionalEnvValue).toHaveBeenCalledTimes(2);
  });
});
