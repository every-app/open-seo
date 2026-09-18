import { describe, expect, it } from "vitest";
import {
  matchSerpLocation,
  type SerpRegistryLocation,
} from "./serp-location-match";

const loc = (
  locationName: string,
  locationType = "City",
  locationCode = locationName.length,
): SerpRegistryLocation => ({ locationCode, locationName, locationType });

const US: SerpRegistryLocation[] = [
  loc("United States", "Country"),
  loc("Maryland,United States", "State"),
  loc("Catonsville,Maryland,United States"),
  loc("Portland,Oregon,United States"),
  loc("Portland, OR,United States", "DMA Region"),
  loc("Portland,Maine,United States"),
  loc("Seattle,Washington,United States"),
  loc(
    "Seattle–Tacoma International Airport,Washington,United States",
    "Airport",
  ),
  loc("21228,Maryland,United States", "Postal Code"),
];

const BR: SerpRegistryLocation[] = [
  loc("Curitiba,State of Parana,Brazil"),
  loc("Itajai,State of Santa Catarina,Brazil"),
  loc("Itajai,Itajai,State of Santa Catarina,Brazil"),
];

describe("matchSerpLocation", () => {
  it("returns the registry row untouched when the name is already canonical", () => {
    expect(
      matchSerpLocation("Catonsville,Maryland,United States", US, "us"),
    ).toEqual({
      kind: "exact",
      location: US[2],
    });
  });

  it("forgives spacing, case and accents", () => {
    expect(
      matchSerpLocation("seattle, washington, united states", US, "us"),
    ).toMatchObject({
      kind: "resolved",
      via: "normalized",
      location: { locationName: "Seattle,Washington,United States" },
    });
    expect(
      matchSerpLocation("Itajaí, Santa Catarina, Brazil", BR, "br"),
    ).toMatchObject({
      location: { locationName: "Itajai,State of Santa Catarina,Brazil" },
    });
  });

  it("expands a state abbreviation and fills in the missing country", () => {
    expect(matchSerpLocation("Catonsville, MD", US, "us")).toMatchObject({
      kind: "resolved",
      via: "expanded",
      location: { locationName: "Catonsville,Maryland,United States" },
    });
  });

  it("refuses a bare name shared by several places", () => {
    const match = matchSerpLocation("Portland", US, "us");
    expect(match.kind).toBe("ambiguous");
    if (match.kind !== "ambiguous") return;
    expect(match.candidates.slice(0, 2).map((c) => c.locationName)).toEqual([
      "Portland,Maine,United States",
      "Portland,Oregon,United States",
    ]);
  });

  it("prefers the city over a DMA and never picks postal codes or airports", () => {
    expect(matchSerpLocation("Portland metro, Oregon", US, "us")).toMatchObject(
      {
        location: { locationName: "Portland,Oregon,United States" },
      },
    );
    expect(matchSerpLocation("Seattle", US, "us")).toMatchObject({
      location: { locationName: "Seattle,Washington,United States" },
    });
    expect(matchSerpLocation("21228", US, "us").kind).toBe("unresolved");
  });

  it("prefers the whole place over a same-named level nested inside it", () => {
    expect(matchSerpLocation("Itajai", BR, "br")).toMatchObject({
      location: { locationName: "Itajai,State of Santa Catarina,Brazil" },
    });
  });

  it("offers nearby suggestions when nothing matches", () => {
    expect(matchSerpLocation("Catonsville, Delaware", US, "us")).toMatchObject({
      kind: "unresolved",
      suggestions: [{ locationName: "Catonsville,Maryland,United States" }],
    });
  });
});
