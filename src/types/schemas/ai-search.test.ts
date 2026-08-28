import { describe, expect, it } from "vitest";
import {
  decodeModelVersionPairs,
  encodeModelVersionPairs,
} from "./ai-search";

describe("model version URL pairs", () => {
  it("drops unknown providers and versions instead of rejecting the URL", () => {
    expect(
      decodeModelVersionPairs([
        "claude:claude-sonnet-4-6",
        "claude:not-a-model",
        "mistral:mistral-large",
        "no-separator",
      ]),
    ).toEqual({ claude: "claude-sonnet-4-6" });
    expect(decodeModelVersionPairs(["claude:gone-model"])).toBeUndefined();
  });

  it("round-trips a record and returns undefined for an empty one", () => {
    expect(
      encodeModelVersionPairs({
        claude: "claude-sonnet-4-6",
        gemini: "gemini-3.6-flash",
      }),
    ).toEqual(["claude:claude-sonnet-4-6", "gemini:gemini-3.6-flash"]);
    expect(encodeModelVersionPairs({})).toBeUndefined();
    expect(encodeModelVersionPairs(undefined)).toBeUndefined();
  });
});
