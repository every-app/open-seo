import { describe, expect, it } from "vitest";
import { getDomainRouteState } from "./domainRouteState";
import { toScopeSearchParam } from "@/shared/researchScope";

describe("research scope resolution", () => {
  it("derives the scope from the domain input when the URL omits it", () => {
    expect(getDomainRouteState({ domain: "example.com" }).scope).toBe(
      "subdomains",
    );
    expect(getDomainRouteState({ domain: "example.com/blog" }).scope).toBe(
      "subfolder",
    );
  });

  it("migrates the legacy subdomains param", () => {
    expect(
      getDomainRouteState({ domain: "example.com", subdomains: true }).scope,
    ).toBe("subdomains");
    expect(
      getDomainRouteState({ domain: "example.com", subdomains: false }).scope,
    ).toBe("domain");
  });

  it("ignores a scope the domain input cannot support", () => {
    expect(
      getDomainRouteState({ domain: "example.com", scope: "subfolder" }).scope,
    ).toBe("subdomains");
  });

  it("omits the scope param when it matches the input's default", () => {
    expect(toScopeSearchParam("example.com", "subdomains")).toBeUndefined();
    expect(toScopeSearchParam("example.com", "domain")).toBe("domain");
    expect(toScopeSearchParam("example.com/blog", "subfolder")).toBeUndefined();
    expect(toScopeSearchParam("example.com/blog", "exact_url")).toBe(
      "exact_url",
    );
  });
});

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
