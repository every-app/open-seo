import { describe, expect, it } from "vitest";
import { AppError, toClientError } from "@/server/lib/errors";

describe("toClientError", () => {
  it.each([
    {
      label: "sanitizes internal detail down to the bare code",
      error: new AppError(
        "INTERNAL_ERROR",
        "DataForSEO task missing billing metadata (path: Invalid input). Response: {...}",
      ),
      message: "INTERNAL_ERROR",
    },
    {
      label: "strips setup-error detail down to the bare code",
      error: new AppError(
        "AUTH_CONFIG_MISSING",
        "TEAM_DOMAIN must be a full https URL like https://your-team.cloudflareaccess.com",
      ),
      message: "AUTH_CONFIG_MISSING",
    },
  ])("$label", ({ error, message }) => {
    expect(toClientError(error).message).toBe(message);
  });
});
