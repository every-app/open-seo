import { describe, expect, it } from "vitest";
import {
  LABS_LOCATION_OPTIONS,
  LOCATION_OPTIONS,
  formatLocationLabel,
  getIsoCountryCode,
  getKeywordDataProvider,
  getLanguageCode,
  isLabsLocationCode,
  isSupportedLanguageCode,
  isSupportedLocationCode,
} from "./keyword-locations";

describe("keyword locations", () => {
  it("routes Labs-supported countries to labs", () => {
    expect(getKeywordDataProvider(2840)).toBe("labs"); // US
    expect(getKeywordDataProvider(2826)).toBe("labs"); // UK
  });

  it("routes Google-Ads-only countries to google_ads", () => {
    expect(getKeywordDataProvider(2352)).toBe("google_ads"); // Iceland
    expect(isSupportedLocationCode(2352)).toBe(true);
    expect(isLabsLocationCode(2352)).toBe(false);
    expect(getLanguageCode(2352)).toBe("is");
  });

  it("falls back to labs for unknown codes (Labs rejects them upstream)", () => {
    expect(getKeywordDataProvider(999999)).toBe("labs");
    expect(isSupportedLocationCode(999999)).toBe(false);
  });

  it("excludes every Google-Ads-only country from the Labs picker", () => {
    const adsOnly = LOCATION_OPTIONS.filter((option) => option.googleAdsOnly);
    expect(adsOnly.length).toBeGreaterThan(0);
    const labsCodes = new Set(
      LABS_LOCATION_OPTIONS.map((option) => option.code),
    );
    for (const option of adsOnly) {
      expect(labsCodes.has(option.code)).toBe(false);
    }
    expect(LABS_LOCATION_OPTIONS.length + adsOnly.length).toBe(
      LOCATION_OPTIONS.length,
    );
  });

  it("accepts every supported language code and rejects unknown ones", () => {
    // Every per-country default we send is, by construction, a supported code.
    for (const option of LOCATION_OPTIONS) {
      expect(isSupportedLanguageCode(option.languageCode)).toBe(true);
    }
    expect(isSupportedLanguageCode("en")).toBe(true);
    expect(isSupportedLanguageCode("zh-TW")).toBe(true);
    // Non-default codes from the master picker list are valid too (e.g. Hindi).
    expect(isSupportedLanguageCode("hi")).toBe(true);
    // Malformed/unsupported codes DataForSEO would reject as a charged failure.
    expect(isSupportedLanguageCode("english")).toBe(false);
    expect(isSupportedLanguageCode("en-US")).toBe(false);
    expect(isSupportedLanguageCode("zh-tw")).toBe(false);
  });

  it("keeps the picker sorted alphabetically with unique codes", () => {
    const labels = LOCATION_OPTIONS.map((option) => option.label);
    expect(labels).toEqual(labels.toSorted((a, b) => a.localeCompare(b)));
    const codes = LOCATION_OPTIONS.map((option) => option.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("getIsoCountryCode", () => {
  it("lowercases the shortLabel for standard countries", () => {
    expect(getIsoCountryCode(2840)).toBe("us");
    expect(getIsoCountryCode(2036)).toBe("au");
  });

  it("maps the UK display label to its ISO code gb", () => {
    expect(getIsoCountryCode(2826)).toBe("gb");
  });

  it("falls back to us for unknown location codes", () => {
    expect(getIsoCountryCode(999999)).toBe("us");
  });
});

describe("formatLocationLabel", () => {
  it("trims uneven spacing around canonical name segments", () => {
    expect(formatLocationLabel("Portland-Auburn, ME,United States")).toBe(
      "Portland-Auburn, ME, United States",
    );
  });

  it("truncates to maxSegments for compact display", () => {
    expect(formatLocationLabel("Springfield,Illinois,United States", 2)).toBe(
      "Springfield, Illinois",
    );
  });
});
