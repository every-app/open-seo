import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readPageHtml: vi.fn() }));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/scrape", () => ({ readPageHtml: mocks.readPageHtml }));

const { StructuredDataService } =
  await import("@/server/features/structured-data/services/StructuredDataService");

const RECIPE = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Pavlova",
});

describe("StructuredDataService.validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates pasted markup without touching the network", async () => {
    const validation = await StructuredDataService.validate({ markup: RECIPE });

    expect(mocks.readPageHtml).not.toHaveBeenCalled();
    expect(validation).toMatchObject({ ok: true, source: "supplied markup" });
    if (!validation.ok) throw new Error("expected a result");
    // The missing image is a Recipe requirement, so the spot check has teeth.
    expect(validation.result.errorCount).toBe(1);
  });

  it("fetches and validates a URL", async () => {
    mocks.readPageHtml.mockResolvedValue(
      `<html><head><script type="application/ld+json">${RECIPE}</script></head></html>`,
    );

    const validation = await StructuredDataService.validate({
      url: "https://example.com/pavlova",
    });

    expect(mocks.readPageHtml).toHaveBeenCalledWith(
      "https://example.com/pavlova",
    );
    expect(validation).toMatchObject({
      ok: true,
      source: "https://example.com/pavlova",
    });
  });

  it("reports an unreadable URL rather than clean markup", async () => {
    mocks.readPageHtml.mockResolvedValue(null);

    const validation = await StructuredDataService.validate({
      url: "https://example.com/blocked",
    });

    expect(validation).toEqual({
      ok: false,
      reason: "fetch_failed",
      source: "https://example.com/blocked",
    });
  });

  it("requires one input and refuses two", async () => {
    expect(await StructuredDataService.validate({})).toEqual({
      ok: false,
      reason: "no_input",
    });
    expect(
      await StructuredDataService.validate({ markup: "   ", url: "" }),
    ).toEqual({ ok: false, reason: "no_input" });
    expect(
      await StructuredDataService.validate({
        markup: RECIPE,
        url: "https://example.com/",
      }),
    ).toEqual({ ok: false, reason: "ambiguous_input" });
    expect(mocks.readPageHtml).not.toHaveBeenCalled();
  });

  it("treats whitespace-only markup as no input", async () => {
    const validation = await StructuredDataService.validate({
      markup: "\n\t  ",
    });
    expect(validation).toEqual({ ok: false, reason: "no_input" });
  });
});
