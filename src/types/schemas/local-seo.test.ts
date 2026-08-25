import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ env: {} }));

import {
  createLocalGridConfigSchema,
  updateLocalGridConfigSchema,
} from "./local-seo";

const validInput = {
  projectId: "00000000-0000-4000-8000-000000000001",
  business: {
    placeId: "ChIJ-test",
    name: "Test business",
    latitude: 50.8,
    longitude: -0.3,
  },
  name: "Core area",
  keywords: ["local builder"],
};

describe("createLocalGridConfigSchema", () => {
  it("defaults to manual scans and automatic Google domain selection", () => {
    expect(createLocalGridConfigSchema.parse(validInput)).toMatchObject({
      scheduleInterval: "manual",
      seDomain: null,
    });
  });

  it("rejects charged invalid languages and paid search operators", () => {
    expect(
      updateLocalGridConfigSchema.safeParse({
        projectId: validInput.projectId,
        configId: "00000000-0000-4000-8000-000000000002",
        languageCode: "english",
      }).success,
    ).toBe(false);
    expect(
      createLocalGridConfigSchema.safeParse({
        ...validInput,
        keywords: ["plumber -site:yelp.com"],
      }).success,
    ).toBe(false);
  });
});
