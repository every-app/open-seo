import { describe, expect, it } from "vitest";
import { rankSerpLocations } from "./serp-location-search";

const locations = [
  { locationName: "South Portland,Maine,United States", locationType: "City" },
  {
    locationName: "Portland, OR,Oregon,United States",
    locationType: "DMA Region",
  },
  { locationName: "Portland,Oregon,United States", locationType: "City" },
  { locationName: "Portland,Maine,United States", locationType: "City" },
  { locationName: "Portland,Texas,United States", locationType: "City" },
  { locationName: "Catonsville,Maryland,United States", locationType: "City" },
  { locationName: "New City,New York,United States", locationType: "City" },
  { locationName: "New York,New York,United States", locationType: "City" },
  { locationName: "La Crosse,Wisconsin,United States", locationType: "City" },
];

describe("rankSerpLocations", () => {
  it("ranks exact first-segment cities above prefixed names and DMA regions", () => {
    const names = rankSerpLocations("Portland", locations).map(
      (location) => location.locationName,
    );

    expect(names.slice(0, 2)).toEqual([
      "Portland,Maine,United States",
      "Portland,Oregon,United States",
    ]);
    expect(names.indexOf("South Portland,Maine,United States")).toBeGreaterThan(
      names.indexOf("Portland, OR,Oregon,United States"),
    );
  });

  it("expands a US state abbreviation so 'Catonsville MD' matches the canonical row", () => {
    expect(rankSerpLocations("Catonsville MD", locations, "us")).toEqual([
      {
        locationName: "Catonsville,Maryland,United States",
        locationType: "City",
      },
    ]);
  });

  it("prefers the place whose name is the whole query over first-token matches", () => {
    expect(rankSerpLocations("New York", locations)[0]?.locationName).toBe(
      "New York,New York,United States",
    );
  });

  it("never reads the place name itself as a state abbreviation", () => {
    expect(
      rankSerpLocations("La Crosse", locations, "us")[0]?.locationName,
    ).toBe("La Crosse,Wisconsin,United States");
  });
});
