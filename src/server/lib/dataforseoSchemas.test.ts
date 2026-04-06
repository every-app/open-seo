import { describe, expect, it } from "vitest";
import {
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
});
