import { describe, expect, it } from "vitest";
import { parseDataforseoLighthousePayload } from "@/server/lib/dataforseoLighthousePayload";
import { readStoredLighthousePayload } from "@/server/lib/lighthousePayload";

describe("parseDataforseoLighthousePayload", () => {
  it("stores only issue-level lighthouse data and key metadata", () => {
    const parsed = parseDataforseoLighthousePayload(
      {
        status_code: 20000,
        status_message: "Ok.",
        tasks: [
          {
            id: "task-1",
            status_code: 20000,
            status_message: "Ok.",
            cost: 0.00425,
            result: [
              {
                requestedUrl: "https://everyapp.dev/",
                finalUrl: "https://everyapp.dev/",
                lighthouseVersion: "12.2.0",
                categories: {
                  performance: {
                    score: 0.54,
                    auditRefs: [{ id: "unused-javascript" }],
                  },
                  accessibility: {
                    score: 0.93,
                    auditRefs: [{ id: "accesskeys" }],
                  },
                  "best-practices": { score: 0.79, auditRefs: [] },
                  seo: { score: 0.92, auditRefs: [] },
                },
                audits: {
                  "unused-javascript": {
                    title: "Reduce unused JavaScript",
                    description: "Trim dead code.",
                    score: 0,
                    scoreDisplayMode: "metricSavings",
                    displayValue: "Potential savings of 188 KiB",
                    numericValue: 193002,
                    details: {
                      overallSavingsMs: 1270,
                      overallSavingsBytes: 193002,
                      items: [
                        {
                          url: "https://cdn.example.com/app.js",
                          wastedBytes: 193002,
                        },
                      ],
                    },
                  },
                  accesskeys: {
                    title: "`[accesskey]` values are unique",
                    description: "Access keys should not conflict.",
                    score: null,
                    scoreDisplayMode: "error",
                  },
                  interactive: {
                    title: "Time to Interactive",
                    description: "Time until the page becomes interactive.",
                    score: 0.13,
                    scoreDisplayMode: "numeric",
                    displayValue: "12.8 s",
                    numericValue: 12800,
                  },
                },
              },
            ],
          },
        ],
      },
      {
        url: "https://everyapp.dev/",
        strategy: "mobile",
      },
    );

    const { report } = readStoredLighthousePayload(JSON.stringify(parsed));

    expect(parsed.metrics.timeToInteractive.displayValue).toBe("12.8 s");
    expect(parsed).toMatchObject({
      version: 2,
      source: "dataforseo-lighthouse",
      hasIssueDetails: true,
      metadata: {
        requestedUrl: "https://everyapp.dev/",
        finalUrl: "https://everyapp.dev/",
        strategy: "mobile",
        lighthouseVersion: "12.2.0",
        taskId: "task-1",
        cost: 0.00425,
      },
      scores: {
        performance: 54,
        accessibility: 93,
        "best-practices": 79,
        seo: 92,
      },
      metrics: {
        timeToInteractive: {
          score: 13,
          displayValue: "12.8 s",
          numericValue: 12800,
        },
      },
    });
    expect(parsed.issues).toHaveLength(1);
    expect(parsed.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ auditKey: "interactive" }),
      ]),
    );
    expect(parsed).not.toHaveProperty("lighthouseResult");

    expect(report.hasIssueDetails).toBe(true);
    expect(report.issues).toEqual([
      expect.objectContaining({
        auditKey: "unused-javascript",
        category: "performance",
        impactMs: 1270,
        impactBytes: 193002,
        title: "Reduce unused JavaScript",
      }),
    ]);
  });

  it("throws when the lighthouse response has no category scores", () => {
    expect(() =>
      parseDataforseoLighthousePayload(
        {
          status_code: 20000,
          status_message: "Ok.",
          tasks: [
            {
              id: "task-1",
              status_code: 20000,
              status_message: "Ok.",
              cost: 0.00425,
              result: [
                {
                  requestedUrl:
                    "https://everyapp.dev/blog/category/cyber-security",
                  finalUrl:
                    "https://everyapp.dev/blog/category/cyber-security/",
                  lighthouseVersion: "12.2.0",
                  categories: {
                    performance: { score: null, auditRefs: [] },
                    accessibility: { score: null, auditRefs: [] },
                    "best-practices": { score: null, auditRefs: [] },
                    seo: { score: null, auditRefs: [] },
                  },
                  audits: {},
                },
              ],
            },
          ],
        },
        {
          url: "https://everyapp.dev/blog/category/cyber-security",
          strategy: "desktop",
        },
      ),
    ).toThrow("DataForSEO Lighthouse returned no category scores");
  });

  it("throws when DataForSEO returns a non-success task status", () => {
    expect(() =>
      parseDataforseoLighthousePayload(
        {
          status_code: 20000,
          status_message: "Ok.",
          tasks: [
            {
              id: "task-1",
              status_code: 40501,
              status_message: "Insufficient credits",
              result: [],
            },
          ],
        },
        {
          url: "https://everyapp.dev/",
          strategy: "mobile",
        },
      ),
    ).toThrow("Insufficient credits");
  });

  it("includes schema details when the payload shape is invalid", () => {
    expect(() =>
      parseDataforseoLighthousePayload(null, {
        url: "https://everyapp.dev/",
        strategy: "mobile",
      }),
    ).toThrow("<root>");
  });

  it("rejects a report whose audit fields are off-spec", () => {
    expect(() =>
      parseDataforseoLighthousePayload(
        {
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              result: [
                {
                  categories: {
                    performance: {
                      score: 0.54,
                      auditRefs: [{ id: "unused-javascript" }],
                    },
                  },
                  audits: {
                    "unused-javascript": { title: 42, score: 0 },
                  },
                },
              ],
            },
          ],
        },
        { url: "https://everyapp.dev/", strategy: "mobile" },
      ),
    ).toThrow("DataForSEO Lighthouse returned an invalid report");
  });

  it("reads audits whose details.items is a single object", () => {
    const parsed = parseDataforseoLighthousePayload(
      {
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                categories: {
                  performance: {
                    score: 0.54,
                    auditRefs: [{ id: "document-latency-insight" }],
                  },
                },
                audits: {
                  "document-latency-insight": {
                    title: "Document request latency",
                    score: 0,
                    scoreDisplayMode: "metricSavings",
                    details: { items: { url: "https://everyapp.dev/" } },
                  },
                },
              },
            ],
          },
        ],
      },
      { url: "https://everyapp.dev/", strategy: "mobile" },
    );

    expect(parsed.issues).toEqual([
      expect.objectContaining({
        auditKey: "document-latency-insight",
        items: ['{"url":"https://everyapp.dev/"}'],
      }),
    ]);
  });
});
