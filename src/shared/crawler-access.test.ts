import { describe, expect, it } from "vitest";
import {
  crawlerHeadersFor,
  shopifyCrawlerHeaders,
} from "@/shared/crawler-access";

const access = {
  host: "store.example.com",
  headers: shopifyCrawlerHeaders("sig1=(...)", "sig1=:abc:"),
  expiresAt: null,
};

describe("crawlerHeadersFor", () => {
  it("sends the signature only to the audited host over https", () => {
    expect(crawlerHeadersFor("https://store.example.com/a", access)).toEqual(
      access.headers,
    );
    for (const url of [
      "https://www.store.example.com/a",
      "http://store.example.com/a",
      "https://cdn.example.com/a",
      "https://evil.test/a",
    ]) {
      expect(crawlerHeadersFor(url, access)).toEqual({});
    }
  });

  it("stops sending the signature once it expires mid-crawl", () => {
    const expired = { ...access, expiresAt: "2020-01-01T00:00:00.000Z" };
    expect(crawlerHeadersFor("https://store.example.com/a", expired)).toEqual(
      {},
    );
  });
});
