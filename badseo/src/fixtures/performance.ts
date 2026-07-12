import type { Fixture } from "./types";
import { htmlResponse, renderPage } from "../lib";
import { article } from "./helpers";

const CAT = "Performance";

// 24 — slow server response (> 1.5s TTFB) ---------------------------------
const slowResponse: Fixture = {
  path: "/perf/slow-response",
  category: CAT,
  name: "Slow server response",
  summary: "The server waits about 1.7 seconds before sending anything.",
  lesson:
    "A slow time to first byte holds up everything after it and lowers the crawl rate on large sites. Cache or pre-render the HTML.",
  expectedIssues: ["slow-response"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: slowResponse,
        title: "A page with a slow server response",
        metaDescription:
          "This page waits about 1.7 seconds before it responds, past the point where a slow time to first byte starts to hurt.",
        bodyHtml: article({
          h1: "A slow response",
          lede: "The pause before this page loaded was on purpose, and it was too long.",
          sections: [
            {
              h2: "Why time to first byte matters",
              body: "Time to first byte is how long the server takes before it sends anything at all. It sets the floor under every other speed metric. The browser cannot start rendering, and the crawler cannot start reading, until that first byte arrives. A slow time to first byte makes a fast front end feel slow, and at scale it means search engines crawl fewer of your pages per visit.",
            },
            {
              h2: "Common causes and fixes",
              body: "Most slow responses come from doing real work on every request: uncached database queries, slow upstream APIs, or rendering that could have been done ahead of time. The usual fix is to stop building the same HTML over and over. Cache it, generate it in advance, or serve it from the edge, so the server can answer in milliseconds.",
            },
          ],
        }),
      }),
      { delayMs: 1700 },
    ),
};

export const performanceFixtures: Fixture[] = [slowResponse];
