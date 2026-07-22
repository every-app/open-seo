import { describe, expect, it } from "vitest";
import { getDomainRouteState } from "./domainRouteState";

describe("getDomainRouteState", () => {
  it("uses a Labs-backed project market when the URL omits loc", () => {
    const state = getDomainRouteState(
      {},
      { locationCode: 2704, languageCode: "vi" },
    );

    expect(state.defaultLocationCode).toBe(2704);
    expect(state.locationCode).toBe(2704);
    expect(state.sentLocationCode).toBeUndefined();
  });

  it("keeps an explicit Labs-backed URL location", () => {
    const state = getDomainRouteState(
      { loc: 2840 },
      { locationCode: 2704, languageCode: "vi" },
    );

    expect(state.defaultLocationCode).toBe(2704);
    expect(state.locationCode).toBe(2840);
    expect(state.sentLocationCode).toBe(2840);
  });

  it("falls back to US for a Google-Ads-only project market", () => {
    const state = getDomainRouteState(
      {},
      { locationCode: 2352, languageCode: "is" },
    );

    expect(state.defaultLocationCode).toBe(2840);
    expect(state.locationCode).toBe(2840);
    expect(state.sentLocationCode).toBeUndefined();
  });

  it("ignores a Google-Ads-only URL location", () => {
    const state = getDomainRouteState(
      { loc: 2352 },
      { locationCode: 2704, languageCode: "vi" },
    );

    expect(state.defaultLocationCode).toBe(2704);
    expect(state.locationCode).toBe(2704);
    expect(state.sentLocationCode).toBe(2352);
  });
});
