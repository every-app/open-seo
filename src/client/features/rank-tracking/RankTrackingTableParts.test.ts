import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DeviceRankCell, DeviceUrlCell } from "./RankTrackingTableParts";
import type { RankTrackingDeviceResult } from "@/types/schemas/rank-tracking";

describe("DeviceRankCell — disambiguating position '-'", () => {
  it("renders 'Not checked' when keyword has never been checked", () => {
    const result: RankTrackingDeviceResult = {
      position: null,
      previousPosition: null,
      rankingUrl: null,
      serpFeatures: [],
      checkedAt: null,
      status: "not_checked",
    };

    const html = renderToStaticMarkup(
      React.createElement(DeviceRankCell, { result }),
    );
    expect(html).toContain("Not checked");
    expect(html).not.toBe('<span class="text-base-content/40">-</span>');
  });

  it("renders 'No ranking found' when keyword was checked but domain is not in top 100", () => {
    const result: RankTrackingDeviceResult = {
      position: null,
      previousPosition: null,
      rankingUrl: null,
      serpFeatures: ["organic", "ai_overview"],
      checkedAt: "2026-09-11 22:21:35",
      status: "not_ranking",
    };

    const html = renderToStaticMarkup(
      React.createElement(DeviceRankCell, { result }),
    );
    expect(html).toContain("No ranking found");
    expect(html).not.toBe('<span class="text-base-content/40">-</span>');
  });

  it("renders 'Checking…' when check is actively in-flight", () => {
    const result: RankTrackingDeviceResult = {
      position: null,
      previousPosition: null,
      rankingUrl: null,
      serpFeatures: [],
      status: "checking",
    };

    const html = renderToStaticMarkup(
      React.createElement(DeviceRankCell, { result, isChecking: true }),
    );
    expect(html).toContain("Checking…");
  });

  it("renders 'Check failed' when check errored", () => {
    const result: RankTrackingDeviceResult = {
      position: null,
      previousPosition: null,
      rankingUrl: null,
      serpFeatures: [],
      status: "failed",
    };

    const html = renderToStaticMarkup(
      React.createElement(DeviceRankCell, { result }),
    );
    expect(html).toContain("Check failed");
  });

  it("renders '#5' when ranked at position 5 with no previous comparison", () => {
    const result: RankTrackingDeviceResult = {
      position: 5,
      previousPosition: null,
      rankingUrl: "https://powersiment.ae/page",
      serpFeatures: [],
      checkedAt: "2026-09-11 22:21:35",
      status: "ranked",
    };

    const html = renderToStaticMarkup(
      React.createElement(DeviceRankCell, { result }),
    );
    expect(html).toContain("#5");
  });

  it("renders '#10 → #5' with success badge when ranking improved", () => {
    const result: RankTrackingDeviceResult = {
      position: 5,
      previousPosition: 10,
      rankingUrl: "https://powersiment.ae/page",
      serpFeatures: [],
      checkedAt: "2026-09-11 22:21:35",
      status: "ranked",
    };

    const html = renderToStaticMarkup(
      React.createElement(DeviceRankCell, { result }),
    );
    expect(html).toContain("#10");
    expect(html).toContain("#5");
    expect(html).toContain("bg-success/20");
  });

  it("renders '#5 → lost' when previous ranking was dropped", () => {
    const result: RankTrackingDeviceResult = {
      position: null,
      previousPosition: 5,
      rankingUrl: null,
      serpFeatures: [],
      checkedAt: "2026-09-11 22:21:35",
    };

    const html = renderToStaticMarkup(
      React.createElement(DeviceRankCell, { result }),
    );
    expect(html).toContain("#5");
    expect(html).toContain("lost");
  });
});

describe("DeviceUrlCell — URL handling", () => {
  it("renders 'No ranking URL' when checked but not in top 100", () => {
    const result: RankTrackingDeviceResult = {
      position: null,
      previousPosition: null,
      rankingUrl: null,
      serpFeatures: [],
      checkedAt: "2026-09-11 22:21:35",
      status: "not_ranking",
    };

    const html = renderToStaticMarkup(
      React.createElement(DeviceUrlCell, { result, domain: "powersiment.ae" }),
    );
    expect(html).toContain("No ranking URL");
  });

  it("renders URL link when ranking URL exists", () => {
    const result: RankTrackingDeviceResult = {
      position: 1,
      previousPosition: null,
      rankingUrl: "https://powersiment.ae/article",
      serpFeatures: [],
      status: "ranked",
    };

    const html = renderToStaticMarkup(
      React.createElement(DeviceUrlCell, { result, domain: "powersiment.ae" }),
    );
    expect(html).toContain('href="https://powersiment.ae/article"');
    expect(html).toContain("/article");
  });
});
