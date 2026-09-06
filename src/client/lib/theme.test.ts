import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { themePreferenceInitScript } from "./theme";

describe("theme initialization bridges DaisyUI and design tokens", () => {
  it.each([
    ["light", true, "openseo", "light"],
    ["dark", false, "openseo-dark", "dark"],
    [null, true, "openseo-dark", "dark"],
    [null, false, "openseo", "light"],
  ])(
    "aligns preference %s with OS dark=%s",
    (stored, osDark, daisy, tokens) => {
      const attributes: Record<string, string> = {};
      runInNewContext(themePreferenceInitScript, {
        window: {
          localStorage: { getItem: () => stored },
          matchMedia: () => ({ matches: osDark }),
        },
        document: {
          documentElement: {
            setAttribute: (key: string, value: string) => {
              attributes[key] = value;
            },
          },
        },
      });
      expect(attributes).toEqual({
        "data-theme": daisy,
        "data-bd-theme": tokens,
      });
    },
  );

  it("keeps both layers light if storage is unavailable", () => {
    const attributes: Record<string, string> = {};
    runInNewContext(themePreferenceInitScript, {
      window: {
        localStorage: {
          getItem: () => {
            throw new Error("storage unavailable");
          },
        },
      },
      document: {
        documentElement: {
          setAttribute: (key: string, value: string) => {
            attributes[key] = value;
          },
        },
      },
    });
    expect(attributes).toEqual({
      "data-theme": "openseo",
      "data-bd-theme": "light",
    });
  });
});
