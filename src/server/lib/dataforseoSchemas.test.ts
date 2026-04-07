import { describe, expect, it } from "vitest";
import {
  domainRankedKeywordItemSchema,
  parseTaskItems,
  relatedKeywordItemSchema,
  successfulDataforseoTaskSchema,
} from "@/server/lib/dataforseoSchemas";

describe("dataforseoSchemas", () => {
  it("accepts null items for empty successful tasks", () => {
    const task = {
      id: "04042314-1577-0387-0000-33dc4b485cfd",
      status_code: 20000,
      status_message: "Ok.",
      path: ["v3", "dataforseo_labs", "google", "related_keywords", "live"],
      cost: 0.02,
      result_count: 1,
      result: [
        {
          se_type: "google",
          seed_keyword: "canva ai video alternative",
          location_code: 2840,
          language_code: "en",
          total_count: null,
          items_count: 0,
          items: null,
        },
      ],
    };

    const parsedTask = successfulDataforseoTaskSchema.parse(task);

    expect(
      parseTaskItems(
        "google-related-keywords-live",
        parsedTask,
        relatedKeywordItemSchema,
      ),
    ).toEqual([]);
  });

  it("accepts empty ranked keyword tasks with null items", () => {
    const task = {
      id: "04070246-1577-0381-0000-2c56c059f67e",
      status_code: 20000,
      status_message: "Ok.",
      path: ["v3", "dataforseo_labs", "google", "ranked_keywords", "live"],
      cost: 0.01,
      result_count: 1,
      result: [
        {
          se_type: "google",
          target: "openseo.so",
          location_code: 2840,
          language_code: "en",
          total_count: null,
          items_count: 0,
          metrics: null,
          metrics_absolute: null,
          items: null,
        },
      ],
    };

    const parsedTask = successfulDataforseoTaskSchema.parse(task);

    expect(
      parseTaskItems(
        "google-ranked-keywords-live",
        parsedTask,
        domainRankedKeywordItemSchema,
      ),
    ).toEqual([]);
  });
});
