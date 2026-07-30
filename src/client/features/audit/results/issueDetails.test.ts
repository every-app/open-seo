import { describe, expect, it } from "vitest";
import { formatIssueDetails } from "@/client/features/audit/results/issueDetails";

describe("formatIssueDetails", () => {
  it("returns null when there is nothing to show", () => {
    expect(formatIssueDetails(null)).toBeNull();
    expect(formatIssueDetails("")).toBeNull();
    expect(formatIssueDetails("not json")).toBeNull();
    expect(formatIssueDetails("[1,2]")).toBeNull();
    expect(formatIssueDetails("{}")).toBeNull();
    expect(formatIssueDetails('{"statusCode":null}')).toBeNull();
    expect(formatIssueDetails('{"messages":[]}')).toBeNull();
  });

  it("keeps scalar details on the compact inline line", () => {
    const details = formatIssueDetails('{"statusCode":404,"length":69}');
    expect(details).toEqual({
      inline: "statusCode: 404 · length: 69",
      lists: [],
      links: [],
    });
  });

  it("still joins redirect hops with arrows", () => {
    const details = formatIssueDetails(
      '{"hops":["https://a.test/","https://b.test/","https://c.test/"]}',
    );
    expect(details?.inline).toBe(
      "hops: https://a.test/ → https://b.test/ → https://c.test/",
    );
    expect(details?.lists).toEqual([]);
  });

  it("joins label arrays with commas rather than arrows", () => {
    const details = formatIssueDetails('{"missing":["image","uploadDate"]}');
    expect(details?.inline).toBe("missing: image, uploadDate");
  });

  it("puts validation messages on their own lines", () => {
    const details = formatIssueDetails(
      JSON.stringify({
        errorCount: 2,
        warningCount: 1,
        types: ["Recipe"],
        messages: [
          "Not valid JSON, so nothing in this block is read by anything",
          '/datePublished: "datePublished" must be an ISO 8601 date',
        ],
      }),
    );

    // The counts stay compact; the messages are the part that must not clip.
    expect(details?.inline).toBe(
      "errorCount: 2 · warningCount: 1 · types: Recipe",
    );
    expect(details?.lists).toEqual([
      {
        label: "messages",
        items: [
          "Not valid JSON, so nothing in this block is read by anything",
          '/datePublished: "datePublished" must be an ISO 8601 date',
        ],
      },
    ]);
  });

  it("turns URL values into links", () => {
    const details = formatIssueDetails(
      JSON.stringify({
        feature: "Recipe",
        missing: ["image"],
        docsUrl:
          "https://developers.google.com/search/docs/appearance/structured-data/recipe",
      }),
    );

    expect(details?.inline).toBe("feature: Recipe · missing: image");
    expect(details?.links).toEqual([
      {
        label: "docsUrl",
        href: "https://developers.google.com/search/docs/appearance/structured-data/recipe",
      },
    ]);
  });

  it("links a canonical URL but leaves other strings inline", () => {
    const details = formatIssueDetails(
      JSON.stringify({
        robotsMeta: "noindex",
        canonicalUrl: "https://example.com/a",
      }),
    );
    expect(details?.inline).toBe("robotsMeta: noindex");
    expect(details?.links).toEqual([
      { label: "canonicalUrl", href: "https://example.com/a" },
    ]);
  });

  it("drops null members inside arrays", () => {
    const details = formatIssueDetails('{"messages":["kept",null,""]}');
    expect(details?.lists[0]?.items).toEqual(["kept"]);
  });

  it("renders a details payload made only of messages", () => {
    const details = formatIssueDetails('{"messages":["only this"]}');
    expect(details?.inline).toBeNull();
    expect(details?.lists[0]?.items).toEqual(["only this"]);
  });
});
