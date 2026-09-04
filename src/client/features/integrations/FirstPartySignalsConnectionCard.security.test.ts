import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("FirstPartySignalsConnectionCard secret handling", () => {
  it("masks the one-time credential and clears the mutation response", async () => {
    const source = await readFile(
      new URL("./FirstPartySignalsConnectionCard.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toMatch(
      /className="[^"]*ph-no-capture[^"]*"\s+data-ph-mask/,
    );
    expect(source).toMatch(
      /mutationFn: async \(\) => \{[\s\S]*setCredential\([\s\S]*onSuccess: \(\) => \{[\s\S]*configure\.reset\(\);/,
    );
    expect(source).not.toMatch(/setCredential\([\s\S]*return result/);
    expect(source).not.toContain("credential ?? configure.data");
  });
});
